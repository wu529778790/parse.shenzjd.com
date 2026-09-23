/**
 * 服务端微信认证守卫
 *
 * 背景：解析接口强制要求用户已完成「关注公众号 + 验证码」认证（登录才能解析）。
 * 凭证：wx-auth-sdk 将签名 token 写入根域 Cookie `wxauth-token`（.shenzjd.com 跨子域
 *       共享），浏览器访问解析接口时自动携带，服务端在此读取并校验。
 *       小程序端没有 Cookie，登录后通过 Authorization: Bearer <token> 头携带同一
 *       token（校验链路相同，无需身份特判）；Cookie 优先，无 Cookie 凭证时才取 Bearer。
 * 校验：远程调 wx-auth 的 /api/auth/check?token=xxx —— 权威校验（查用户表
 *       active 状态，取关/封禁即失效），不共享密钥。地址与重试见
 *       lib/wx-auth-endpoint.ts（内网优先，瞬时失败自愈一次）。
 * 缓存：校验结果按 token 缓存 10 分钟（策略经确认：长缓存减少外部请求，代价是取关后
 *       最长 10 分钟内仍可解析）；「明确未认证」也缓存（防刷），「认证服务异常」不缓存
 *       （fail closed 拒绝本次，服务恢复后立即生效）。
 */

import { wxAuthFetch } from "@/lib/wx-auth-endpoint";

const AUTH_CACHE_TTL_MS = 10 * 60 * 1000;
const AUTH_CACHE_MAX = 500;
// 单次尝试超时。原来 5s 是「一次定生死」，现在允许重试一次（见 wx-auth-endpoint），
// 故单次收到 2.5s：最坏 2×2.5s+退避 ≈ 原最坏 5s，但单次抖动可自愈。
const AUTH_FETCH_TIMEOUT_MS = 2500;

interface AuthCacheEntry {
  authenticated: boolean;
  expiresAt: number;
}

const authCache = new Map<string, AuthCacheEntry>();

interface UserInfoCacheEntry {
  authenticated: boolean;
  isAdmin: boolean;
  expiresAt: number;
}

// 用户详情缓存（isAdmin 变化频率极低，与 check 同款 10 分钟策略）
const userInfoCache = new Map<string, UserInfoCacheEntry>();

/**
 * 从请求中提取认证 token：
 * 1. Cookie `wxauth-token`（网页端 SDK 写入，优先）
 * 2. 无 Cookie 凭证时取 Authorization: Bearer <token>（小程序端）
 * @returns token 或 null（无凭证）
 */
export function getWxAuthToken(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return getBearerToken(request);
  const match = cookie.match(/(?:^|;\s*)wxauth-token=([^;]+)/);
  if (!match) return getBearerToken(request);
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * 从 Authorization 头提取 Bearer token（scheme 大小写不敏感，去前缀后 trim）
 */
function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = authorization.match(/^\s*bearer\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

/**
 * 校验认证 token 是否有效（是否已关注公众号并完成认证）
 * - 缓存命中（10 分钟内）直接返回缓存结果
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
    const response = await wxAuthFetch(
      `/api/auth/check?token=${encodeURIComponent(token)}`,
      {
        headers: { "user-agent": "parse.shenzjd.com/auth-guard" },
        timeoutMs: AUTH_FETCH_TIMEOUT_MS,
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

  // 认证服务异常不缓存（fail closed 拒绝本次，避免把错误状态缓存 10 分钟）
  if (!checkError) {
    if (authCache.size >= AUTH_CACHE_MAX) authCache.clear(); // 简单防膨胀
    authCache.set(token, {
      authenticated,
      expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
    });
  }
  return authenticated;
}

/**
 * 查询认证用户详情（含管理员标记），供管理类接口做放权判断。
 * 走 wx-auth 的 /api/auth/userinfo（签名 token 校验后返回 role/isAdmin 等）。
 * 缓存策略与 checkWxAuthToken 一致：命中 10 分钟内直接返回；
 * 服务异常 fail closed（authenticated=false）且不缓存。
 */
export async function getWxAuthUser(request: Request): Promise<{
  authenticated: boolean;
  isAdmin: boolean;
}> {
  const token = getWxAuthToken(request);
  if (!token) return { authenticated: false, isAdmin: false };

  const cached = userInfoCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return { authenticated: cached.authenticated, isAdmin: cached.isAdmin };
  }

  let authenticated = false;
  let isAdmin = false;
  let checkError = false;
  try {
    const response = await wxAuthFetch(
      `/api/auth/userinfo?token=${encodeURIComponent(token)}`,
      {
        headers: { "user-agent": "parse.shenzjd.com/auth-guard" },
        timeoutMs: AUTH_FETCH_TIMEOUT_MS,
      }
    );
    if (response.ok) {
      const data = await response.json();
      authenticated = data?.authenticated === true;
      isAdmin = authenticated && data?.user?.isAdmin === true;
    } else {
      checkError = true;
    }
  } catch (error) {
    checkError = true;
    console.error(
      "[wx-auth-guard] 用户详情 userinfo 请求失败:",
      error instanceof Error ? error.message : error
    );
  }

  if (!checkError) {
    if (userInfoCache.size >= AUTH_CACHE_MAX) userInfoCache.clear();
    userInfoCache.set(token, {
      authenticated,
      isAdmin,
      expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
    });
  }
  return { authenticated, isAdmin };
}
