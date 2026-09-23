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
import { DELETED_CONTENT_MSG } from "@/lib/api-utils";

/** 分享打开窗口按天计，直链时效由命中探测兜底，故 TTL 取一整天 */
const TTL_SECONDS = 24 * 60 * 60;
/**
 * 内存兜底上限。线上解析站跑在 Docker/Node（无 `caches` 全局），**这条内存路径就是
 * 生产实际使用的缓存**，原先 500 条 + FIFO 让热链接很快被冲掉（命中率被压低 →
 * 更多全量解析）。这里放宽到 5000 条并改为 LRU 淘汰。
 */
const MEMORY_MAX = 5000;
/** 命中探测结论 memo：同一 URL 在窗口内重复命中时不再重复外呼 */
const PROBE_MEMO_TTL_MS = 60 * 1000;
/** memo 上限（LRU），防长跑膨胀 */
const PROBE_MEMO_MAX = 2000;
/**
 * 命中探测的单次预算。超时本就被判为「仍有效」，等满默认 4s 只会把一次本该
 * 毫秒级返回的缓存命中拖住（线上日志实测：cache-hit 平均 752ms、最大 5077ms）。
 */
const PROBE_TIMEOUT_MS = 1200;
// 合成缓存源：仅作 Cache API 的 key，从不真实请求
const CACHE_KEY_BASE = "https://result-cache.parse.shenzjd.com/api/parse?url=";

const memoryCache = new Map(); // url → { result, expiresAt }（Map 顺序 = 最近使用序）
/** 只记「探测有效」结论：死链结论不缓存，避免把可能恢复的链接钉死 */
const probeOkMemo = new Map(); // direct url → 上次确认有效的时刻

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
  // LRU：命中即重排到队尾（Map 按插入序），让热链接不被新条目挤掉
  memoryCache.delete(url);
  memoryCache.set(url, entry);
  return entry.result;
}

/**
 * 写缓存。缓存两类结果：
 * - 成功结果（code=200）；
 * - 永久性失败（msg 为「该内容已被删除」，code 404/0 均可）：内容删除是不可逆的
 *   确定失败，缓存可避免同一条已删除链接被不同用户反复全量解析（2026-09-04 日志
 *   中一条已删除小红书笔记被重复解析 5 次）；瞬时反爬失败仍不缓存，避免放大错误。
 * 写失败只影响下次命中率，不阻断本次响应。
 */
export async function putResultCache(url, result) {
  const isPermanentFailure = !!result && result.msg === DELETED_CONTENT_MSG;
  if (!result || (result.code !== 200 && !isPermanentFailure)) return;
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
    // LRU：逐出最久未使用的一批（1/8），避免逐条淘汰带来的高频抖动
    const batch = Math.ceil(MEMORY_MAX / 8);
    let removed = 0;
    for (const key of memoryCache.keys()) {
      memoryCache.delete(key);
      if (++removed >= batch) break;
    }
  }
  memoryCache.set(url, { result, expiresAt: Date.now() + TTL_SECONDS * 1000 });
}

/**
 * 缓存结果的主直链是否已失效（如抖音签名直链过期）。
 * 探测范围与解析时的直链验证对齐（主直链或主图 + 分P首段），最多 2 个 HEAD 请求；
 * 只有明确死链（404/410）才判失效，403/超时等不确定一律当有效（绝不误伤好链）。
 *
 * 性能（2026-09-23）：命中路径上的探测是线性的同步外呼，而热链接会被反复打开
 * （线上日志：232 次命中仅对应 56 个 URL，最热的被探测 20 次），故
 * ①「探测有效」结论按 URL 记 60s memo，窗口内不再重复外呼；
 * ②单次探测预算压到 PROBE_TIMEOUT_MS（超时本就算有效，等满 4s 只会拖慢命中响应）。
 * 死链结论刻意不 memo：重新解析会立刻用新直链覆盖缓存条目，不需要靠 memo 兜。
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
  const now = Date.now();
  for (const direct of candidates) {
    const probedAt = probeOkMemo.get(direct);
    if (probedAt && now - probedAt < PROBE_MEMO_TTL_MS) continue;
    try {
      const v = await verifyDirectUrl(direct, { timeout: PROBE_TIMEOUT_MS });
      if (v && v.ok === false) return true;
      rememberProbeOk(direct, now);
    } catch {
      // 探测异常按有效处理
    }
  }
  return false;
}

/** 记录「该直链探测有效」；超过上限按 LRU 逐出一批 */
function rememberProbeOk(url, now) {
  if (probeOkMemo.size >= PROBE_MEMO_MAX) {
    const batch = Math.ceil(PROBE_MEMO_MAX / 8);
    let removed = 0;
    for (const key of probeOkMemo.keys()) {
      probeOkMemo.delete(key);
      if (++removed >= batch) break;
    }
  }
  probeOkMemo.delete(url);
  probeOkMemo.set(url, now);
}

/** 测试辅助：清空内存兜底缓存（Workers 的 Cache API 无须也无从手动清） */
export function _resetForTests() {
  memoryCache.clear();
  probeOkMemo.clear();
}
