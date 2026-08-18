import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  // 开发模式下关闭 SW，避免缓存干扰热更新
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    runtimeCaching: [
      // 解析 API 与代理：绝不在 SW 层缓存（视频流/接口不应被缓存）
      {
        urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
        method: "GET",
      },
      // 页面导航：网络优先，超时回退缓存
      {
        urlPattern: ({ request }) => request.destination === "document",
        handler: "NetworkFirst",
        options: { cacheName: "pages", networkTimeoutSeconds: 10 },
      },
      // 静态资源：后台重新校验
      {
        urlPattern: ({ request }) =>
          ["style", "script", "worker", "image", "font"].includes(
            request.destination
          ),
        handler: "StaleWhileRevalidate",
        options: { cacheName: "assets" },
      },
    ],
  },
});

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
    // Cloudflare Workers 上无内置图片优化器，禁用优化、原图直出（配合前端 <Image unoptimized>）
    unoptimized: true,
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

export default withPWA(nextConfig);
