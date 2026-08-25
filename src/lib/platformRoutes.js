/**
 * 平台 → 解析路由的映射（唯一数据源）
 * parse/route.js（统一解析入口）与 engines/route.js（平台体检）共用，
 * 避免两处各自维护一份映射导致不同步。
 */
export const platformRoutes = {
  douyin: () => import("@/app/api/douyin/route.js"),
  bilibili: () => import("@/app/api/bilibili/route.js"),
  xhs: () => import("@/app/api/xhs/route.js"),
  huya: () => import("@/app/api/huya/route.js"),
  haokan: () => import("@/app/api/haokan/route.js"),
  weibo: () => import("@/app/api/weibo/route.js"),
  weishi: () => import("@/app/api/weishi/route.js"),
  xigua: () => import("@/app/api/xigua/route.js"),
  huoshan: () => import("@/app/api/huoshan/route.js"),
  acfun: () => import("@/app/api/acfun/route.js"),
  lishipin: () => import("@/app/api/lishipin/route.js"),
  // 皮皮虾目录是 ppxia
  pipixia: () => import("@/app/api/ppxia/route.js"),
  pipigx: () => import("@/app/api/pipigx/route.js"),
  sixroom: () => import("@/app/api/sixroom/route.js"),
  lvzhou: () => import("@/app/api/lvzhou/route.js"),
  meipai: () => import("@/app/api/meipai/route.js"),
  zuiyou: () => import("@/app/api/zuiyou/route.js"),
  quanmin: () => import("@/app/api/quanmin/route.js"),
  quanminkge: () => import("@/app/api/quanminkge/route.js"),
  doupai: () => import("@/app/api/doupai/route.js"),
  xinpianchang: () => import("@/app/api/xinpianchang/route.js"),
  twitter: () => import("@/app/api/twitter/route.js"),
  youtube: () => import("@/app/api/youtube/route.js"),
  tiktok: () => import("@/app/api/tiktok/route.js"),
};

/** 平台 key → 解析函数获取器（兼容注册函数与动态导入的 route） */
export async function getPlatformParser(platform) {
  const loader = platformRoutes[platform];
  if (!loader) return null;
  try {
    const mod = await loader();
    if (typeof mod.default === "function" && mod.default !== mod.GET) {
      return mod.default;
    }
    if (typeof mod.GET === "function") {
      // 统一契约：解析函数接收分享 URL 字符串，返回 { code, msg, data }
      const routeParser = async (url) => {
        const request = new Request(
          `http://internal.local/api/parser?url=${encodeURIComponent(url)}`,
          { headers: { "user-agent": "parse.shenzjd.com/internal-parser", "x-parse-internal": "1" } }
        );
        const response = await mod.GET(request);
        if (!(response instanceof Response)) {
          return response ?? null;
        }
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          return await response.json();
        }
        const text = await response.text();
        return {
          code: response.ok ? 200 : response.status,
          msg: text || (response.ok ? "解析成功" : "解析失败"),
        };
      };
      if (typeof mod.parseVideoId === "function") {
        routeParser.parseVideoId = mod.parseVideoId;
      }
      return routeParser;
    }
    return null;
  } catch {
    return null;
  }
}
