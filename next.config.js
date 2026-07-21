/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { allowedOrigins: ['*'] } },
  // Serverless-friendly: each route is independent
  output: 'standalone',
};

module.exports = nextConfig;
