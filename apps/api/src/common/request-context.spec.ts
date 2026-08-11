import { Logger } from '@nestjs/common';
import { getRequestId, normaliseRequestId, requestContextMiddleware } from './request-context';

// Captures the 'finish' listener so a test can end the response itself.
const mkRes = (statusCode = 200) => {
  const listeners: Record<string, () => void> = {};
  const res: any = {
    setHeader: jest.fn(),
    on: (e: string, cb: () => void) => {
      listeners[e] = cb;
    },
    statusCode,
    writableFinished: true,
    // A response that completed: node emits 'close' after 'finish'.
    finish: () => listeners.close?.(),
    // A client that gave up: 'close' fires with writableFinished still false.
    abort: () => {
      res.writableFinished = false;
      listeners.close?.();
    }
  };
  return res;
};

const run = (headers: Record<string, unknown>) => {
  const req: any = { headers };
  const res = mkRes();
  let seenInside: string | undefined;
  requestContextMiddleware(req, res, () => {
    seenInside = getRequestId();
  });
  return { req, res, seenInside };
};

describe('normaliseRequestId', () => {
  it('keeps a well-formed client id', () => {
    expect(normaliseRequestId('abc-123_XY.z')).toBe('abc-123_XY.z');
  });

  it.each([
    ['missing', undefined],
    ['non-string', 42],
    ['empty', ''],
    ['with a space', 'has space'],
    // Would forge a second log line in a line-delimited log if it were echoed verbatim.
    ['with a newline', 'a\nlevel=error'],
    ['with a quote', 'a"b'],
    ['over 64 chars', 'x'.repeat(65)]
  ])('replaces an id that is %s', (_label, raw) => {
    const id = normaliseRequestId(raw);
    expect(id).not.toBe(raw);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('accepts exactly 64 chars (boundary)', () => {
    const id = 'y'.repeat(64);
    expect(normaliseRequestId(id)).toBe(id);
  });

  it('never reuses a generated id', () => {
    expect(normaliseRequestId(undefined)).not.toBe(normaliseRequestId(undefined));
  });
});

describe('requestContextMiddleware', () => {
  it('reuses a valid inbound id on the request, the response and the context', () => {
    const { req, res, seenInside } = run({ 'x-request-id': 'rid-1' });
    expect(req.requestId).toBe('rid-1');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'rid-1');
    expect(seenInside).toBe('rid-1');
  });

  it('generates one when the client sends none', () => {
    const { req, res, seenInside } = run({});
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
    expect(seenInside).toBe(req.requestId);
  });

  it('does not echo an unsafe client id back', () => {
    const { req, res } = run({ 'x-request-id': 'bad\nid' });
    expect(req.requestId).not.toContain('\n');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
  });

  // The value of ambient context is that async work keeps the id without being
  // handed it. If this ever breaks, the id survives only on synchronous paths
  // and most service-level log lines silently lose it.
  it('keeps the id across await boundaries', async () => {
    const req: any = { headers: { 'x-request-id': 'rid-async' } };
    const res = mkRes();
    const seen = await new Promise<string | undefined>((resolve) => {
      requestContextMiddleware(req, res, async () => {
        await new Promise((r) => setTimeout(r, 1));
        resolve(getRequestId());
      });
    });
    expect(seen).toBe('rid-async');
  });

  it('isolates concurrent requests from each other', async () => {
    const capture = (id: string) =>
      new Promise<string | undefined>((resolve) => {
        requestContextMiddleware({ headers: { 'x-request-id': id } } as any, mkRes() as any, async () => {
          await new Promise((r) => setTimeout(r, 5));
          resolve(getRequestId());
        });
      });
    await expect(Promise.all([capture('a1'), capture('b2')])).resolves.toEqual(['a1', 'b2']);
  });

  it('returns undefined outside any request', () => {
    expect(getRequestId()).toBeUndefined();
  });
});

// The regression this whole change exists for. Measured against a live API, the
// old interceptor produced 17 log lines and every one was a 200: guards reject
// before an interceptor runs, so 401s and 404s were logged nowhere at all.
describe('completion logging', () => {
  const drive = (statusCode: number, req: any = { headers: {} }) => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const res = mkRes(statusCode);
    requestContextMiddleware(req, res, () => {});
    res.finish();
    const entry = log.mock.calls[0]?.[0];
    log.mockRestore();
    return entry as any;
  };

  it('logs a successful request with id, method, path, status, latency and user', () => {
    const entry = drive(200, { headers: { 'x-request-id': 'ok-1' }, method: 'GET', url: '/x', user: { sub: 'u1' } });
    expect(entry).toMatchObject({ requestId: 'ok-1', method: 'GET', path: '/x', statusCode: 200, userId: 'u1' });
    expect(typeof entry.latencyMs).toBe('number');
  });

  it.each([401, 403, 404, 429, 500])('logs a %s — the statuses the interceptor never saw', (status) => {
    const entry = drive(status, { headers: { 'x-request-id': `rej-${status}` }, method: 'GET', originalUrl: '/wallet/me' });
    expect(entry).toMatchObject({ requestId: `rej-${status}`, statusCode: status, path: '/wallet/me', userId: null });
  });

  it('prefers originalUrl over url so the global /api prefix is not lost', () => {
    expect(drive(200, { headers: {}, method: 'GET', originalUrl: '/api/health', url: '/health' }).path).toBe('/api/health');
  });

  it('does not log until the response actually closes', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    requestContextMiddleware({ headers: {} } as any, mkRes(), () => {});
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('does not mark a completed response as aborted', () => {
    expect(drive(200)).not.toHaveProperty('aborted');
  });

  // Listening on 'finish' would drop this line entirely: 'finish' fires only for
  // a response that was fully sent, so a client giving up on a slow endpoint —
  // a phone losing signal — vanished from the logs. Verified against real node:
  // on abort, finish never fires, close does, writableFinished stays false.
  it('logs a request the client abandoned, and marks it aborted', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const res = mkRes(200);
    requestContextMiddleware({ headers: { 'x-request-id': 'gave-up' }, method: 'GET', url: '/slow' } as any, res, () => {});
    res.abort();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'gave-up', path: '/slow', aborted: true }));
    log.mockRestore();
  });
});
