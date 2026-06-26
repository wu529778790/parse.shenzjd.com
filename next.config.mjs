/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone：构建时裁剪出最小运行时依赖（仅生产所需 node_modules 子集），
  // 配合多阶段 Dockerfile，让生产镜像不含 devDependencies，体积更小、攻击面更低。
  output: "standalone",
  // Docker 滚动发布时若每次构建 ID 都不同，旧容器与新容器混跑会导致
  // Server Action / RSC 与「找不到 action」类错误。构建时传入稳定 ID（如 git sha）。
  generateBuildId: async () => {
    return (
      process.env.NEXT_BUILD_ID ||
      process.env.BUILD_ID ||
      `build-${Date.now()}`
    );
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
};

export default nextConfig;
