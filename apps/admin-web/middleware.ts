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

  // Public surfaces: the marketing site (incl. /site/security) and the standard
  // vulnerability-disclosure path bypass the auth gate. NOTE: /security stays
  // GATED — it's the admin security screen, not the public policy page.
  if (
    pathname === '/site' ||
    pathname.startsWith('/site/') ||
    pathname.startsWith('/.well-known/')
  ) {
    return NextResponse.next();
  }

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
    // Preserve where they were so re-auth returns them here, not the dashboard.
    const login = new URL('/login', req.url);
    const dest = pathname + req.nextUrl.search;
    if (dest !== '/') login.searchParams.set('next', dest);
    return clearStale(NextResponse.redirect(login));
  }
  return NextResponse.next();
}

// Apply to pages only — not API routes (login/proxy) or static assets.
// icon.svg has to be excluded explicitly: Next serves the app-router icon from
// the app directory, so without this the browser's icon request is redirected
// to /login and the tab shows no icon at all — while stuffing "next=/icon.svg"
// into the login URL, which then decides where the operator lands after signing
// in. An asset request must never influence that.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml).*)']
};
