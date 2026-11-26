import type { NextConfig } from 'next';

const backendInternalUrl = (
  process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:4000/api'
).replace(/\/+$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendInternalUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
