// Shared admin session cookie handling for the login/logout/proxy route handlers
// and the middleware. Two httpOnly cookies: a short-lived access JWT and a
// long-lived refresh JWT, so an expired access token is silently refreshed
// instead of bouncing the operator to /login mid-task.
export const ACCESS_COOKIE = process.env.ADMIN_COOKIE_NAME || 'afristage_admin_token';
export const REFRESH_COOKIE = process.env.ADMIN_REFRESH_COOKIE_NAME || 'afristage_admin_refresh';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

type CookieStore = { set: (name: string, value: string, opts: Record<string, unknown>) => void };

// Persist the token pair. The access JWT still expires on its own short TTL
// (the API enforces it); the cookie just carries it so the proxy can trigger a
// refresh on 401 rather than dropping the session.
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
