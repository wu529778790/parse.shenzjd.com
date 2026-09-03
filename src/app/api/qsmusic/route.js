import { createApiHandler } from "@/lib/api-middleware";
import getMusicInfo from "@/lib/parsers/qsmusic";

export const runtime = "nodejs";

// 平台路由壳：对外一律由中间件 403（统一入口 /api/parse 才是对外接口），
// 解析逻辑在 lib/parsers/qsmusic.js，这里保留路由便于未来按需放开。
export const GET = createApiHandler(getMusicInfo);
