import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@agentdeck/shared'],
  typedRoutes: true,
  async redirects() {
    return [
      // The /projects/[id] deep-view route was killed in favour of a flatter
      // 2-page model: hub at / lists every project (= every connected CLI),
      // sessions live at /sessions/[id]. Any /projects/... bookmark from a
      // pre-flat era resolves to the hub. Permanent (308) keeps method.
      {
        source: '/projects/:path*',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
