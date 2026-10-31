import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript sources; Next compiles them in-place.
  transpilePackages: [
    '@tiktok-scheduler/shared',
    '@tiktok-scheduler/scheduler',
    '@tiktok-scheduler/db',
    '@tiktok-scheduler/tiktok',
    '@tiktok-scheduler/media',
    '@tiktok-scheduler/queue',
  ],
  serverExternalPackages: ['@prisma/client', 'ioredis', 'bullmq'],
  experimental: {
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default nextConfig;