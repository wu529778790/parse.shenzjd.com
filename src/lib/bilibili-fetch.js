/**
 * B 站请求统一出口（三档模式，按优先级自动选择）：
 *
 * 1. 中继模式（BILIBILI_RELAY_URL + BILIBILI_RELAY_TOKEN）：
 *    请求转发到国内出口的自建中继，由国内 IP 访问 B站，绕过 B站对海外
 *    数据中心 IP 的 -412 风控。2026-09-08 线上实证：新加坡出口带完整 WBI
 *    签名 + Cookie 仍 100% 被 IP 级风控拦截，唯有换国内出口有效。
 *
 *    中继有两种协议，用 BILIBILI_RELAY_PROTOCOL 选择：
 *      - "target"（默认，2026-10-30 起）：自建 Docker 中继（广州轻量云，
 *        代码见 panhub 仓库 scripts/quark-relay-scf/app.cjs）。
 *        协议：GET/POST {RELAY_URL}/?target=<urlencoded 目标地址>，
 *        鉴权头 x-relay-token，请求/响应体原样直通，中继故障带
 *        x-relay-error: timeout|upstream，跟随重定向后的最终地址回在
 *        x-relay-final-url。
 *      - "scf"（回滚用）：旧腾讯云 SCF Web 函数信封协议（见 scf-bilibili-relay/）。
 *        换掉它的原因：信封把响应体 base64 塞进 JSON，撑大约 33%，在
 *        ~750KB 处被网关截断——B站 /x/web-interface/view 的大响应
 *        （长简介/多分P）稳定解析失败（线上实证 2026-10-29/30：
 *        `Unterminated string in JSON at position 757575`，同一视频
 *        BV1DjJm6vEUW 连续 22 次失败）。直通协议没有这层体积放大。
 * 2. 代理模式（BILIBILI_PROXY）：http://[user:pass@]host:port，undici ProxyAgent。
 * 3. 直连（默认）：与原生 fetch 行为完全一致。
 */

import { fetch as undiciFetch, ProxyAgent } from "undici";
import { logger } from "@/lib/api-utils";
import { relayPassthrough } from "@/lib/passthrough-relay";

// B站请求统一 UA（写死：模拟 Chrome 浏览器，基本不变，无需暴露为配置）
export const BILIBILI_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let dispatcher = null;
let initialized = false;

function getDispatcher() {
  if (initialized) return dispatcher;
  initialized = true;
  const proxyUrl = process.env.BILIBILI_PROXY || "";
  if (!proxyUrl) return null;
  try {
    dispatcher = new ProxyAgent(proxyUrl);
    // 日志脱敏：隐掉协议与认证信息，只留 host:port
    let safe = proxyUrl;
    try {
      const u = new URL(proxyUrl);
      safe = `${u.hostname}${u.port ? `:${u.port}` : ""}`;
    } catch {
      // 非 URL 格式，保持原样但不打印 query
    }
    logger.log(`[bilibili-proxy] B站请求启用代理出口: ${safe}`);
  } catch (e) {
    logger.warn(`[bilibili-proxy] 代理初始化失败，回退直连: ${e.message}`);
    dispatcher = null;
  }
  return dispatcher;
}

/** SCF 信封协议专用：把云函数返回的 JSON 包装成 Response 兼容对象 */
class RelayResponse {
  constructor(data) {
    this.status = data.status;
    this.ok = data.status >= 200 && data.status < 300;
    // 最终 URL（云函数跟随重定向后的地址，b23.tv 短链解析依赖）
    this.url = data.url || "";
    this._headers = data.headers || {};
    this._setCookie = data.setCookie || [];
    this._bodyB64 = data.body || "";
  }

  get headers() {
    const headers = this._headers;
    const setCookie = this._setCookie;
    return {
      get: (name) => headers[String(name).toLowerCase()] ?? null,
      has: (name) => String(name).toLowerCase() in headers,
      entries: function* () {
        for (const [k, v] of Object.entries(headers)) yield [k, v];
      },
      // 兼容 extractBilibiliAnonCookie 的多 Set-Cookie 取法
      getSetCookie: () => setCookie.slice(),
    };
  }

  async text() {
    return Buffer.from(this._bodyB64, "base64").toString("utf8");
  }

  async json() {
    return JSON.parse(await this.text());
  }
}

