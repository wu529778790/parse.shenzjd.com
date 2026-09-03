/**
 * floating-unlock · 广告解锁前端通用封装（与 wx-auth-client 同款懒加载策略）
 *
 * 库形态：@wu529778790/floating-unlock 的 Web Component 版（unpkg 引入，
 * 自动注册 <floating-unlock>，注册后元素提供 unlock(): Promise<{ ok, ticket, grant }>）。
 * 本模块不装 npm 依赖，SDK 发版站点零改动；unlock() 仅在真正需要解锁的动作处
 * （如解析被配额拦截后）才懒加载脚本并注入元素，不参与页面初始加载。
 *
 * 用法（触发时机后续接线时在业务动作前调用）：
 *   import { unlockByAd, unlockRequestHeaders } from "@/lib/floating-unlock-client";
 *
 *   const { ok, ticket, grant } = await unlockByAd();
 *   if (!ok) return;                    // 用户未看完广告 / SDK 异常 → 中断动作
 *   // 放行权在服务端：把 ticket + grant 随业务请求带给后端验票
 *   fetch("/api/parse?...", { headers: unlockRequestHeaders({ ok, ticket, grant }) })
 *
 * 约定：{ ok: true } 只代表「看完了广告并拿到一次性票据」，不代表业务放行；
 * 业务后端必须用 ticket + grant 调 wx-auth verify 核销后才放行。
 */

import { floatingUnlockConfig } from "@/config/floating-unlock";

const SDK_URL =
  "https://unpkg.com/@wu529778790/floating-unlock@latest/dist/floating-unlock.wc.js";
const SCRIPT_ID = "floating-unlock-wc";
const ELEMENT_TAG = "floating-unlock";
/** 元素已注册但实例方法迟迟不出现时的兜底轮询上限（毫秒） */
const UPGRADE_WAIT_MS = 5000;
const UPGRADE_POLL_MS = 50;

/** unlock() 归一化后的解锁结果 */
export interface FloatingUnlockResult {
  /** true=已看完广告并拿到一次性票据（仍需后端验票后才算放行） */
  ok: boolean;
  /** 解锁会话票据（create 生成，5 分钟有效）；失败恒为 null */
  ticket: string | null;
  /** 一次性 HMAC 放行票据（wx-auth 签发，只能核销一次）；失败恒为 null */
  grant: string | null;
}

export interface UnlockByAdOptions {
  /** 覆盖默认 apiBase（通常无需传） */
  apiBase?: string;
  /** 覆盖默认 siteId（通常无需传） */
  siteId?: string;
  /** 覆盖 SDK 加载/升级超时（毫秒） */
  timeoutMs?: number;
}

/** <floating-unlock> 元素暴露的最小方法面（由 wc.js 在元素升级后提供） */
interface FloatingUnlockElement extends HTMLElement {
  unlock(): Promise<FloatingUnlockResult>;
}

let sdkReadyPromise: Promise<boolean> | null = null;
let inflight: Promise<FloatingUnlockResult> | null = null;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 当前是否运行在浏览器（脚本注入/自定义元素都依赖 DOM） */
const isBrowser = () =>
  typeof document !== "undefined" &&
  typeof window !== "undefined" &&
  typeof customElements !== "undefined";

/**
 * 确保 floating-unlock.wc.js 已加载且自定义元素已注册。
 * 幂等（script 按 id 去重，promise 单例），返回是否就绪。
 */
