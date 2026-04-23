/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isProd ? "/eksperti" : "",
  assetPrefix: isProd ? "/eksperti/" : "",
  images: { unoptimized: true },
};

module.exports = nextConfig;

