/**
 * 快手请求出口：**默认直连**，只有显式配置 `KUAISHOU_RELAY_URL` 才走国内中继。
 *
 * 背景与一次翻车（2026-11-24，同日上线当日回滚）：
 * 快手解析要拉移动分享页 `m.gifshow.com/fw/photo/<id>`（约 160KB，是唯一能
 * 解析出数据的形态）。72h 线上快手失败 161 次（占平台流量 62% 的平台上
 * 21.5% 失败率），成功 p50 12.4s。当时判断是跨境慢，遂改走广州中继。
 *
 * 但上线后实测（新加坡出口 → 广州中继 → 快手）：
 *   中继  total 12.3s / 34.3s / 27.3s（ttfb 1.1s / 2.1s / 1.1s）
 *   直连  total 10.2s / 10.8s /  7.0s（ttfb 3.1s / 2.8s / 2.9s）
 * 中继确实把**上游首字节**从 ~3s 压到 ~1s，但 160KB 响应体还要从广州跨境
 * 回传给新加坡，这段回程比原本的跨境直连更慢——总耗时反而翻倍，15s 超时
 * 会打得更频繁。所以中继对「大响应体」是一次负优化，不能靠它提速快手。
 *
 * 结论：默认直连（与改动前一致），等中继侧做「代提取」把小字段带回来
 * （relay 的 `?extract=` 机制，160KB → 约 1KB）再显式开启：
 *   KUAISHOU_RELAY_URL=http://123.207.66.24:9443
 *   KUAISHOU_RELAY_TOKEN=<same as BILIBILI_RELAY_TOKEN>
 * 地址指向旧 SCF 信封中继（`*.tencentscf.com`）时一律不用。
 */

import { logger } from "@/lib/api-utils";
import { relayPassthrough } from "@/lib/passthrough-relay";

// 中继客户端兜底超时；调用方显式传 signal（fetchPage 15s / 重定向 10s）时以它为准
const RELAY_TIMEOUT_MS = 20000;

let relayLogged = false;

// 中继「拒绝」（白名单没加这个域名 / 令牌不对 / 容器没配令牌）与「目标站慢」
// 是两回事：前者退回直连照样能解析，只是慢一点。部署有先后（parse 的代码
// 先上、中继镜像后上）时，必须让 parse 侧自动退让，否则快手会整体不可用。
// 这里给配置类拒绝挂 10 分钟冷却，避免每个请求都先白跑一次中继。
const RELAY_CONFIG_REJECT_COOLDOWN_MS = 10 * 60 * 1000;
let relayDisabledUntil = 0;

function isRelayRejection(error) {
  const message = error instanceof Error ? error.message : "";
  // 中继自己的拒绝：403 forbidden / 400 bad target / 503 relay not configured
  return /^中继 HTTP (400|403|503)\b/.test(message);
}

/** 仅供单测：清掉模块级状态（冷却计时、首日志标记） */
export function resetKuaishouRelayState() {
  relayLogged = false;
  relayDisabledUntil = 0;
}

/** 中继根地址（空串 = 不走中继；刻意不回退 BILIBILI_RELAY_URL，见文件头实测） */
export function kuaishouRelayEndpoint() {
  const explicit = (process.env.KUAISHOU_RELAY_URL || "").trim();
  if (!explicit) return "";
  // 旧 SCF 信封中继：协议不同、白名单不含快手域名，直接不用
  if (/\.tencentscf\.com(?::\d+)?(?:\/|$)/i.test(explicit)) return "";
  return explicit.replace(/\/+$/, "");
}

function relayToken() {
  return (
    process.env.KUAISHOU_RELAY_TOKEN ||
    process.env.BILIBILI_RELAY_TOKEN ||
    ""
  );
}

/**
 * 快手专用 fetch：配置了国内中继就走中继，否则直连。
 * @param {string} url
 * @param {object} [init] 同 fetch init（headers / redirect / signal）
 */
export async function kuaishouFetch(url, init = {}) {
  const relayUrl =
    Date.now() < relayDisabledUntil ? "" : kuaishouRelayEndpoint();
  if (!relayUrl) return fetch(url, init);
  if (!relayLogged) {
    relayLogged = true;
    logger.log("[kuaishou-relay] 快手请求启用自建中继出口（直通协议）");
  }
  try {
    return await relayPassthrough(relayUrl, url, init, {
      token: relayToken(),
      timeoutMs: RELAY_TIMEOUT_MS,
    });
  } catch (error) {
    // 调用方已取消/超时：不再补一次直连（否则用户要多等一轮）
    if (init.signal?.aborted || !isRelayRejection(error)) throw error;
    relayDisabledUntil = Date.now() + RELAY_CONFIG_REJECT_COOLDOWN_MS;
    logger.warn(
      `[kuaishou-relay] 中继拒绝（${error.message.slice(0, 80)}），10 分钟内改直连`
    );
    return fetch(url, init);
  }
}
