import { createApiHandler } from "@/lib/api-middleware";
import getBilibiliVideoInfo from "@/lib/parsers/bilibili";

export const runtime = "nodejs";

// 平台路由壳：对外一律由中间件 403（统一入口 /api/parse 才是对外接口），
// 解析逻辑在 lib/parsers/bilibili.js，这里保留路由便于未来按需放开。
export const GET = createApiHandler(getBilibiliVideoInfo, {
  shouldCache: false,
  responseHeaders: {
    "Cache-Control": "no-store, no-cache, must-revalidate",
  },
});
