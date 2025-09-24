/** @type {import('next').NextConfig} */
module.exports = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  assetPrefix: '.',   // relatīvi resursi, strādā /eksperti/ apakšceļā
};