function ensureSdkLoaded(timeoutMs: number): Promise<boolean> {
  if (sdkReadyPromise) return sdkReadyPromise;

  sdkReadyPromise = new Promise((resolve) => {
    if (!isBrowser()) {
      resolve(false);
      return;
    }
    // 已注册：直接算就绪（可能 layout 后续声明式引入过）
    if (customElements.get(ELEMENT_TAG)) {
      resolve(true);
      return;
    }
    // 兜底注入脚本（正常情况下调用方懒加载，页面上还没有）
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SDK_URL;
      script.async = true;
      script.defer = false;
      document.head.appendChild(script);
    }

    const startedAt = Date.now();
    const poll = () => {
      if (customElements.get(ELEMENT_TAG)) {
        resolve(true);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        console.warn("[floating-unlock] SDK 加载超时，本次解锁中断");
        resolve(false);
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });

  return sdkReadyPromise;
}

/**
 * 拿到一个可调 unlock() 的元素：
 * 1. 若页面已存在声明式 <floating-unlock>（layout 里放标签那种），优先复用且不负责清理；
 * 2. 否则创建带 api-base / site-id 属性的新元素挂到 body（调用方用完负责移除）。
 * 每次新建一个元素，保证一次解锁一个干净的实例，避免复用已销毁实例。
 */
async function acquireElement(
  options: Required<Pick<UnlockByAdOptions, "apiBase" | "siteId">> &
    Pick<UnlockByAdOptions, "timeoutMs">
): Promise<{ el: FloatingUnlockElement; owned: boolean } | null> {
  if (!isBrowser()) return null;
  const timeoutMs = options.timeoutMs ?? floatingUnlockConfig.sdkLoadTimeoutMs;
  const loaded = await ensureSdkLoaded(timeoutMs);
  if (!loaded) return null;

  let el = document.querySelector<FloatingUnlockElement>(ELEMENT_TAG);
  let owned = false;

  if (el && typeof el.unlock === "function") {
    // 页面声明式元素且已升级：直接复用
    return { el, owned: false };
  }
  if (!el) {
    el = document.createElement(ELEMENT_TAG) as FloatingUnlockElement;
    // 属性需在挂载前设置，保证 connectedCallback 读到正确配置
    el.setAttribute("api-base", options.apiBase);
    el.setAttribute("site-id", options.siteId);
    // 隐藏承载：元素本身无可见 UI（解锁弹窗由 unlock() 触发时才展示）
    document.body.appendChild(el);
    owned = true;
  }

  // 等待实例方法出现（升级安全网）
  const deadline = Date.now() + UPGRADE_WAIT_MS;
  while (Date.now() < deadline && typeof el.unlock !== "function") {
    await sleep(UPGRADE_POLL_MS);
  }
  if (typeof el.unlock !== "function") {
    if (owned) el.remove();
    return null;
  }
  return { el, owned };
}

/** 把 SDK 返回结果归一化，兼容缺字段 / 异常结构 */
function toResult(raw: unknown): FloatingUnlockResult {
  if (raw && typeof raw === "object") {
    const r = raw as { ok?: unknown; ticket?: unknown; grant?: unknown };
    if (r.ok === true && typeof r.ticket === "string") {
      return {
        ok: true,
        ticket: r.ticket,
        grant: typeof r.grant === "string" ? r.grant : null,
      };
    }
  }
  return { ok: false, ticket: null, grant: null };
}

/**
 * 发起一次激励视频广告解锁。
 *
 * @returns { ok: true, ticket, grant } 解锁成功；此时仍需把 ticket+grant 交给后端验票
 *          { ok: false } 用户取消/失败/超时/SDK 未就绪 → 业务应中断本次动作
 *
 * 注意：并发调用会共享同一次弹窗结果（内部有 in-flight 去重），避免叠多个弹窗。
 */
export async function unlockByAd(
  options: UnlockByAdOptions = {}
): Promise<FloatingUnlockResult> {
  if (inflight) return inflight;

  const task = (async (): Promise<FloatingUnlockResult> => {
    const resolved = {
      apiBase: options.apiBase ?? floatingUnlockConfig.apiBase,
      siteId: options.siteId ?? floatingUnlockConfig.siteId,
      timeoutMs: options.timeoutMs,
    };
    let acquired: Awaited<ReturnType<typeof acquireElement>> = null;
    try {
      acquired = await acquireElement(resolved);
      if (!acquired) return toResult(null);
      const raw = await acquired.el.unlock();
      return toResult(raw);
    } catch (error) {
      console.error("[floating-unlock] unlock() 调用异常:", error);
      return toResult(null);
    } finally {
      // 仅清理本次新建的元素；声明式元素留给 layout 管理
      if (acquired?.owned) acquired.el.remove();
    }
  })();

  inflight = task;
  try {
    return await task;
  } finally {
    inflight = null;
  }
}

/**
 * 把解锁结果转成随业务请求携带的验票头（fetch headers 可直接展开）。
 * 仅 ok=true 且有 ticket/grant 时返回票据头；否则返回空对象（后端将 403 拒绝）。
 */
export function unlockRequestHeaders(
  result: FloatingUnlockResult
): Record<string, string> {
  if (result.ok && result.ticket && result.grant) {
    return {
      "X-Unlock-Ticket": result.ticket,
      "X-Unlock-Grant": result.grant,
    };
  }
  return {};
}
