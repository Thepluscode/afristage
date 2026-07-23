// distDir is env-driven so `next build` targets a separate directory (.next-prod)
// and never clobbers a running `next dev` server's `.next`. Mirrors admin-web.
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next'
};
export default nextConfig;
