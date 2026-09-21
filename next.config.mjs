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
      // 页面导航：网络优先，超时回退缓存。
      // 超时从 10s 收到 3s：源站（容器）响应随机在 0.2~35s 之间抖，
      // 10s 意味着回访用户最坏要盯着白屏等满 10 秒才拿到缓存页；
      // 正常网络下 HTML 首字节仅 ~0.2s，3s 足够让线上响应先到。
      {
        urlPattern: ({ request }) => request.destination === "document",
        handler: "NetworkFirst",
        options: { cacheName: "pages", networkTimeoutSeconds: 3 },
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
  // 静态资源缓存策略（2026-09-21）。
  //
  // 背景：线上是「客户端 → Cloudflare → OpenResty → Docker 容器」，
  // 源站响应随机要 0.2~35s，而 Cloudflare 边缘缓存此前完全没兜住：
  //   - /_next/static/* 只带 `max-age`（Next 默认），实测同一 CSS 连打 8 次
  //     全是 `cf-cache-status: REVALIDATED`，等于每次都回源校验；
  //   - /logos/* 等 public 资源连 max-age 都没有，被 Cloudflare 的
  //     Browser Cache TTL 兜成 4 小时。
  // 这里显式补齐 `s-maxage`（Cloudflare 判定 Edge TTL 优先看它）并统一长缓存，
  // 让第二次起的所有静态请求都直接命中边缘缓存，不再落到慢源站。
  //
  // 注意：HTML 页面刻意不在此处改写缓存头 —— Next App Router 会带
  // `Vary: rsc, next-router-state-tree, ...`，Cloudflare 只接受
  // `Vary: Accept-Encoding`，因此页面响应本就不可边缘缓存；要缓存必须先在
  // Cloudflare 侧把 `RSC` 等请求头纳入 Cache Key，否则 RSC 载荷会与 HTML 串包。
  async headers() {
    // 内容稳定、可长期缓存的静态资源统一策略：30 天 + 允许后台异步续期
    const STATIC_LONG =
      "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400";
    // 带内容哈希的构建产物：可永久缓存
    const IMMUTABLE =
      "public, max-age=31536000, immutable, s-maxage=31536000";

    return [
      // Service Worker：必须实时拿到新版本，任何一层缓存都会让用户卡在旧 SW
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      // 构建产物（文件名带内容哈希）→ 永久
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: IMMUTABLE }],
      },
      // 平台 logo / 品牌图 → 30 天
      {
        source: "/logos/:path*",
        headers: [{ key: "Cache-Control", value: STATIC_LONG }],
      },
      {
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: STATIC_LONG }],
      },
      {
        source: "/og-image.png",
        headers: [{ key: "Cache-Control", value: STATIC_LONG }],
      },
      // PWA 清单：改动不频繁，给 1 小时边缘缓存，源站少挨一次
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=3600" },
        ],
      },
      // SEO 文件：让爬虫与边缘都少回源
      {
        source: "/robots.txt",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=3600" },
        ],
      },
      {
        source: "/sitemap.xml",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=3600" },
        ],
      },
    ];
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
