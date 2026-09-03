/**
 * floating-unlock · 业务后端验票守卫（服务端）
 *
 * 安全口径：前端 unlock() 返回的 { ok: true, ticket, grant } 不代表放行。
 * grant 是一次性 HMAC 票据（wx-auth 签发、只能核销一次），业务接口放行前
 * 必须携带 ticket + grant 调 wx-auth POST /api/auth/mp-reward/verify 验票核销：
 *   - 响应 valid: true            → 放行
 *   - valid: false / already_consumed / invalid_grant / 网络异常 → 一律不放行（403）
 * 校验只能在服务端做，不能在前端判断；改前端代码无法绕过。
 *
 * 与 wx-auth-guard 的区别：
 *   - 验票结果【不缓存】—— grant 是一次性票据，缓存会让同一 grant 在 TTL 内重复放行。
 *   - fail closed：wx-auth 不可用时拒绝本次，避免「验票服务挂了就全站免费」。
 *
 * 使用方式（触发时机由 src/config/floating-unlock.ts 的 enableGate 控制，
 * 待接线时在业务接口（如 /api/parse）放行前调用）：
 *   const gate = await enforceFloatingUnlock(request, headers);
 *   if (!gate.pass) return gate.response;   // 403
 */

import { floatingUnlockConfig } from "@/config/floating-unlock";

const VERIFY_API_BASE =
  process.env.FLOATING_UNLOCK_API_BASE || floatingUnlockConfig.apiBase;
const VERIFY_PATH = "/api/auth/mp-reward/verify";
const VERIFY_TIMEOUT_MS = 5000;
const DENY_HTTP_STATUS = 403;
const DENY_HTTP_CODE = 403;

/** 从请求头解析出的验票凭证 */
export interface UnlockCredentials {
  ticket: string;
  grant: string;
}

/** 守卫结论：通过 / 拒绝（拒绝时附带给用户的文案与原因，原因供日志，不外泄） */
export type FloatingUnlockCheck =
  | { pass: true }
  | {
      pass: false;
      /** missing=无票据头；rejected=验票明确不通过；unreachable=验票服务不可达（fail closed） */
      reason: "missing" | "rejected" | "unreachable";
      msg: string;
    };

/** 验票单接口结论 */
export type VerifyUnlockVerdict =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * gate 是否开启：默认跟随配置（enableGate: true）。
 * 环境变量覆盖：FLOATING_UNLOCK_GATE=1/true 强制开启；=0/false 强制关闭（线上快速回退用）。
 */
export function isUnlockGateEnabled(): boolean {
  const env = process.env.FLOATING_UNLOCK_GATE;
  if (env === "1" || env === "true" || env === "TRUE") return true;
  if (env === "0" || env === "false" || env === "FALSE") return false;
  return floatingUnlockConfig.enableGate;
}

function readHeader(request: Request, name: string): string | null {
  const value = request.headers.get(name);
  return value && value.trim() ? value.trim() : null;
}

/** 从请求头读取 x-unlock-ticket / x-unlock-grant，任一缺失或为空视为无凭证 */
export function getUnlockCredentials(
  request: Request
): UnlockCredentials | null {
  const ticket = readHeader(request, "x-unlock-ticket");
  const grant = readHeader(request, "x-unlock-grant");
  return ticket && grant ? { ticket, grant } : null;
}

/**
 * 调 wx-auth verify 接口验票并核销。
 * @returns valid:true 放行；否则附 reason（debug/日志用，不回给客户端）。
 */
export async function verifyUnlockTicket(
  credentials: UnlockCredentials,
  apiBase: string = VERIFY_API_BASE
): Promise<VerifyUnlockVerdict> {
  try {
    const response = await fetch(`${apiBase}${VERIFY_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "parse.shenzjd.com/unlock-verify",
      },
      body: JSON.stringify({
        ticket: credentials.ticket,
        grant: credentials.grant,
      }),
      // 一次性票据，绝不缓存，避免同一 grant 重复放行
      cache: "no-store",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { valid: false, reason: `verify-http-${response.status}` };
    }
    let data: { valid?: unknown; code?: unknown } | null = null;
    try {
      data = (await response.json()) as { valid?: unknown; code?: unknown };
    } catch {
      return { valid: false, reason: "verify-bad-json" };
    }
    if (data?.valid === true) return { valid: true };
    // wx-auth 侧常用 code 标识：already_consumed / invalid_grant / expired ...
    return {
      valid: false,
      reason:
        typeof data?.code === "string" && data.code
          ? data.code
          : "verify-rejected",
    };
  } catch (error) {
    console.error(
      "[floating-unlock-verify] 验票服务请求失败:",
      error instanceof Error ? error.message : error
    );
    return { valid: false, reason: "verify-unreachable" };
  }
}

/** 高可读的守卫判定（缺票 / 无效 / 服务异常 → 一律拒绝） */
export async function checkFloatingUnlock(
  request: Request
): Promise<FloatingUnlockCheck> {
  const credentials = getUnlockCredentials(request);
  if (!credentials) {
    return {
      pass: false,
      reason: "missing",
      msg: "缺少解锁凭证，请先观看广告完成解锁后重试",
    };
  }
  const verdict = await verifyUnlockTicket(credentials);
  if (verdict.valid) return { pass: true };
  if (verdict.reason === "verify-unreachable") {
    return {
      pass: false,
      reason: "unreachable",
      msg: "解锁服务暂时不可用，请稍后重试",
    };
  }
  return {
    pass: false,
    reason: "rejected",
    msg: "解锁已失效或已使用，请重新观看广告后再试",
  };
}

/**
 * 业务接口可直接套用的守卫：通过返回 { pass: true }；
 * 拒绝时直接返回一个已构造好的 403 Response（业务方 return 它即可）。
 * @param request     业务请求（读取 x-unlock-ticket / x-unlock-grant 头）
 * @param extraHeaders 需要随 403 带出的响应头（如 CORS），与代码库中间件用法一致
 */
export async function enforceFloatingUnlock(
  request: Request,
  extraHeaders: Record<string, string> = {}
): Promise<
  | { pass: true }
  | {
      pass: false;
      reason: "missing" | "rejected" | "unreachable";
      response: Response;
    }
> {
  const check = await checkFloatingUnlock(request);
  if (check.pass) return { pass: true };
  const headers = { "content-type": "application/json", ...extraHeaders };
  return {
    pass: false,
    reason: check.reason,
    response: Response.json(
      {
        code: DENY_HTTP_CODE,
        msg: check.msg,
      },
      { status: DENY_HTTP_STATUS, headers }
    ),
  };
}
