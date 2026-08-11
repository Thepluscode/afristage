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

// Registered as the FIRST middleware in main.ts, ahead of auth and the
// throttler. Interceptors run only after guards pass, which is why the old
// interceptor-generated id was missing from exactly the responses you most
// want to trace: 401s and 429s.
export function requestContextMiddleware(
  req: { headers: Record<string, unknown>; requestId?: string },
  res: { setHeader: (k: string, v: string) => void },
  next: () => void
): void {
  const requestId = normaliseRequestId(req.headers['x-request-id']);
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  storage.run({ requestId }, next);
}
