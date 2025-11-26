/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  // Static export for GitHub Pages
  output: "export",
  trailingSlash: true,

  // Let Next output to the default `.next` + `out/` directories
  // (no need for distDir when using `output: "export"`)
  // distDir: "out", // ❌ remove this

  // For a GitHub *project* site, we only need assetPrefix
  // so that JS/CSS are loaded from /eksperti/_next/...
  assetPrefix: isProd ? "/eksperti" : "",

  // Disable Next Image optimizer
  images: { unoptimized: true },
};

module.exports = nextConfig;