/** 中继转发：请求经国内出口访问 B站 */
let relayLogged = "";
// 客户端侧兜底超时：
// - SCF 信封协议 15s（云函数侧上游 12s，留冷启动/传输余量；2026-10-17 实测
//   SCF 瞬时挂起，客户端无超时曾一路等到 undici 默认 headers 超时 ~300s）；
// - 直通协议 20s（中继自身上游上限 RELAY_TIMEOUT_MS 默认 25s，客户端要更早
//   放弃，免得一个没人要的慢请求把整条解析链路拖长）。
const RELAY_CLIENT_TIMEOUT_MS = 15000;
const PASSTHROUGH_CLIENT_TIMEOUT_MS = 20000;

/**
 * 中继协议：target（自建 Docker 中继，直通）| scf（旧云函数，信封）
 *
 * 显式配置 BILIBILI_RELAY_PROTOCOL 时以配置为准；未配置时**按地址自动判断**
 * ——地址是腾讯云函数（*.tencentscf.com）就走信封协议，否则走直通协议。
 *
 * 为什么要自动判断（2026-11-01 线上实况）：迁移是「换代码」和「换 .env 地址」
 * 两件事，任何一件单独生效都会让 B 站全挂——只换代码时，直通协议去打 SCF
 * 信封中继，对方回 `{"error":"invalid body: ..."}` 且 **HTTP 200**，
 * 上层既没报错也解析不出内容：b23.tv 短链会退化成「好像不是视频链接」，
 * 普通视频链接变成「解析失败！」。按地址判断后，先上代码或先改地址都不会坏，
 * 运维顺序不再敏感。
 */
export function resolveRelayProtocol(relayUrl) {
  const raw = (process.env.BILIBILI_RELAY_PROTOCOL || "").trim().toLowerCase();
  if (raw === "scf" || raw === "target") return raw;
  return /\.tencentscf\.com(?::\d+)?(?:\/|$)/i.test(relayUrl) ? "scf" : "target";
}

function relayEndpoint() {
  const base = (process.env.BILIBILI_RELAY_URL || "").trim().replace(/\/+$/, "");
  return base;
}

/** SCF 信封协议转发（保留作回滚路径，勿删） */
async function scfRelayFetch(relayUrl, url, init = {}) {
  const token = process.env.BILIBILI_RELAY_TOKEN || "";
  if (relayLogged !== "scf") {
    relayLogged = "scf";
    logger.log("[bilibili-relay] B站请求启用云函数中继出口（SCF 信封协议）");
  }
  const response = await undiciFetch(relayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Token": token,
    },
    body: JSON.stringify({
      url,
      method: init.method || "GET",
      headers: init.headers || {},
      body: init.body ? Buffer.from(init.body).toString("base64") : "",
      redirect: init.redirect || "follow",
      timeout: 12000,
    }),
    // 调用方显式传入 signal（如 nav 密钥的 3s）则透传，否则挂兜底超时
    signal: init.signal ?? AbortSignal.timeout(RELAY_CLIENT_TIMEOUT_MS),
  });
  const data = await response.json();
  if (data.error) throw new Error(`中继转发失败: ${data.error}`);
  return new RelayResponse(data);
}

/**
 * 直通协议转发（自建 Docker 中继）：?target= + 原样透传。
 *
 * 实现已抽到 passthrough-relay.js（快手链路复用同一台中继），这里只负责
 * B站侧的地址/令牌与首日志。
 */
async function passthroughRelayFetch(relayUrl, url, init = {}, opts = {}) {
  if (relayLogged !== "target") {
    relayLogged = "target";
    logger.log("[bilibili-relay] B站请求启用自建中继出口（直通协议）");
  }
  return relayPassthrough(relayUrl, url, init, {
    token: process.env.BILIBILI_RELAY_TOKEN || "",
    stream: !!opts.relayStream,
    allowErrorStatus: !!opts.allowErrorStatus,
    timeoutMs: PASSTHROUGH_CLIENT_TIMEOUT_MS,
  });
}

/**
 * 中继 412 退避重试：B站对中继出口 IP 的风控是间歇性的（2026-11-14/15 线上：
 * 两个时段各连续 7/10 次 412，窗口外自愈；412 响应本身很快）。窗口内的长
 * 封锁重试救不了，但单次/短时误伤可靠重试兜住，失败路径只多等 ~3.6s。
 * 只认 412：中继自身故障（x-relay-error）与 B站其他 4xx（内容问题）语义
 * 不同，均不重试。
 */
