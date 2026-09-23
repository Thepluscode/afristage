// Content-Security-Policy and friends.
//
// The threat this closes is a third-party script origin: one compromised CDN
// running code in a logged-in user's browser. This app loads zero external
// SCRIPTS — audited against the deployed HTML, which references no third-party
// script origin — so the policy makes that structural rather than accidental.
//
// script-src keeps 'unsafe-inline' because Next injects inline bootstrap and
// hydration scripts. That permits inline code already in our own HTML; it does
// NOT permit any external origin, which is the attack being prevented. The
// stricter upgrade is per-request nonces via middleware — worth doing, but it
// has to be verified against streaming and hydration rather than assumed, and
// a CSP that breaks the app is worse than no CSP at all.
//
// connect-src is a different question from script-src, and getting it wrong is
// how this file shipped a policy that silently switched the product off. On
// 2026-09-23 the deployed header read `connect-src 'self'` and every one of
// these was blocked, with "Could not join the stage." the only thing a viewer
// saw:
//
//   1. NEXT_PUBLIC_API_BASE is unset on the deployed service. lib/live.ts falls
//      back to API_DEFAULT and calls the API anyway; this file fell back to ''
//      and forbade it. Two different defaults for the same value, and the app
//      lost. They are now the same constant.
//   2. API_DEFAULT ends in /api. A CSP source with a path restricts by that
//      path, so `connect-src https://host/api` would not have matched
//      wss://host/socket.io/ even with the variable set. Sources must be
//      origins.
//   3. LiveKit was never in the policy at all. Its URL is chosen by the API at
//      runtime and returned in the guest-token response, so no build-time
//      variable could have carried it. Video could not have worked behind this
//      policy in any environment.
//
// Whoever edits this next: a change here is not verified by the unit tests
// alone. Load /watch against a LIVE room in a real browser and read the
// console. The tests below assert the string; only the browser enforces it.

// The one default for where the API lives. lib/live.ts imports this so the app
// and its policy can never disagree about it again.
export const API_DEFAULT = 'https://api-production-e12f.up.railway.app/api';

// Scheme + host of a URL, dropping any path. Returns '' for anything
// unparseable rather than throwing, because this runs during `next build` and
// a malformed variable must not take the build down — it degrades to the
// same-origin-only policy, which is the safe direction.
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export function contentSecurityPolicy(apiBase = process.env.NEXT_PUBLIC_API_BASE || API_DEFAULT) {
  const httpOrigin = originOf(apiBase);
  // The socket.io server is at the API's root origin over ws(s). Derive it
  // rather than opening connect-src to every scheme.
  const wsOrigin = httpOrigin ? httpOrigin.replace(/^http/, 'ws') : '';

  const connect = [
    "'self'",
    httpOrigin,
    wsOrigin,
    // LiveKit is the video vendor, and the specific tenant is chosen by the API
    // at runtime. Scoped to LiveKit's own domain rather than a hard-coded
    // tenant, so rotating the project does not silently break playback.
    'https://*.livekit.cloud',
    'wss://*.livekit.cloud'
  ]
    .filter(Boolean)
    .join(' ');

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
