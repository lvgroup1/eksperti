/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  // GitHub Pages static export
  output: "export",
  distDir: "out",
  trailingSlash: true,

  // Required for GitHub Pages project site
  basePath: isProd ? "/eksperti" : "",
  assetPrefix: isProd ? "/eksperti" : "",

  // Disable Next Image optimizer
  images: { unoptimized: true },
};

module.exports = nextConfig;
