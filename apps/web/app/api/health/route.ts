// Liveness for Railway's shared healthcheckPath and the synthetic monitor.
//
// `commit` exists so a deploy can be VERIFIED rather than assumed: without it a
// 200 here proves only that some container is serving, which is exactly how a
// stale web client sat behind a green pipeline while the API moved on. Same
// contract as the API's /api/health. `unknown` is honest — never a guess.
// force-dynamic is load-bearing, not decoration. Without it Next PRERENDERS
// this route at build time, reads process.env.GIT_SHA while it is unset, and
// bakes `commit: "unknown"` into a static file — a value no runtime variable
// can ever change. The first deploy with the stamp failed on exactly this, and
// the verify step caught it rather than a user finding a stale client later.
export const dynamic = 'force-dynamic';

export function GET() {
  const commit = process.env.GIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown';
  return Response.json({ status: 'ok', service: 'web', commit });
}
