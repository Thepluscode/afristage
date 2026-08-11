import { trace } from '@opentelemetry/api';
import { JsonLogger } from './json-logger';
import { requestContextMiddleware } from './request-context';

describe('JsonLogger', () => {
  let out: jest.SpyInstance;
  let err: jest.SpyInstance;
  beforeEach(() => {
    out = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    err = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes a string message with context + details to stdout', () => {
    new JsonLogger().log('hello', { a: 1 }, 'Ctx');
    const entry = JSON.parse(out.mock.calls[0][0] as string);
    expect(entry).toMatchObject({ level: 'log', message: 'hello', context: 'Ctx' });
    expect(entry.details).toBeDefined();
  });

  it('spreads object messages into flat fields', () => {
    new JsonLogger().warn({ requestId: 'r1', statusCode: 200 });
    expect(JSON.parse(out.mock.calls[0][0] as string)).toMatchObject({ level: 'warn', requestId: 'r1', statusCode: 200 });
  });

  it('routes error level to stderr', () => {
    new JsonLogger().error('boom');
    expect(err).toHaveBeenCalled();
    expect(out).not.toHaveBeenCalled();
  });

  it('supports debug and verbose levels', () => {
    const l = new JsonLogger();
    l.debug('d');
    l.verbose('v');
    expect(out).toHaveBeenCalledTimes(2);
  });

  // The point of the ambient context: a log line written deep inside a service,
  // which knows nothing about the request, still carries the correlation id.
  it('stamps the ambient requestId onto a line that never mentions it', () => {
    const res: any = { setHeader: jest.fn(), on: jest.fn(), statusCode: 200 };
    requestContextMiddleware({ headers: { 'x-request-id': 'rid-9' } } as any, res, () => {
      new JsonLogger().log('deep inside a service');
    });
    expect(JSON.parse(out.mock.calls[0][0] as string)).toMatchObject({ requestId: 'rid-9', message: 'deep inside a service' });
  });

  it('omits requestId and traceId when there is no request and no active span', () => {
    new JsonLogger().log('boot');
    const entry = JSON.parse(out.mock.calls[0][0] as string);
    expect(entry).not.toHaveProperty('requestId');
    expect(entry).not.toHaveProperty('traceId');
  });

  it('stamps traceId when a span is active, linking the line to its trace', () => {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue({ spanContext: () => ({ traceId: 'tr-1' }) } as any);
    new JsonLogger().log('inside a span');
    expect(JSON.parse(out.mock.calls[0][0] as string)).toMatchObject({ traceId: 'tr-1' });
  });
});
