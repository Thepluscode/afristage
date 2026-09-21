import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.AFRISTAGE_API_BASE || 'http://localhost:3000/api';
const UPSTREAM_TIMEOUT_MS = 10_000;

// Public viewer calls are deliberately allow-listed. This route exists to keep
// room discovery/token requests same-origin; it must not become an unauthenticated
// tunnel into the API.
function allowed(path: string[], method: string) {
  const joined = path.join('/');
  if (method === 'GET' && (joined === 'live-rooms' || /^live-rooms\/[^/]+$/.test(joined) || /^live-rooms\/[^/]+\/top-gifters$/.test(joined))) return true;
  return method === 'POST' && /^live-rooms\/[^/]+\/guest-token$/.test(joined);
}

// Why this limiter exists, given the API already throttles.
//
// The API throttles guest-token at 30/min PER IP. Every browser request arrives
// here first, so the API sees this server's IP for all of them: without a limit
// of our own, the 31st viewer in a minute is refused because of the other 30,
// and one abusive client exhausts the budget for everyone watching. The limit
// has to be applied where the real client is still distinguishable — here.
//
// Forwarding X-Forwarded-For and trusting it at the API would be worse: the API
// is publicly reachable, so a spoofed header would let an attacker pick whose
// budget to spend.
//
// ponytail: in-memory fixed window, per instance. It bounds one client against
// the shared upstream budget, which is the actual failure. Scale this service
// horizontally and each instance carries its own counter — move to Redis then.
const WINDOWS: Record<string, { limit: number; ms: number }> = {
  POST: { limit: 10, ms: 60_000 }, // guest-token: well under the API's 30/min
  GET: { limit: 60, ms: 60_000 } // discovery/polling is chattier and cheaper
};
const hits = new Map<string, { count: number; resetAt: number }>();

// The first hop in X-Forwarded-For is the client as the edge saw it. Absent (a
// direct hit, or a proxy that strips it) we fall back to one shared bucket —
// deliberately: an unattributable flood should still be bounded, not exempt.
function clientKey(req: NextRequest, method: string) {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
  return `${method}:${ip}`;
}

function rateLimited(req: NextRequest, method: string): number | null {
  const window = WINDOWS[method] ?? WINDOWS.GET;
  const key = clientKey(req, method);
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + window.ms });
    // Opportunistic sweep so the map cannot grow without bound across a long
    // uptime; cheap because it only runs when a window rolls over.
    if (hits.size > 5_000) for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    return null;
  }

  entry.count += 1;
  return entry.count > window.limit ? Math.ceil((entry.resetAt - now) / 1000) : null;
}

async function forward(req: NextRequest, path: string[]) {
  if (!allowed(path, req.method)) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const retryAfter = rateLimited(req, req.method);
  if (retryAfter !== null) {
    return NextResponse.json(
      { message: 'Too many requests' },
      { status: 429, headers: { 'retry-after': String(retryAfter), 'cache-control': 'no-store' } }
    );
  }

  const url = `${API_BASE}/${path.join('/')}${req.nextUrl.search || ''}`;
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method,
      headers: { 'content-type': req.headers.get('content-type') || 'application/json' },
      body: hasBody ? await req.text() : undefined,
      cache: 'no-store',
      // Without this a stalled API holds this route's connection open until the
      // platform kills it, turning one slow upstream into an exhausted server.
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
  } catch {
    return NextResponse.json({ message: 'Upstream unavailable' }, { status: 502, headers: { 'cache-control': 'no-store' } });
  }

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' }
  });
}

type Ctx = { params: { path: string[] } };
export const GET = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path);
export const POST = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path);
