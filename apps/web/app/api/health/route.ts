// Liveness for Railway's shared healthcheckPath and the synthetic monitor.
export function GET() {
  return Response.json({ status: 'ok', service: 'web' });
}
