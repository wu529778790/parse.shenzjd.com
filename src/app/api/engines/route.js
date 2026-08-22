import { PLATFORM_INFO } from "@/lib/platforms";
import { platformRoutes, getPlatformParser } from "@/lib/platformRoutes";
import { getCorsHeaders } from "@/lib/api-utils";

export const runtime = "nodejs";

/**
 * 平台体检接口（参考 video-unwatermark /api/engines）：
 * 逐个加载各平台解析路由，报告解析器是否可用，便于线上排查
 * 「哪个平台的解析器挂了」而不必翻日志。
 * 响应: { engines: [{ platform, name, status: ok|broken|unimplemented, supportsIdParse, error? }] }
 */
export async function GET(request) {
  const corsHeaders = getCorsHeaders(request?.headers?.get("origin") || "");
  const engines = [];

  for (const [platform, loader] of Object.entries(platformRoutes)) {
    const info = PLATFORM_INFO[platform];
    const entry = {
      platform,
      name: info?.name || platform,
      status: "broken",
      supportsIdParse: info?.supportsIdParse ?? false,
      error: null,
    };
    try {
      // 动态导入模块本身能验证「路由文件存在且可加载」
      const mod = await loader();
      if (!mod || (typeof mod.default !== "function" && typeof mod.GET !== "function")) {
        entry.error = "路由未导出解析函数";
      } else {
        // 再验证能真正拿到统一解析函数（default 导出或 GET route）
        const parser = await getPlatformParser(platform);
        entry.status = parser ? "ok" : "unimplemented";
        if (!parser) entry.error = "解析函数获取失败";
      }
    } catch (e) {
      entry.error = (e?.message || "模块加载失败").slice(0, 120);
    }
    engines.push(entry);
  }

  return Response.json({ engines }, { status: 200, headers: corsHeaders });
}
