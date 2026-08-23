// @ts-nocheck
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// 在导入 analytics 前 mock turso-client，避免单元测试连接真实数据库
const mockExecute = vi.fn();
vi.mock("@/lib/turso-client", () => ({
  createTursoClient: vi.fn(() => ({ execute: mockExecute })),
}));

// 动态导入以支持 vi.resetModules 重置模块级缓存（db / tableReady）
let analytics;

async function loadAnalytics() {
  vi.resetModules();
  analytics = await import("@/lib/analytics");
}

describe("analytics", () => {
  const originalUrl = process.env.TURSO_DB_URL;
  const originalToken = process.env.TURSO_AUTH_TOKEN;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecute.mockReset();
    mockExecute.mockResolvedValue({ rows: [] });
    await loadAnalytics();
  });

  afterAll(() => {
    if (originalUrl === undefined) delete process.env.TURSO_DB_URL;
    else process.env.TURSO_DB_URL = originalUrl;
    if (originalToken === undefined) delete process.env.TURSO_AUTH_TOKEN;
    else process.env.TURSO_AUTH_TOKEN = originalToken;
  });

  it("未配置数据库时 recordParse 静默跳过、不创建连接", async () => {
    delete process.env.TURSO_DB_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    await expect(
      analytics.recordParse({ platform: "douyin", url: "https://x", ip: "1.2.3.4" })
    ).resolves.toBeUndefined();
    const { createTursoClient } = await import("@/lib/turso-client");
    expect(createTursoClient).not.toHaveBeenCalled();
  });

  it("未配置数据库时 queryStats 返回 null", async () => {
    delete process.env.TURSO_DB_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    expect(await analytics.queryStats()).toBeNull();
  });

  it("配置后 recordParse 建表并插入成功记录", async () => {
    process.env.TURSO_DB_URL = "libsql://test.turso.io";
    process.env.TURSO_AUTH_TOKEN = "test-token";
    await analytics.recordParse({
      platform: "kuaishou",
      url: "https://v.kuaishou.com/abc",
      ip: "203.0.113.5",
    });
    const { createTursoClient } = await import("@/lib/turso-client");
    expect(createTursoClient).toHaveBeenCalledWith(
      expect.objectContaining({ url: "libsql://test.turso.io", authToken: "test-token" })
    );
    expect(mockExecute).toHaveBeenCalled();
    const insert = mockExecute.mock.calls.find(
      ([arg]) => typeof arg === "object" && String(arg.sql).startsWith("INSERT")
    );
    expect(insert).toBeTruthy();
    expect(insert[0].args[0]).toBe("kuaishou");
    expect(insert[0].args[1]).toBe("https://v.kuaishou.com/abc");
    expect(insert[0].args[3]).toBe("success");
  });

  it("配置后 recordParse 可记录失败事件（status=failed + reason）", async () => {
    process.env.TURSO_DB_URL = "libsql://test.turso.io";
    process.env.TURSO_AUTH_TOKEN = "test-token";
    await analytics.recordParse({
      platform: "huya",
      url: "https://v.huya.com/xyz",
      ip: "203.0.113.6",
      status: "failed",
      reason: "虎牙视频解析失败",
    });
    const insert = mockExecute.mock.calls.find(
      ([arg]) => typeof arg === "object" && String(arg.sql).startsWith("INSERT")
    );
    expect(insert).toBeTruthy();
    expect(insert[0].args[3]).toBe("failed");
    expect(insert[0].args[4]).toBe("虎牙视频解析失败");
  });

  it("配置后 queryStats 返回聚合结果（含 success/failed 维度）", async () => {
    process.env.TURSO_DB_URL = "libsql://test.turso.io";
    process.env.TURSO_AUTH_TOKEN = "test-token";
    mockExecute.mockResolvedValue({
      rows: [{ platform: "douyin", total: 6, success: 5, failed: 1 }],
    });
    const stats = await analytics.queryStats();
    expect(stats).not.toBeNull();
    expect(stats.totals).toBeTruthy();
    expect(stats.byPlatform[0].platform).toBe("douyin");
    expect(stats.byPlatform[0].failed).toBe(1);
  });
});
