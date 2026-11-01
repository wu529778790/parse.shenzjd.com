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

/**
 * 直通协议（自建 Docker 中继）的 Response 包装。
 *
 * 只为一件事而存在：中继是「替我们 fetch 一次再原样透传」，重定向由中继
 * 侧跟随，主服务拿到的 Response.url 是「中继地址」而非 B站最终地址。
 * b23.tv 短链解析依赖最终地址，故顶层 url 优先取中继回传的
 * x-relay-final-url（中继 URL 编码过，防 header 非法字符）。
 */
class PassthroughResponse {
  constructor(response) {
    this._res = response;
  }

  get status() {
    return this._res.status;
  }

  get ok() {
    return this._res.ok;
  }

  get headers() {
    return this._res.headers;
  }

  // 视频流式转发（video-proxy）需要原始响应体流；API 调用方只用 text()/json()，
  // 互不干扰。仅直通协议的中继响应是真流式（stream=1 模式）。
  get body() {
    return this._res.body;
  }

  get url() {
    const finalUrl = this._res.headers.get("x-relay-final-url");
    if (finalUrl) {
      try {
        return decodeURIComponent(finalUrl);
      } catch {
        // 解码失败（中继版本不匹配等）时退回中继地址，不影响正文解析
      }
    }
    return this._res.url;
  }

  text() {
    return this._res.text();
  }

  json() {
    return this._res.json();
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

/** 直通协议转发（自建 Docker 中继）：?target= + 原样透传 */
async function passthroughRelayFetch(relayUrl, url, init = {}, opts = {}) {
  const token = process.env.BILIBILI_RELAY_TOKEN || "";
  if (relayLogged !== "target") {
    relayLogged = "target";
    logger.log("[bilibili-relay] B站请求启用自建中继出口（直通协议）");
  }
  const headers = {
    ...(init.headers || {}),
    // 中继用它鉴权，转发前会剔除，不会泄给 B站
    "x-relay-token": token,
  };
  // stream=1：中继流式透传响应体（不整包缓冲）。只有视频流转发用得到——
  // 旧中继版本不认识该参数时会按缓冲模式返回，功能不坏，只是大响应慢。
  const targetQuery = opts.relayStream
    ? `?target=${encodeURIComponent(url)}&stream=1`
    : `?target=${encodeURIComponent(url)}`;
  const response = await undiciFetch(`${relayUrl}/${targetQuery}`, {
    method: init.method || "GET",
    headers,
    body: init.body,
    redirect: init.redirect || "follow",
    signal: init.signal ?? AbortSignal.timeout(PASSTHROUGH_CLIENT_TIMEOUT_MS),
  });
  // 中继自身故障（自己超时掐断 / 上游 fetch 抛错）显式标记，别和 B站
  // 自己的 5xx 混为一谈：前者重试往往能好，后者基本是内容问题。
  const relayError = response.headers.get("x-relay-error");
  if (relayError) {
    throw new Error(`中继故障(${relayError}) HTTP ${response.status}`);
  }
  // 中继「自己的拒绝」不带 x-relay-error，是 text/plain 小响应：
  //   403 forbidden（token 不符）/ 400 bad target（target 不在白名单）/
  //   503 relay not configured（容器没拿到 RELAY_TOKEN）。
  // 以前这类响应被当成「B站返回的正文」继续往下走，结果 b23 短链拿不到跳转
  // 后的地址，用户只看到「好像不是视频链接」，线上完全无法归因（2026-11-01）。
  // 这里统一转成带状态码与正文片段的中继错误。
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 200);
    } catch {
      /* 读不到正文就只报状态码 */
    }
    throw new Error(`中继 HTTP ${response.status}: ${detail}`);
  }
  return new PassthroughResponse(response);
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
 * @param {string} url
 * @param {object} [init] 同 fetch init
 */
export function biliFetch(url, init = {}) {
  const { biliDirect, relayStream, ...rest } = init;
  if (!biliDirect) {
    const relayUrl = relayEndpoint();
    if (relayUrl) {
      return resolveRelayProtocol(relayUrl) === "scf"
        ? scfRelayFetch(relayUrl, url, rest)
        : passthroughRelayFetch(relayUrl, url, rest, { relayStream });
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