const RELAY_412_MAX_RETRIES = 2;
const RELAY_412_BACKOFF_MS = [1200, 2400];

function isRelay412Error(error) {
  return error instanceof Error && error.message.startsWith("中继 HTTP 412");
}

async function relayFetchWith412Retry(doFetch, signal) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await doFetch();
    } catch (error) {
      if (
        attempt >= RELAY_412_MAX_RETRIES ||
        !isRelay412Error(error) ||
        signal?.aborted
      ) {
        throw error;
      }
      const backoff = RELAY_412_BACKOFF_MS[attempt];
      logger.warn(
        `[bilibili-relay] 中继出口被 B站风控(412)，${backoff}ms 后重试 ${attempt + 1}/${RELAY_412_MAX_RETRIES}`
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

/**
 * B站专用 fetch：优先中继，其次代理，均未配置时等同原生 fetch。
 *
 * init.biliDirect=true：跳过中继与代理出口，用本机默认出口直连。专供
 * playurl 签发——B站 playurlv3 直链把签发方 IP（oi）绑进校验，视频流必须
 * 从同一出口取（video-proxy 走本机默认出口），经中继签发的链接本机取不了流。
 * 也因此 direct 模式不挂 BILIBILI_PROXY dispatcher：那是另一条出口，取流方
 * （video-proxy）不带 dispatcher，签发与取流会绑到不同 IP。
 *
 * init.relayStream=true：中继转发加 stream=1（流式透传），仅 video-proxy 用。
 *
 * init.relayAllowErrorStatus=true：非 2xx 不抛错也不重试，直接返回响应，
 * 调用方用 response.url 取跳转后的最终地址。专供 b23.tv 短链解析——B站对
 * 机房出口的 www.bilibili.com/video/* 页面恒定 412（带 buvid3/buvid4/Referer
 * 均无效，实测三个不同视频全 412），而短链解析只需跳转结果、根本不需要正文。
 * @param {string} url
 * @param {object} [init] 同 fetch init
 */
export async function biliFetch(url, init = {}) {
  const { biliDirect, relayStream, relayAllowErrorStatus, ...rest } = init;
  if (!biliDirect) {
    const relayUrl = relayEndpoint();
    if (relayUrl) {
      // 已经允许错误状态码时不再做 412 退避重试：这一层重试本来是为「间歇性
      // 风控」准备的，而确定性 412 上重试只会白等 3.6s。
      const doFetch = () =>
        resolveRelayProtocol(relayUrl) === "scf"
          ? scfRelayFetch(relayUrl, url, rest)
          : passthroughRelayFetch(relayUrl, url, rest, {
              relayStream,
              allowErrorStatus: relayAllowErrorStatus,
            });
      return relayAllowErrorStatus
        ? doFetch()
        : relayFetchWith412Retry(doFetch, rest.signal);
    }
    // 代理模式（BILIBILI_PROXY）：与中继一样是「另一条出口」，direct 模式
    // 同样不走——oi 绑定要求签发方与 video-proxy 取流方（本机默认出口）一致
    const d = getDispatcher();
    if (d) {
      rest.dispatcher = d;
    }
  }
  // undici fetch 与标准 fetch 行为兼容（redirect/headers/AbortSignal 均支持）
  return undiciFetch(url, rest);
}

/**
 * B站视频流式取流（video-proxy 专用）：经中继 stream=1 拉流，出口与中继签发的
 * playurl 一致（oi 匹配）。
 *
 * 返回 null 表示「此环境无法经中继流式取流」，调用方维持直连行为：
 * - 未配置中继：直连（直连能通的前提是链接由本机出口签发，直连本来就是对的）；
 * - 中继是 SCF 信封协议：响应体 base64 塞 JSON、无流式且网关 ~750KB 截断，
 *   传视频必然失败，绝不能走。
 */
export function biliStreamFetch(url, init = {}) {
  const relayUrl = relayEndpoint();
  if (!relayUrl || resolveRelayProtocol(relayUrl) === "scf") return null;
  return passthroughRelayFetch(relayUrl, url, init, { relayStream: true });
}
