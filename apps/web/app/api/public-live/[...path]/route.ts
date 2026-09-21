import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.AFRISTAGE_API_BASE || 'http://localhost:3000/api';

// Public viewer calls are deliberately allow-listed. This route exists to keep
// room discovery/token requests same-origin; it must not become an unauthenticated
// tunnel into the API.
function allowed(path: string[], method: string) {
  const joined = path.join('/');
  if (method === 'GET' && (joined === 'live-rooms' || /^live-rooms\/[^/]+$/.test(joined) || /^live-rooms\/[^/]+\/top-gifters$/.test(joined))) return true;
  return method === 'POST' && /^live-rooms\/[^/]+\/guest-token$/.test(joined);
}

async function forward(req: NextRequest, path: string[]) {
  if (!allowed(path, req.method)) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const url = `${API_BASE}/${path.join('/')}${req.nextUrl.search || ''}`;
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const res = await fetch(url, {
    method: req.method,
    headers: { 'content-type': req.headers.get('content-type') || 'application/json' },
    body: hasBody ? await req.text() : undefined,
    cache: 'no-store'
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' }
  });
}

type Ctx = { params: { path: string[] } };
export const GET = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path);
export const POST = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path);
