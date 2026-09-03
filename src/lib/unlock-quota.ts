/**
 * floating-unlock · 登录用户免费解析配额（服务端内存计数）
 *
 * 产品口径（与产品确认）：
 *   - 未登录：维持现有 wx-auth 登录弹窗逻辑，一律不允许解析（服务端 401 兜底）。
 *   - 已登录：连续【成功】解析 freeQuota 次（默认 3）后，下一次发起解析前必须
 *     看广告解锁；看完广告、wx-auth 验票（grant）通过后计数清零，重新累计 3 次。
 *
 * 部署前提：本模块使用【进程内内存 Map】，仅适合 Docker / Node 单进程部署。
 *   Cloudflare Workers 是多 isolate 且可随时冻结/重建的无共享状态运行时，内存计数
 *   会漂移（同一用户不同请求落到不同实例），切勿在此部署形态下开启（见配置注释）。
 *
 * 统计口径：
 *   - 只统计【成功】解析：失败 / 无结果不计数（避免网络抖动让用户无辜看广告）；
 *   - 缓存命中（5min 内存 / 24h sharedCache）不算"真实解析"，直接放行不计数，
 *     不计配额也不要求广告（命中缓存对服务器无解析成本）。
 *
 * 安全：本模块只负责计数与阈值判定，真正的"放行/拒绝"裁决由 api-middleware 配合
 *   enforceFloatingUnlock()（wx-auth 验票核销）完成，绕过前端直接调 API 也无法免广告。
 */

import { floatingUnlockConfig } from "@/config/floating-unlock";

const FREE_QUOTA = floatingUnlockConfig.freeQuota;

/** 条目闲置多久后视为过期（惰性清理，防止 Map 无限膨胀） */
const IDLE_TTL_MS = 6 * 60 * 60 * 1000;
/** Map 上限：超限时整体清理最旧一半，简单防膨胀（频率低，量级安全） */
const MAX_ENTRIES = 10000;

interface QuotaEntry {
  count: number;
  lastSeen: number;
}

const quotaMap = new Map<string, QuotaEntry>();

/**
 * gate 是否开启：默认跟随配置（enableGate: true）。
 * 环境变量覆盖：FLOATING_UNLOCK_GATE=1/true 强制开启；=0/false 强制关闭（线上快速回退用）。
 */
export function isUnlockQuotaEnabled(): boolean {
  const env = process.env.FLOATING_UNLOCK_GATE;
  if (env === "1" || env === "true" || env === "TRUE") return true;
  if (env === "0" || env === "false" || env === "FALSE") return false;
  return floatingUnlockConfig.enableGate;
}

function getEntry(key: string): QuotaEntry | null {
  const entry = quotaMap.get(key);
  if (!entry) return null;
  if (Date.now() - entry.lastSeen > IDLE_TTL_MS) {
    quotaMap.delete(key); // 闲置过期：从零重新累计
    return null;
  }
  return entry;
}

function prune(): void {
  if (quotaMap.size < MAX_ENTRIES) return;
  // 简单防膨胀：清掉最旧的一半
  const entries = [...quotaMap.entries()].sort(
    (a, b) => a[1].lastSeen - b[1].lastSeen
  );
  const toRemove = Math.ceil(entries.length / 2);
  for (let i = 0; i < toRemove; i++) quotaMap.delete(entries[i][0]);
}

/** 该 key（wxauth token）的免费配额是否已用完（≥ freeQuota，仅查询不递增） */
export function isQuotaFull(key: string): boolean {
  const entry = getEntry(key);
  return entry ? entry.count >= FREE_QUOTA : false;
}

/** 记录一次成功解析（配额已满时不再累加，等待广告解锁清零） */
export function recordQuotaSuccess(key: string): void {
  const now = Date.now();
  const existing = quotaMap.get(key);
  if (existing) {
    if (Date.now() - existing.lastSeen > IDLE_TTL_MS) {
      // 过期条目直接重建
      quotaMap.set(key, { count: 1, lastSeen: now });
      return;
    }
    if (existing.count < FREE_QUOTA) existing.count += 1;
    existing.lastSeen = now;
    return;
  }
  prune();
  quotaMap.set(key, { count: 1, lastSeen: now });
}

/** 广告解锁验票通过后清零，进入新一轮免费配额 */
export function resetQuota(key: string): void {
  const now = Date.now();
  const existing = quotaMap.get(key);
  if (existing) {
    existing.count = 0;
    existing.lastSeen = now;
  } else {
    quotaMap.set(key, { count: 0, lastSeen: now });
  }
}

/** 测试辅助：清空计数（避免跨用例串扰；生产勿用） */
export function __resetQuotaForTest(): void {
  quotaMap.clear();
}
