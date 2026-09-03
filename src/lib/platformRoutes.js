/**
 * 平台 → 解析函数模块的映射（唯一数据源）
 * parse/route.js（统一解析入口）与 engines/route.js（平台体检）共用。
 *
 * 解析函数统一下沉在 src/lib/parsers/（纯函数模块，默认导出解析函数）：
 * 统一入口对平台解析是直接函数调用，不经任何 HTTP 转发。
 * 旧的「合成 Request + x-parse-internal 头」内部转发协议已废除——
 * 该头可被外部客户端任意伪造，曾导致平台路由的认证/配额/统计被一个请求头绕过。
 */
export const platformRoutes = {
  douyin: () => import("@/lib/parsers/douyin"),
  bilibili: () => import("@/lib/parsers/bilibili"),
  // key 必须与 lib/platforms.ts 的 PLATFORM_INFO 对齐（小红书是 redbook，
  // 统一入口 identifyPlatform 返回的 key），解析模块文件名仍是 xhs
  redbook: () => import("@/lib/parsers/xhs"),
  huya: () => import("@/lib/parsers/huya"),
  haokan: () => import("@/lib/parsers/haokan"),
  weibo: () => import("@/lib/parsers/weibo"),
  weishi: () => import("@/lib/parsers/weishi"),
  xigua: () => import("@/lib/parsers/xigua"),
  huoshan: () => import("@/lib/parsers/huoshan"),
  acfun: () => import("@/lib/parsers/acfun"),
  lishipin: () => import("@/lib/parsers/lishipin"),
  // 皮皮虾解析模块是 ppxia
  pipixia: () => import("@/lib/parsers/ppxia"),
  pipigx: () => import("@/lib/parsers/pipigx"),
  sixroom: () => import("@/lib/parsers/sixroom"),
  lvzhou: () => import("@/lib/parsers/lvzhou"),
  meipai: () => import("@/lib/parsers/meipai"),
  zuiyou: () => import("@/lib/parsers/zuiyou"),
  quanmin: () => import("@/lib/parsers/quanmin"),
  quanminkge: () => import("@/lib/parsers/quanminkge"),
  doupai: () => import("@/lib/parsers/doupai"),
  xinpianchang: () => import("@/lib/parsers/xinpianchang"),
  twitter: () => import("@/lib/parsers/twitter"),
  tiktok: () => import("@/lib/parsers/tiktok"),
  qsmusic: () => import("@/lib/parsers/qsmusic"),
};

/** 平台 key → 解析函数（动态加载 lib/parsers 模块的默认导出） */
export async function getPlatformParser(platform) {
  const loader = platformRoutes[platform];
  if (!loader) return null;
  try {
    const mod = await loader();
    const parser = mod?.default;
    if (typeof parser !== "function") return null;
    if (typeof mod.parseVideoId === "function") {
      parser.parseVideoId = mod.parseVideoId;
    }
    return parser;
  } catch {
    return null;
  }
}
