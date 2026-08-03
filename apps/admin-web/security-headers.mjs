// Content-Security-Policy and friends.
//
// The threat this closes is a third-party script origin: one compromised CDN
// running code in a logged-in user's browser. This app loads zero external
// resources today — audited against the deployed HTML, which references no
// third-party origin — so the policy makes that structural rather than
// accidental. A new external script cannot appear without this file changing.
//
// script-src keeps 'unsafe-inline' because Next injects inline bootstrap and
// hydration scripts. That permits inline code already in our own HTML; it does
// NOT permit any external origin, which is the attack being prevented. The
// stricter upgrade is per-request nonces via middleware — worth doing, but it
// has to be verified against streaming and hydration rather than assumed, and
// a CSP that breaks the app is worse than no CSP at all.

export function contentSecurityPolicy(apiBase = process.env.NEXT_PUBLIC_API_BASE || '') {
  const api = apiBase.trim().replace(/\/$/, '');
  // The socket connects to the same origin over ws(s); derive it rather than
  // opening connect-src to every scheme.
  const ws = api ? api.replace(/^http/, 'ws') : '';
  const connect = ["'self'", api, ws].filter(Boolean).join(' ');

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Stops the app being framed for clickjacking. Unlike X-Frame-Options this
    // is honoured for nested frames and by every current browser.
    "frame-ancestors 'none'",
    'upgrade-insecure-requests'
  ].join('; ');
}

export function securityHeaders(apiBase) {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(apiBase) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' }
  ];
}
