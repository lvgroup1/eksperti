/** @type {import('next').NextConfig} */
const isGH = process.env.NODE_ENV === 'production'; // on Pages
const base = '/eksperti';

module.exports = {
  // ensure purely static output for GitHub Pages
  output: 'export',
  trailingSlash: true,

  // make assets resolve under /eksperti
  basePath: isGH ? base : '',
  assetPrefix: isGH ? base : '',

  // optional but nice for static export
  images: { unoptimized: true },
};

const nextConfig = {
  output: 'export',
  distDir: 'out',
};

module.exports = nextConfig;
