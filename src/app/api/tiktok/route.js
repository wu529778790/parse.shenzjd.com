import { createApiHandler } from "@/lib/api-middleware";
import tiktok from "@/lib/parsers/tiktok";

export const runtime = "nodejs";

// 平台路由壳：对外一律由中间件 403（统一入口 /api/parse 才是对外接口），
// 解析逻辑在 lib/parsers/tiktok.js，这里保留路由便于未来按需放开。
export const GET = createApiHandler(tiktok);
