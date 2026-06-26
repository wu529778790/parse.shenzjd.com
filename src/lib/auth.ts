// 共享的 Basic Auth 校验逻辑
// api-middleware 与 proxy 路由共用同一实现，避免复制粘贴导致的策略漂移
//
// 注意：bilibili/kuaishou/xhs 等 7 个路由声明了 edge runtime，
// 它们通过 createApiHandler 间接 import 本模块，故此处不能使用 Node 专属 API
// （如 node:crypto 的 timingSafeEqual），必须用跨运行时（Edge + Node）的 Web 标准 API。

const AUTH_USERNAME = process.env.API_AUTH_USERNAME;
const AUTH_PASSWORD = process.env.API_AUTH_PASSWORD;

/**
 * 是否启用了 Basic Auth（配置了用户名+密码才启用）
 */
export function isAuthEnabled(): boolean {
  return Boolean(AUTH_USERNAME && AUTH_PASSWORD);
}

/**
 * 常量时间字符串比较，避免时序侧信道。
 * 纯 Web API 实现（TextEncoder + 手写 XOR 累加），Edge 与 Node 运行时通用。
 * 长度不等时仍返回 false（密码长度本身非高价值秘密，业界通用做法）。
 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = new TextEncoder().encode(a);
  const bBuf = new TextEncoder().encode(b);
  if (aBuf.length !== bBuf.length) return false;
  // 逐字节 XOR 累加：只要有一个字节不同，结果非 0
  let diff = 0;
  for (let i = 0; i < aBuf.length; i++) {
    diff |= aBuf[i] ^ bBuf[i];
  }
  return diff === 0;
}

/**
 * 验证 Basic Auth。
 * - 未配置凭据时返回 true（不启用鉴权）
 * - 正确按第一个冒号拆分，密码含冒号也能正常工作
 * - 用户名/密码均用常量时间比较
 */
export function verifyBasicAuth(request: Request): boolean {
  // 没有配置用户名密码，则跳过验证
  if (!AUTH_USERNAME || !AUTH_PASSWORD) {
    return true;
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  try {
    const base64Credentials = authHeader.slice(6);
    // atob 是 Web 标准 API（Edge/Node 通用），解码 base64 凭据
    const credentials = atob(base64Credentials);
    // Basic Auth 规范：userid ":" password，密码允许含冒号，只按第一个冒号拆分
    const idx = credentials.indexOf(":");
    if (idx < 0) return false;
    const username = credentials.slice(0, idx);
    const password = credentials.slice(idx + 1);

    return safeEqual(username, AUTH_USERNAME) && safeEqual(password, AUTH_PASSWORD);
  } catch {
    return false;
  }
}

/**
 * 返回 401 未授权响应
 */
export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      code: 401,
      msg: "未授权访问，请提供有效的认证信息",
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Basic realm="Video Parser API"',
      },
    }
  );
}
