import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@agentdeck/shared'],
  typedRoutes: true,
};

export default nextConfig;
