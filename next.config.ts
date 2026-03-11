import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
    buildActivityPosition: 'bottom-right',
  } as any,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'cossyqsvqxatbbhysdur.supabase.co',
      },
      // Legacy: kept for any existing vault images from earlier infrastructure
      {
        protocol: 'https',
        hostname: 'wrvqqvqvwqmfdqvqmaar.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'api.therai.co',
      },
    ],
  },
};

export default nextConfig;
