// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: '/REPO_NAME',       // ← nomaini uz savu repo nosaukumu, piem. '/my-claims-app'
  assetPrefix: '/REPO_NAME/',    // ← tas pats
}
module.exports = nextConfig
