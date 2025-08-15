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
  experimental: {
    optimizePackageImports: ["tailwindcss"],
  },
  // 确保输出模式适用于 Docker 部署
  output:
    process.env.DEPLOYMENT_TARGET === "cloudflare" ? "export" : "standalone",
  // 确保 CSS 优化在生产环境中启用
  optimizeCss: true,
};

export default nextConfig;
