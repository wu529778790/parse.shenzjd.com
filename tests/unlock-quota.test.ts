// 登录用户免费解析配额（内存计数）单元测试
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isUnlockQuotaEnabled,
  isQuotaFull,
  recordQuotaSuccess,
  resetQuota,
  __resetQuotaForTest,
} from "@/lib/unlock-quota";

describe("unlock-quota（服务端内存配额）", () => {
  beforeEach(() => {
    __resetQuotaForTest();
  });

  afterEach(() => {
    delete process.env.FLOATING_UNLOCK_GATE;
  });

  it("gate 默认开启（配置 enableGate=true）；环境变量可强制开关", () => {
    expect(isUnlockQuotaEnabled()).toBe(true);
    process.env.FLOATING_UNLOCK_GATE = "1";
    expect(isUnlockQuotaEnabled()).toBe(true);
    process.env.FLOATING_UNLOCK_GATE = "0";
    expect(isUnlockQuotaEnabled()).toBe(false);
  });

  it("未知 key 不算满额", () => {
    expect(isQuotaFull("fresh-user-token")).toBe(false);
  });

  it("连续 3 次成功解析后满额，清零后可重新累计", () => {
    const key = "user-token-1";
    for (let i = 1; i <= 3; i++) {
      expect(isQuotaFull(key)).toBe(false);
      recordQuotaSuccess(key);
    }
    expect(isQuotaFull(key)).toBe(true);

    // 满额后继续成功不再累加（上限保护）
    recordQuotaSuccess(key);
    expect(isQuotaFull(key)).toBe(true);

    // 广告解锁通过后清零
    resetQuota(key);
    expect(isQuotaFull(key)).toBe(false);
    recordQuotaSuccess(key);
    expect(isQuotaFull(key)).toBe(false);
  });

  it("不同用户各自独立计数", () => {
    const a = "user-token-a";
    const b = "user-token-b";
    for (let i = 0; i < 3; i++) recordQuotaSuccess(a);
    expect(isQuotaFull(a)).toBe(true);
    expect(isQuotaFull(b)).toBe(false);
  });
});
