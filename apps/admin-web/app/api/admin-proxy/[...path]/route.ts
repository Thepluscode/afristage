import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, setSessionCookies } from '../../../../lib/session';

const API_BASE = process.env.AFRISTAGE_API_BASE || 'http://localhost:3000/api';

// Refresh tokens ROTATE server-side (a used token is superseded), so two
// concurrent proxied requests must not both spend the same cookie — the loser
// would be rejected and bounce the admin to /login. Single-flight per token.
const inflightRefresh = new Map<string, Promise<{ accessToken: string; refreshToken: string } | null>>();

// Exchange the refresh cookie for a fresh token pair, persist both, and return
// the new access token. Returns null if there's no refresh cookie or it's rejected.
async function tryRefresh(secure: boolean): Promise<string | null> {
  const refreshToken = cookies().get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;
  let flight = inflightRefresh.get(refreshToken);
  if (!flight) {
    flight = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store'
    })
      .then(async (res) => (res.ok ? ((await res.json().catch(() => null)) as any) : null))
      .then((data) => (data?.accessToken ? data : null));
    inflightRefresh.set(refreshToken, flight);
    flight.finally(() => inflightRefresh.delete(refreshToken));
  }
  const data = await flight;
  if (!data) return null;
  setSessionCookies(cookies(), data.accessToken, data.refreshToken, secure);
  return data.accessToken;
}

// All admin data flows through here: the backend JWT lives in an httpOnly cookie
// and is attached server-side, so the browser never sees it. An expired access
// token is transparently refreshed (once) before the caller ever sees a 401.
async function proxy(req: NextRequest, path: string[]) {
  const secure = req.nextUrl.protocol === 'https:' || process.env.ADMIN_COOKIE_SECURE === 'true';
  const url = `${API_BASE}/${path.join('/')}${req.nextUrl.search || ''}`;
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const body = hasBody ? await req.text() : undefined;

  const call = (tok: string) =>
    fetch(url, {
      method: req.method,
      headers: {
        authorization: `Bearer ${tok}`,
        'content-type': req.headers.get('content-type') || 'application/json'
      },
      body,
      cache: 'no-store'
    });

  let token = cookies().get(ACCESS_COOKIE)?.value;
  if (!token) {
    token = (await tryRefresh(secure)) ?? undefined;
    if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let res = await call(token);
  if (res.status === 401) {
    const refreshed = await tryRefresh(secure);
    if (refreshed) res = await call(refreshed);
  }

  // 204/205/304 must carry no body — NextResponse throws on a non-null body here.
  if (res.status === 204 || res.status === 205 || res.status === 304) {
    return new NextResponse(null, { status: res.status });
  }

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') || 'application/json' }
  });
}

type Ctx = { params: { path: string[] } };
export const GET = (req: NextRequest, ctx: Ctx) => proxy(req, ctx.params.path);
export const POST = (req: NextRequest, ctx: Ctx) => proxy(req, ctx.params.path);
export const PATCH = (req: NextRequest, ctx: Ctx) => proxy(req, ctx.params.path);
export const DELETE = (req: NextRequest, ctx: Ctx) => proxy(req, ctx.params.path);
