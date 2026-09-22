// Liveness for Railway's shared healthcheckPath and the synthetic monitor.
//
// `commit` exists so a deploy can be VERIFIED rather than assumed: without it a
// 200 here proves only that some container is serving, which is exactly how a
// stale web client sat behind a green pipeline while the API moved on. Same
// contract as the API's /api/health. `unknown` is honest — never a guess.
export function GET() {
  const commit = process.env.GIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown';
  return Response.json({ status: 'ok', service: 'web', commit });
}
