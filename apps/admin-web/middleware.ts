import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || 'afristage_admin_token';

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

// Gate every page on a *valid* admin session cookie; expired/stale cookies are
// cleared so the login form is reachable and the redirect loop can't form.
export function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const authed = Boolean(token) && !isExpired(token!);
  const { pathname } = req.nextUrl;

  if (pathname === '/login') {
    if (authed) return NextResponse.redirect(new URL('/', req.url));
    const res = NextResponse.next();
    if (token) res.cookies.delete(COOKIE_NAME); // drop a stale cookie sitting on /login
    return res;
  }

  if (!authed) {
    const res = NextResponse.redirect(new URL('/login', req.url));
    if (token) res.cookies.delete(COOKIE_NAME); // expired -> clear it, breaks the / <-> /login loop
    return res;
  }
  return NextResponse.next();
}

// Apply to pages only — not API routes (login/proxy) or static assets.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};
