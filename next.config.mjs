/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.douyinpic.com",
      },
      {
        protocol: "https",
        hostname: "i0.hdslb.com",
      },
      {
        protocol: "http",
        hostname: "i0.hdslb.com",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["tailwindcss"],
  },
};

export default nextConfig;
