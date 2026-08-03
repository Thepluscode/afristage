// Who is allowed to call this API from a browser.
//
// `origin: true` reflects whatever Origin the caller sent, and combined with
// `credentials: true` that means any site a logged-in user visits can call this
// API *as them* — the browser attaches the cookies and the reflected header
// tells it the response is safe to read. Naming the origins is the fix.
//
// Non-browser callers (the Flutter app, server-to-server, curl) send no Origin
// header at all and are unaffected by any of this.

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5173',
  'http://127.0.0.1:3000'
];

export function parseOrigins(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export type OriginCheck = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void;

export function corsOrigin(env: NodeJS.ProcessEnv = process.env): OriginCheck {
  const configured = parseOrigins(env.CORS_ORIGINS);
  const allowed = configured.length ? configured : env.NODE_ENV === 'production' ? [] : DEV_ORIGINS;

  return (origin, cb) => {
    // No Origin header: not a browser cross-origin request. Native apps and
    // server-to-server callers land here, and CORS has nothing to say about them.
    if (!origin) return cb(null, true);
    cb(null, allowed.includes(origin.replace(/\/$/, '')));
  };
}
