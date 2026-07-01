import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './lib/session';

// UX-only expiry check: decode the JWT payload (no signature verification — the
// backend remains the real auth/RBAC boundary) and treat a past `exp` as logged
// out. Without this, an expired cookie reads as "authed" and bounces the user
// between / and /login forever.
function isExpired(token: string): boolean {
  const parts = token.split('.');
  if (parts.length < 2) return true;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(b64));
    if (typeof payload.exp !== 'number') return false; // no exp -> don't force logout
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true; // unparseable token -> treat as invalid
  }
}

// Authed if EITHER token is still valid. An expired access token with a live
// refresh token is still a valid session — the proxy refreshes it on the first
// data call — so let the page through instead of redirecting to /login.
export function middleware(req: NextRequest) {
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const authed = (Boolean(access) && !isExpired(access!)) || (Boolean(refresh) && !isExpired(refresh!));
  const { pathname } = req.nextUrl;

  const clearStale = (res: NextResponse) => {
    if (access) res.cookies.delete(ACCESS_COOKIE);
    if (refresh) res.cookies.delete(REFRESH_COOKIE);
    return res;
  };

  if (pathname === '/login') {
    if (authed) return NextResponse.redirect(new URL('/', req.url));
    return clearStale(NextResponse.next()); // drop stale cookies sitting on /login
  }

  if (!authed) {
    return clearStale(NextResponse.redirect(new URL('/login', req.url)));
  }
  return NextResponse.next();
}

// Apply to pages only — not API routes (login/proxy) or static assets.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};
