/**
 * wx-auth 接入地址（多出口解析 + 出口熔断）与转发
 *
 * 背景（2026-09-23 线上日志实证）：解析服务与 wx-auth 是同宿主的两个容器，
 * 但服务端校验走的是公网域名 https://wx-auth.shenzjd.com —— 请求要绕出机房、
 * 经 Cloudflare 回源再绕回来，实测偶发 5s 超时（`The operation was aborted due
 * to timeout` / `fetch failed`）。认证守卫是 fail-closed 的，链路抖一下就把
 * 「已认证的真实用户」判成 401（日志里同一 IP 紧接着重试一次就成功了）。
 *
 * 两条网络路径其实都在：
 * - 内网直连（host.docker.internal / 私网 IP / localhost）——毫秒级；
 * - 公网回源（wx-auth.shenzjd.com 经 Cloudflare 橙云）——1~2s。
 * wx-auth 的部署把 6702 同时绑在 127.0.0.1 与 docker0 网关上，就是为此准备的。
 *
 * 设计对齐 panhub（server/core/utils/wxAuthBase.ts）——那边踩过坑并已线上验证：
 * 1. **多出口按序回退**：`WXAUTH_API_BASE` 支持逗号分隔多地址；
 *    配的全是内网地址时**自动追加**内置公网出口（内网挂了还有公网这条路，
 *    2026-09-21 panhub 正是"只配内网出口 + 宿主映射消失"导致全站 401）；
 *    已配公网出口则不再追加（fork 站用自己的域名，替它决定"信任谁"是红线）。
 * 2. **出口熔断**：连接层连续失败 3 次 → 冷却 60s 跳过该出口。慢死（挂到超时）
 *    比快死更伤——每次请求都先白等一段，熔断后这段时间直接走健康出口。
 *    全部冷却时照旧全试，绝不出现"没有出口可用"。
 * 3. **瞬时重试**：单出口配置时失败重试一次。这里接口全部幂等，重发无副作用：
 *    check/userinfo/balance 只读；spend 靠 actionId 幂等；checkin 一人一天一次。
 *    HTTP 状态码不算失败（4xx/5xx 交调用方按语义处理），只有网络层错误才换出口。
 */

/** 内置公网出口：未配 env 时的缺省，也是「全是内网出口」时的兜底 */
export const DEFAULT_WX_AUTH_PUBLIC_BASE = "https://wx-auth.shenzjd.com";

/** 重试间隔（瞬时抖动，给一个很短的退避即可） */
const RETRY_DELAY_MS = 150;
/** 连接层连续失败几次后熔断该出口 */
const BASE_FAILURES_TO_OPEN = 3;
/** 熔断冷却时长 */
const BASE_OPEN_COOLDOWN_MS = 60_000;

let endpointLogged = false;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** 内网出口判定：命中即认为「同机/私网直连」，毫秒级且不经 Cloudflare */
export function wxAuthBaseKind(base: string): "internal" | "public" {
  try {
    const host = new URL(base).hostname.toLowerCase();
    const isPrivate =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "host.docker.internal" ||
      // IPv6 回环：URL.hostname 对 IPv6 保留方括号，两种写法都认
      host === "::1" ||
      host === "[::1]" ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    return isPrivate ? "internal" : "public";
  } catch {
    // 连 URL 都解析不了（配置写坏了）：按 public 记，至少能被日志发现
    return "public";
  }
}

/**
 * 解析出口列表（env `WXAUTH_API_BASE`，逗号/分号/空白分隔，按序优先）。
 * 兼容 panhub 的变量名 `WX_AUTH_API_BASE`（同一套部署习惯）。
 */
