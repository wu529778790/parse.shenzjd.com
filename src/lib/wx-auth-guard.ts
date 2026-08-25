/**
 * 服务端微信认证守卫
 *
 * 背景：解析接口强制要求用户已完成「关注公众号 + 验证码」认证（登录才能解析）。
 * 凭证：wx-auth-sdk 将签名 token 写入根域 Cookie `wxauth-token`（.shenzjd.com 跨子域
 *       共享），浏览器访问解析接口时自动携带，服务端在此读取并校验。
 * 校验：远程调 wx-auth.shenzjd.com/api/auth/check?token=xxx —— 权威校验（查用户表
 *       active 状态，取关/封禁即失效），不共享密钥。
 * 缓存：校验结果按 token 缓存 5 分钟（策略经确认：长缓存减少外部请求，代价是取关后
 *       最长 5 分钟内仍可解析）；「明确未认证」也缓存（防刷），「认证服务异常」不缓存
 *       （fail closed 拒绝本次，服务恢复后立即生效）。
 */

const AUTH_API_BASE =
  process.env.WXAUTH_API_BASE || "https://wx-auth.shenzjd.com";
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTH_CACHE_MAX = 500;
const AUTH_FETCH_TIMEOUT_MS = 5000;

interface AuthCacheEntry {
  authenticated: boolean;
  expiresAt: number;
}

const authCache = new Map<string, AuthCacheEntry>();

/**
 * 从请求 Cookie 中提取认证 token（SDK 写入的 wxauth-token）
 * @returns token 或 null（无凭证）
 */
export function getWxAuthToken(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(/(?:^|;\s*)wxauth-token=([^;]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * 校验认证 token 是否有效（是否已关注公众号并完成认证）
 * - 缓存命中（5 分钟内）直接返回缓存结果
 * - 远程 check：authenticated=true → 缓存并放行
 * - 明确未认证 → 缓存 false（防刷）
 * - 认证服务异常 → fail closed 拒绝本次，但不缓存（服务恢复后立即生效）
 */
export async function checkWxAuthToken(token: string): Promise<boolean> {
  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.authenticated;
  }

  let authenticated = false;
  let checkError = false;
  try {
    const response = await fetch(
      `${AUTH_API_BASE}/api/auth/check?token=${encodeURIComponent(token)}`,
      {
        headers: { "user-agent": "parse.shenzjd.com/auth-guard" },
        signal: AbortSignal.timeout(AUTH_FETCH_TIMEOUT_MS),
      }
    );
    if (response.ok) {
      const data = await response.json();
      authenticated = data?.authenticated === true;
    } else {
      checkError = true;
    }
  } catch (error) {
    checkError = true;
    console.error(
      "[wx-auth-guard] 认证服务 check 请求失败:",
      error instanceof Error ? error.message : error
    );
  }

  // 认证服务异常不缓存（fail closed 拒绝本次，避免把错误状态缓存 5 分钟）
  if (!checkError) {
    if (authCache.size >= AUTH_CACHE_MAX) authCache.clear(); // 简单防膨胀
    authCache.set(token, {
      authenticated,
      expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
    });
  }
  return authenticated;
}
