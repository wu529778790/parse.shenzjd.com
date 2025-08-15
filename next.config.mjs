/** @type {import('next').NextConfig} */
const nextConfig = {
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
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
  // 确保输出模式适用于 Docker 部署
  output:
    process.env.DEPLOYMENT_TARGET === "cloudflare" ? "export" : "standalone",
  experimental: {
    optimizePackageImports: ["tailwindcss"],
  },
};

export default nextConfig;
