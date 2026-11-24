/**
 * 自建中继（直通协议）客户端。
 *
 * 协议：GET/POST `{RELAY_URL}/?target=<urlencode(目标地址)>`，鉴权头
 * `x-relay-token`，请求头 / 正文 / 状态码原样透传；重定向由中继侧跟随，
 * 最终地址回在 `x-relay-final-url`（URL 编码，防 header 非法字符）。
 *
 * 为什么单独成模块：同一台中继（广州轻量云，代码见 panhub 仓库
 * scripts/quark-relay-scf/app.cjs）现在服务多条链路——B站（绕开海外出口
 * 被 -412 风控，见 bilibili-fetch.js）与快手（绕开跨境慢链路，见
 * kuaishou-fetch.js）。中继协议只保留一份实现，调用方各自传地址与令牌。
 *
 * 只实现「直通协议」。旧的腾讯云函数（SCF 信封协议）响应体 base64 塞 JSON，
 * 体积放大 ~33% 且在 ~750KB 处被网关截断，不适合复用，B站侧保留回滚路径
 * 但快手侧不接。
 */

/** 中继「替我们 fetch 一次再原样透传」的 Response 包装 */
export class PassthroughResponse {
  /**
   * @param {Response} response 中继返回的原始响应
   * @param {string|null} bodyText 已缓冲的正文（用于提前取走 body 的场景，
   *   例如只关心最终地址、不关心正文；不传则延迟到调用方 text() 时再读）
   */
  constructor(response, bodyText = null) {
    this._res = response;
    this._bodyText = bodyText;
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

  /**
   * 最终 URL：优先取中继回传的 x-relay-final-url，因为主服务看到的
   * Response.url 是「中继地址」而不是目标站跟随重定向后的地址。
   */
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
    if (this._bodyText !== null) return Promise.resolve(this._bodyText);
    return this._res.text();
  }

  json() {
    if (this._bodyText !== null) {
      try {
        return Promise.resolve(JSON.parse(this._bodyText));
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return this._res.json();
  }
}

/** 中继请求的默认超时：中继自身上游上限 25s，客户端要更早放弃 */
export const PASSTHROUGH_TIMEOUT_MS = 20000;

/**
 * 经中继转发一次请求。
 *
 * @param {string} relayUrl 中继根地址（不带尾斜杠）
 * @param {string} targetUrl 目标地址
 * @param {object} [init] 同 fetch init（headers / method / body / redirect / signal）
 * @param {object} [opts]
 * @param {string} [opts.token] 中继鉴权令牌
 * @param {boolean} [opts.stream] 中继流式透传（stream=1），仅视频流转发用
 * @param {boolean} [opts.allowErrorStatus] 非 2xx 不抛错，直接返回响应。
 *   专供「只关心跳转后最终地址」的场景：目标站对机房出口恒定 412，但中继
 *   依然回传了 x-relay-final-url，把 412 当失败纯属自找（见 b23.tv 短链）。
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<PassthroughResponse>}
 */
export async function relayPassthrough(relayUrl, targetUrl, init = {}, opts = {}) {
  const {
    token = "",
    stream = false,
    allowErrorStatus = false,
    timeoutMs = PASSTHROUGH_TIMEOUT_MS,
  } = opts;

  const headers = {
    ...(init.headers || {}),
    // 中继用它鉴权，转发前会剔除，不会泄给目标站
    "x-relay-token": token,
  };
  const targetQuery = stream
    ? `?target=${encodeURIComponent(targetUrl)}&stream=1`
    : `?target=${encodeURIComponent(targetUrl)}`;

  const response = await fetch(`${relayUrl}/${targetQuery}`, {
    method: init.method || "GET",
    headers,
    body: init.body,
    redirect: init.redirect || "follow",
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });

  // 中继自身故障（自己超时掐断 / 上游 fetch 抛错）显式标记，别和目标站
  // 自己的 5xx 混为一谈：前者重试往往能好，后者基本是内容问题。
  const relayError = response.headers.get("x-relay-error");
  if (relayError) {
    throw new Error(`中继故障(${relayError}) HTTP ${response.status}`);
  }

  if (!response.ok) {
    // 只关心最终地址的场景：中继已回传 x-relay-final-url，正文无用，
    // 读掉 body 释放连接后按正常响应返回（调用方拿 .url 即可）。
    if (allowErrorStatus && response.headers.get("x-relay-final-url")) {
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch {
        /* 读不到正文不影响取地址 */
      }
      return new PassthroughResponse(response, bodyText);
    }
    // 中继「自己的拒绝」不带 x-relay-error，是 text/plain 小响应：
    //   403 forbidden（token 不符）/ 400 bad target（target 不在白名单）/
    //   503 relay not configured（容器没拿到 RELAY_TOKEN）。
    // 以前这类响应被当成「目标站返回的正文」继续往下走，结果 b23 短链拿不到
    // 跳转后的地址，用户只看到「好像不是视频链接」，线上完全无法归因（2026-11-01）。
    // 这里统一转成带状态码与正文片段的中继错误。
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
