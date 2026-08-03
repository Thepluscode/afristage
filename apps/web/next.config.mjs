// distDir is env-driven so `next build` targets a separate directory (.next-prod)
// and never clobbers a running `next dev` server's `.next`. Mirrors admin-web.
import { securityHeaders } from './security-headers.mjs';

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  }
};
export default nextConfig;
