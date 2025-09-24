/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',          // ģenerē statisku HTML
  trailingSlash: true,       // katrai lapai būs sava index.html mape
  images: { unoptimized: true },
  basePath: '/eksperti',     // TAVS repo nosaukums
  assetPrefix: '/eksperti/', // tas pats ar slīpsvītru
};
module.exports = nextConfig;
