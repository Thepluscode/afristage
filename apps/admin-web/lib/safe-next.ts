// Where to send an operator after they re-authenticate: back to the page they
// were on, not the dashboard. The `next` value is attacker-influenced (it rides
// in the URL), so it must be a same-origin RELATIVE path — reject anything that
// could become an off-site open redirect, and don't bounce back to /login.
export function safeNext(next: string | null | undefined): string {
  if (!next) return '/';
  // Must start with a single "/" not followed by "/" or "\" (blocks "//evil.com"
  // and "/\evil.com" which browsers resolve as protocol-relative external URLs).
  if (!/^\/(?![/\\])/.test(next)) return '/';
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login/')) return '/';
  return next;
}
