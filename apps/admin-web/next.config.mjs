// distDir is env-driven so `next build` can target a separate directory
// (.next-prod) and never clobber a running `next dev` server's `.next`.
import { securityHeaders } from './security-headers.mjs';

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  }
};
export default nextConfig;
