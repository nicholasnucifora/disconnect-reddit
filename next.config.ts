import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.redd.it",
      },
      {
        protocol: "https",
        hostname: "external.preview.redd.it",
      },
      {
        protocol: "https",
        hostname: "preview.redd.it",
      },
      {
        protocol: "https",
        hostname: "v.redd.it",
      },
      {
        protocol: "https",
        hostname: "www.redditstatic.com",
      },
    ],
  },
};

export default nextConfig;