export function resolveWxAuthBaseUrls(
  envValue: string | undefined = process.env.WXAUTH_API_BASE ||
    process.env.WX_AUTH_API_BASE
): string[] {
  const configured = (envValue ?? "")
    .split(/[,;\s]+/)
    .map((s) => stripTrailingSlash(s.trim()))
    .filter(Boolean);
  const bases = configured.length ? configured : [DEFAULT_WX_AUTH_PUBLIC_BASE];
  const withFallback = bases.some((b) => wxAuthBaseKind(b) === "public")
    ? bases
    : [...bases, DEFAULT_WX_AUTH_PUBLIC_BASE];
  const unique = [...new Set(withFallback)];

  // 首次解析时打一行出口清单：线上靠它确认「是否已走内网」
  if (!endpointLogged && process.env.VITEST !== "true") {
    endpointLogged = true;
    console.log(
      `[wx-auth-endpoint] 服务端访问出口: ${unique
        .map((b) => `${b}(${wxAuthBaseKind(b)})`)
        .join(" -> ")}${
        wxAuthBaseKind(unique[0]) === "public" ? "（公网，建议改内网）" : ""
      }`
    );
  }
  return unique;
}

// ---------- 出口熔断 ----------

const baseHealth = new Map<string, { failures: number; openUntil: number }>();

/** 该出口返回了 HTTP 响应（任何状态码）→ 视为通，清零失败计数 */
export function noteWxAuthBaseSuccess(base: string): void {
  baseHealth.delete(base);
}

/** 该出口连接层失败（网络错误/超时）→ 计一次；连续失败到阈值就冷却一段时间 */
export function noteWxAuthBaseFailure(
  base: string,
  now: number = Date.now()
): void {
  const prev = baseHealth.get(base);
  const failures = (prev?.failures ?? 0) + 1;
  baseHealth.set(base, {
    failures,
    openUntil:
      failures >= BASE_FAILURES_TO_OPEN
        ? now + BASE_OPEN_COOLDOWN_MS
        : (prev?.openUntil ?? 0),
  });
}

/**
 * 本次请求要尝试的出口顺序：跳过冷却中的出口。
 * 全部冷却时照旧全试——宁可多花一次超时，也绝不出现「没有出口可用」。
 */
export function pickWxAuthBaseUrls(now: number = Date.now()): string[] {
  const all = resolveWxAuthBaseUrls();
  const healthy = all.filter((b) => (baseHealth.get(b)?.openUntil ?? 0) <= now);
  return healthy.length ? healthy : all;
}

/** 测试用：清空出口健康状态 */
export function resetWxAuthBaseHealth(): void {
  baseHealth.clear();
}

export interface WxAuthFetchOptions extends Omit<RequestInit, "signal"> {
  /** 单次尝试的超时（ms）；每次尝试重新计时 */
  timeoutMs: number;
  /** 单出口配置时的额外重试次数，默认 1；多出口时天然互为重试，不再叠加 */
  retries?: number;
}

/**
 * 生成实际尝试序列：
 * - 多出口：[内网, 公网]（每个一次，备用出口本身就是重试）
 * - 单出口：retries>0 时 [base, base]
 * 这样最坏耗时约等于「出口数 × 单次超时」，不会因为重试把预算翻几倍。
 */
function buildAttemptPlan(bases: string[], retries: number): string[] {
  if (bases.length > 1) return bases;
  return retries > 0 ? [bases[0], bases[0]] : bases;
}

/**
 * 带「多出口回退 + 熔断 + 瞬时重试」的 wx-auth 请求。
 * HTTP 状态码不抛异常（调用方按 status 处理）；只有网络层全失败才抛出最后一次错误。
 */
export async function wxAuthFetch(
  pathname: string,
  { timeoutMs, retries = 1, ...init }: WxAuthFetchOptions
): Promise<Response> {
  const plan = buildAttemptPlan(pickWxAuthBaseUrls(), retries);
  let lastError: unknown = null;

  for (let i = 0; i < plan.length; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * i));
    }
    const base = plan[i];
    try {
      const response = await fetch(`${base}${pathname}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      noteWxAuthBaseSuccess(base);
      return response;
    } catch (error) {
      lastError = error;
      noteWxAuthBaseFailure(base);
      if (plan.length > 1 && i + 1 < plan.length && plan[i + 1] !== base) {
        console.warn(
          `[wx-auth-endpoint] 出口 ${base} 不可用，切换备用出口 ${plan[i + 1]}（${pathname}）`
        );
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("wx-auth 请求失败（所有出口均不可用）");
}
