// Liveness for Railway's shared healthcheckPath and the synthetic monitor.
// Middleware excludes /api/* so this never redirects to /login.
export function GET() {
  return Response.json({ status: 'ok', service: 'admin-web' });
}
