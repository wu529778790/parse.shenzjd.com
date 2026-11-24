/**
 * 快手请求统一出口：优先走国内中继，未配置时等同原生 fetch。
 *
 * 为什么要中继（2026-11-24 线上实测）：
 * 快手解析要拉移动分享页 `m.gifshow.com/fw/photo/<id>`（约 160KB，是唯一能
 * 解析出数据的形态，PC 页对数据中心出口直接反爬）。从本站出口（新加坡）
 * 同一条 URL 要 4.9–11.3s（TTFB 0.8–3.9s、有效带宽 ~50KB/s），而从广州中继机
 * 只要 1.1s。`fetchPage` 的 15s 超时因此被击穿：72h 内快手失败 161 次
 * （占平台流量 62% 的快手上 21.5% 失败率），成功请求 p50 也高达 12.4s，
 * 用户重试进一步放大流量（749 次请求只对应 267 个唯一链接）。
 *
 * 出口选择：
 * - `KUAISHOU_RELAY_URL`，缺省回退 `BILIBILI_RELAY_URL`（同一台中继，广州
 *   轻量云，直通协议见 passthrough-relay.js）；
 * - `KUAISHOU_RELAY_TOKEN`，缺省回退 `BILIBILI_RELAY_TOKEN`；
 * - 都没配、或地址指向旧的 SCF 信封中继（`*.tencentscf.com`，白名单里没有
 *   快手域名且响应体会被网关截断）时，退化为原生 fetch——行为与改动前一致。
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

/** 中继根地址（空串 = 不走中继） */
export function kuaishouRelayEndpoint() {
  const explicit = (process.env.KUAISHOU_RELAY_URL || "").trim();
  const base = explicit || (process.env.BILIBILI_RELAY_URL || "").trim();
  if (!base) return "";
  // 旧 SCF 信封中继：协议不同、白名单不含快手域名，直接不用
  if (/\.tencentscf\.com(?::\d+)?(?:\/|$)/i.test(base)) return "";
  return base.replace(/\/+$/, "");
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
