import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@agentdeck/shared'],
  typedRoutes: true,
  async redirects() {
    return [
      // `default` is the implicit catch-all bucket for CLI bridges that don't
      // set AGENTDECK_PROJECT_ID — it has no semantic value of its own. Its
      // sessions are visible on the hub via the inline Teams expander, so the
      // dedicated /projects/default page is permanently redundant. 308 = the
      // request method is preserved (we never POST to /projects, but if a
      // bookmark sends a HEAD it stays a HEAD).
      {
        source: '/projects/default',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
