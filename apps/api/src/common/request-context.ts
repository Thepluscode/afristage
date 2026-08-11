import { Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { v4 as uuid } from 'uuid';

// The correlation id lives in ambient async context, never in a call signature.
// That is the whole point: every log line written anywhere under a request —
// a service, a filter, a rejected guard — picks the id up for free, so one
// grep reconstructs the request. Threading it through parameters would mean
// only the call sites that remembered to pass it are traceable.
const storage = new AsyncLocalStorage<{ requestId: string }>();

// A client-supplied id is echoed back and printed on every log line, so it is
// not trusted verbatim. Anything that isn't a short, plain token is REPLACED
// rather than sanitised — a sanitised id could silently collide with another
// request's, which is worse than an unfamiliar one.
const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function normaliseRequestId(raw: unknown): string {
  return typeof raw === 'string' && SAFE_ID.test(raw) ? raw : uuid();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

const logger = new Logger('http');

// Registered as the FIRST middleware in main.ts, ahead of auth and the
// throttler, and it both assigns the id AND writes the completion line.
//
// Both jobs used to live in a Nest interceptor, which runs only once guards
// have passed. The result, measured against a live API: 17 log lines, all of
// them 200. Every 401 and every 404 was invisible — no id on the response and
// no log line at all, so a rejected request could not be found afterwards by
// any means. res.on('finish') fires for every response, whoever ended it.
//
// It also removes a workaround: on the interceptor's error path res.statusCode
// was still the pre-filter default (a rejected login logged as 201), so the
// status had to be dug out of the exception. By 'finish' the filter has run and
// res.statusCode is simply correct.
export function requestContextMiddleware(
  req: { headers: Record<string, unknown>; requestId?: string; method?: string; originalUrl?: string; url?: string; user?: { sub?: string } },
  res: {
    setHeader: (k: string, v: string) => void;
    on: (e: string, cb: () => void) => void;
    statusCode?: number;
    writableFinished?: boolean;
  },
  next: () => void
): void {
  const requestId = normaliseRequestId(req.headers['x-request-id']);
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  const start = Date.now();

  // 'close', not 'finish'. 'finish' only fires when a response was fully sent,
  // so a client that gives up — a slow endpoint, a phone losing signal — would
  // produce no line at all, and abandoned requests are among the most worth
  // seeing. 'close' fires either way; writableFinished tells them apart.
  //
  // requestId is passed explicitly rather than read from the store: this
  // callback is invoked by the socket, not by the request's async chain, so it
  // cannot be relied on to still be inside the context.
  res.on('close', () =>
    logger.log({
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      latencyMs: Date.now() - start,
      userId: req.user?.sub ?? null,
      // A 200 the client never received is not a success; say so rather than
      // letting it read as one in the logs.
      ...(res.writableFinished === false ? { aborted: true } : {})
    })
  );

  storage.run({ requestId }, next);
}
