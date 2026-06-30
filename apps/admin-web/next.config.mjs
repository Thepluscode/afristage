// distDir is env-driven so `next build` can target a separate directory
// (.next-prod) and never clobber a running `next dev` server's `.next`.
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next'
};
export default nextConfig;
