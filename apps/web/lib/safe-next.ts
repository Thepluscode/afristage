// Where to send someone after they sign in or register. `next` rides in the URL,
// so it is attacker-controlled: it must be a same-origin RELATIVE path. Anything
// else — `https://evil`, `//evil`, `/\evil`, and above all `javascript:` (the CSP
// allows inline script, so window.location.assign would RUN it with the new
// session) — falls back to the wallet. Mirrors admin-web/lib/safe-next.ts.
const FALLBACK = '/wallet';

export function safeNext(next: string | null | undefined): string {
  if (!next) return FALLBACK;
  // A single "/" not followed by "/" or "\" (browsers resolve both as
  // protocol-relative external URLs).
  if (!/^\/(?![/\\])/.test(next)) return FALLBACK;
  // Don't bounce back into the auth pages.
  if (/^\/(login|register)(?:[/?#]|$)/.test(next)) return FALLBACK;
  return next;
}
