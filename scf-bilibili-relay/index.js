/**
 * 腾讯云函数（Web 函数）—— B站请求中继
 *
 * 背景：部署服务器在海外（新加坡），出口 IP 被 B站风控拉黑（-412），
 * 即使带完整 WBI 签名 + 匿名 Cookie 也被拦。云函数部署在国内区后出口为
 * 腾讯国内 IP，B站不标记，故作为 B站请求的转发中继。
 *
 * 部署：Web 函数，配合 scf_bootstrap 启动，监听 0.0.0.0:9000。
 *
 * 协议（与主站 src/lib/bilibili-fetch.js 对应，POST JSON）：
 *   请求: { url, method?, headers?, body?(base64), redirect?, timeout? }
 *   响应: { status, url, headers, setCookie: string[], body: base64 }
 *         或 { error: "..." }
 *
 * 安全：
 * - RELAY_TOKEN 环境变量鉴权（请求头 X-Relay-Token 必须匹配），防止被白嫖；
 * - 目标域名白名单（仅 B站系域名），防止沦为开放代理。
 *
 * 运行环境：Node.js 18+（依赖内置 fetch）。
 */

const http = require("http");

const PORT = Number(process.env.PORT) || 9000;
const TOKEN = process.env.RELAY_TOKEN || "";
const MAX_BODY = 64 * 1024; // 请求体上限
const DEFAULT_TIMEOUT = 12000;
const MAX_TIMEOUT = 25000;

// 仅允许转发到 B站系域名（api.bilibili.com / www.bilibili.com / b23.tv 等）
const HOST_RE = /(^|\.)(bilibili\.com|b23\.tv|hdslb\.com|biliapi\.net|bilivideo\.com)$/;

// 不透传的 hop-by-hop / 结构性请求头
const STRIP_REQ_HEADERS = new Set([
  "host", "connection", "keep-alive", "transfer-encoding", "upgrade",
  "content-length", "accept-encoding", "proxy-authorization", "proxy-connection",
]);

// 不回传的响应头（body 已解压重编码，长度等需重算）
const STRIP_RES_HEADERS = new Set([
  "set-cookie", "transfer-encoding", "content-encoding", "content-length", "connection",
]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, data) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  try {
    // 鉴权：配置了 RELAY_TOKEN 时必须匹配
    if (TOKEN && req.headers["x-relay-token"] !== TOKEN) {
      return json(res, { error: "forbidden" });
    }

    let params;
    try {
      params = JSON.parse(await readBody(req));
    } catch (e) {
      return json(res, { error: `invalid body: ${e.message}` });
    }

    const {
      url,
      method = "GET",
      headers = {},
      body = "",
      redirect = "follow",
      timeout = DEFAULT_TIMEOUT,
    } = params || {};

    if (typeof url !== "string" || !url) {
      return json(res, { error: "missing url" });
    }
    let target;
    try {
      target = new URL(url);
    } catch {
      return json(res, { error: "invalid url" });
    }
    if (!/^https?:$/.test(target.protocol) || !HOST_RE.test(target.hostname)) {
      return json(res, { error: `host not allowed: ${target.hostname}` });
    }

    // 透传请求头（剔除 hop-by-hop）
    const fwdHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      if (!STRIP_REQ_HEADERS.has(k.toLowerCase()) && typeof v === "string") {
        fwdHeaders[k] = v;
      }
    }

    const init = {
      method: ["GET", "HEAD", "POST"].includes(method) ? method : "GET",
      redirect,
      headers: fwdHeaders,
      signal: AbortSignal.timeout(
        Math.min(Number(timeout) || DEFAULT_TIMEOUT, MAX_TIMEOUT)
      ),
    };
    if (body) init.body = Buffer.from(body, "base64");

    const upstream = await fetch(target.toString(), init);
    const buf = Buffer.from(await upstream.arrayBuffer());

    let setCookie = [];
    try {
      if (typeof upstream.headers.getSetCookie === "function") {
        setCookie = upstream.headers.getSetCookie();
      } else {
        for (const [k, v] of upstream.headers.entries()) {
          if (k.toLowerCase() === "set-cookie") setCookie.push(v);
        }
      }
    } catch {
      // 忽略，set-cookie 缺失不影响主流程
    }

    const outHeaders = {};
    upstream.headers.forEach((v, k) => {
      if (!STRIP_RES_HEADERS.has(k.toLowerCase())) outHeaders[k] = v;
    });

    return json(res, {
      status: upstream.status,
      url: upstream.url, // 跟随重定向后的最终 URL（b23.tv 短链解析依赖）
      headers: outHeaders,
      setCookie,
      body: buf.toString("base64"),
    });
  } catch (e) {
    // 统一 200 + error 字段，主站据此区分上游错误与中继错误
    return json(res, { error: e.message || String(e) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`bilibili relay listening on ${PORT}`);
});
