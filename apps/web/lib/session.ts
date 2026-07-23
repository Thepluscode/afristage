// User session cookie handling for the login/register/logout/proxy route handlers
// — separate cookie names from admin-web so the two apps never collide. Two
// httpOnly cookies: a short-lived access JWT + a long-lived refresh JWT, so an
// expired access token is silently refreshed instead of bouncing the viewer to
// /login mid-watch. Mirrors admin-web/lib/session.ts (the #182 pattern).
export const ACCESS_COOKIE = process.env.WEB_COOKIE_NAME || 'afristage_web_token';
export const REFRESH_COOKIE = process.env.WEB_REFRESH_COOKIE_NAME || 'afristage_web_refresh';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

type CookieStore = { set: (name: string, value: string, opts: Record<string, unknown>) => void };

/** Persist the token pair as httpOnly cookies so the browser never sees the JWT. */
export function setSessionCookies(
  store: CookieStore,
  accessToken: string,
  refreshToken: string | undefined,
  secure: boolean
) {
  const base = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: THIRTY_DAYS };
  store.set(ACCESS_COOKIE, accessToken, base);
  if (refreshToken) store.set(REFRESH_COOKIE, refreshToken, base);
}

/** Clear both session cookies (logout). maxAge 0 expires them immediately. */
export function clearSessionCookies(store: CookieStore, secure: boolean) {
  const base = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: 0 };
  store.set(ACCESS_COOKIE, '', base);
  store.set(REFRESH_COOKIE, '', base);
}
