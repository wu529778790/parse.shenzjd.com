/**
 * 统一入口 /api/parse 的解析结果共享缓存（Cloudflare Cache API）
 *
 * 背景：统一入口此前禁用缓存，原因是各平台路由的内存缓存条目缺 platform 字段
 * （共享同一 Map，外层命中会绕过 unifiedParser 补 platform 的逻辑，导致「未知平台」）。
 * 这里为统一入口单独建一层缓存：key 只由本模块读写，缓存值是补全 platform 后的
 * 最终归一化结果，与平台路由的内存缓存完全隔离，原禁用原因不复存在。
 *
 * 设计：
 * - TTL 24 小时：分享链接的打开窗口长（发出后一两天仍有人点开）；
 *   条目总量交给 Cloudflare 边缘自动淘汰，无须自管上限
 * - 直链时效兜底：抖音等直链带签名有时效，缓存命中时用 verifyDirectUrl 探测
 *   主直链，明确死链（404/410）视为未命中重新解析并回写，避免好友点开黑屏；
 *   探测（1 个 HEAD）远比重新解析（短链解析 + 页面抓取 + 提取）便宜
 * - 存储选 Cache API：per-colo 共享（同机房 isolate 互相命中），免费零配置；
 *   非 Workers 环境（本地 next dev / vitest，无 caches 全局）退化为进程内存 Map，
 *   行为一致，仅不跨实例共享
 */
import { verifyDirectUrl } from "@/lib/verifyUrl";

/** 分享打开窗口按天计，直链时效由命中探测兜底，故 TTL 取一整天 */
const TTL_SECONDS = 24 * 60 * 60;
/** 内存兜底上限（非 Workers 环境），防本地长跑内存膨胀 */
const MEMORY_MAX = 500;
// 合成缓存源：仅作 Cache API 的 key，从不真实请求
const CACHE_KEY_BASE = "https://result-cache.parse.shenzjd.com/api/parse?url=";

const memoryCache = new Map(); // url → { result, expiresAt }

function cacheRequest(url) {
  return new Request(CACHE_KEY_BASE + encodeURIComponent(url), { method: "GET" });
}

function cacheAvailable() {
  return typeof caches !== "undefined" && caches && !!caches.default;
}

/**
 * 读缓存。命中返回归一化结果对象；未命中/过期/缓存层异常一律返回 null（当未命中）。
 */
export async function getResultCache(url) {
  if (cacheAvailable()) {
    try {
      const hit = await caches.default.match(cacheRequest(url));
      return hit ? await hit.json() : null;
    } catch {
      return null;
    }
  }
  const entry = memoryCache.get(url);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(url);
    return null;
  }
  return entry.result;
}

/**
 * 写缓存。只缓存成功结果（code=200）：失败可能是瞬时反爬，缓存会放大错误。
 * 写失败只影响下次命中率，不阻断本次响应。
 */
export async function putResultCache(url, result) {
  if (!result || result.code !== 200) return;
  if (cacheAvailable()) {
    try {
      await caches.default.put(
        cacheRequest(url),
        new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            // Cache API 的 TTL 由缓存头决定
            "cache-control": "public, max-age=" + TTL_SECONDS,
          },
        })
      );
    } catch {
      // 忽略：Cache API 写入异常不影响主流程
    }
    return;
  }
  if (memoryCache.size >= MEMORY_MAX) {
    // FIFO 淘汰足够（兜底场景才有内存路径）
    memoryCache.delete(memoryCache.keys().next().value);
  }
  memoryCache.set(url, { result, expiresAt: Date.now() + TTL_SECONDS * 1000 });
}

/**
 * 缓存结果的主直链是否已失效（如抖音签名直链过期）。
 * 探测范围与解析时的直链验证对齐（主直链或主图 + 分P首段），最多 2 个 HEAD 请求；
 * 只有明确死链（404/410）才判失效，403/超时等不确定一律当有效（绝不误伤好链）。
 */
export async function resultStale(result) {
  const d = (result && result.data) || {};
  const candidates = [];
  const main =
    typeof d.url === "string" && d.url.startsWith("http")
      ? d.url
      : typeof d.photoUrl === "string" && d.photoUrl.startsWith("http")
        ? d.photoUrl
        : "";
  if (main) candidates.push(main);
  const firstPart = Array.isArray(d.videos) && d.videos[0];
  if (firstPart && typeof firstPart.url === "string" && firstPart.url.startsWith("http")) {
    candidates.push(firstPart.url);
  }
  for (const direct of candidates) {
    try {
      const v = await verifyDirectUrl(direct);
      if (v && v.ok === false) return true;
    } catch {
      // 探测异常按有效处理
    }
  }
  return false;
}

/** 测试辅助：清空内存兜底缓存（Workers 的 Cache API 无须也无从手动清） */
export function _resetForTests() {
  memoryCache.clear();
}
