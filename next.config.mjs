/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.redd.it" },
      { protocol: "https", hostname: "external.preview.redd.it" },
      { protocol: "https", hostname: "preview.redd.it" },
      { protocol: "https", hostname: "v.redd.it" },
      { protocol: "https", hostname: "www.redditstatic.com" },
    ],
  },
};

export default nextConfig;
