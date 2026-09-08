/**
 * B 站请求统一出口（三档模式，按优先级自动选择）：
 *
 * 1. 中继模式（BILIBILI_RELAY_URL + BILIBILI_RELAY_TOKEN）：
 *    请求转发到部署在国内区的腾讯云函数（scf-bilibili-relay/），云函数以
 *    腾讯国内 IP 出口访问 B站，绕过 B站对海外数据中心 IP 的 -412 风控。
 *    2026-09-08 线上实证：新加坡出口带完整 WBI 签名 + Cookie 仍 100% 被
 *    IP 级风控拦截，唯有换国内出口有效。
 * 2. 代理模式（BILIBILI_PROXY）：http://[user:pass@]host:port，undici ProxyAgent。
 * 3. 直连（默认）：与原生 fetch 行为完全一致。
 *
 * 协议（中继模式，与 scf-bilibili-relay/server.js 对应）：
 *   POST { url, method, headers, body(b64), redirect, timeout }
 *   ->   { status, url, headers, setCookie: string[], body: base64 } 或 { error }
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

/** 中继响应：把云函数返回的 JSON 包装成 Response 兼容对象 */
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

/** 中继转发：请求经国内云函数访问 B站 */
let relayLogged = false;
async function relayFetch(url, init = {}) {
  const relayUrl = process.env.BILIBILI_RELAY_URL;
  const token = process.env.BILIBILI_RELAY_TOKEN || "";
  if (!relayLogged) {
    relayLogged = true;
    logger.log("[bilibili-relay] B站请求启用云函数中继出口");
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
    // 客户端侧超时（如 nav 密钥获取的 3s）直接透传给中继请求
    signal: init.signal,
  });
  const data = await response.json();
  if (data.error) throw new Error(`中继转发失败: ${data.error}`);
  return new RelayResponse(data);
}

/**
 * B站专用 fetch：优先中继，其次代理，均未配置时等同原生 fetch。
 * @param {string} url
 * @param {object} [init] 同 fetch init
 */
export function biliFetch(url, init = {}) {
  if (process.env.BILIBILI_RELAY_URL) {
    return relayFetch(url, init);
  }
  const d = getDispatcher();
  if (d) {
    init.dispatcher = d;
  }
  // undici fetch 与标准 fetch 行为兼容（redirect/headers/AbortSignal 均支持）
  return undiciFetch(url, init);
}
