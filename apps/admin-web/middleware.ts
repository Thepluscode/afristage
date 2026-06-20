import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || 'afristage_admin_token';

// Gate every page on the admin session cookie; unauthenticated users go to /login.
// (RBAC itself is enforced by the backend; this is just the redirect for UX.)
export function middleware(req: NextRequest) {
  const isAuthed = Boolean(req.cookies.get(COOKIE_NAME)?.value);
  const { pathname } = req.nextUrl;

  if (pathname === '/login') {
    if (isAuthed) return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }

  if (!isAuthed) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

// Apply to pages only — not API routes (login/proxy) or static assets.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};
