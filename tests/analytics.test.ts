// @ts-nocheck
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// 在导入 analytics 前 mock turso-client，避免单元测试连接真实数据库
const mockExecute = vi.fn();
const mockBatch = vi.fn();
vi.mock("@/lib/turso-client", () => ({
  createTursoClient: vi.fn(() => ({ execute: mockExecute, batch: mockBatch })),
}));

// 动态导入以支持 vi.resetModules 重置模块级缓存（db / tableReady / 缓冲区 / 统计缓存）
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
    mockBatch.mockReset();
    mockBatch.mockResolvedValue([]);
    await loadAnalytics();
  });

  afterAll(async () => {
    if (analytics) await analytics.__flushAnalyticsForTest();
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

  it("recordParse 只入缓冲不直写，flush 时一次批量插入（含建表）", async () => {
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
    // 事件还在缓冲区：尚未发生任何 INSERT
    expect(mockBatch).not.toHaveBeenCalled();

    await analytics.__flushAnalyticsForTest();
    expect(mockBatch).toHaveBeenCalledTimes(1);
    const stmts = mockBatch.mock.calls[0][0];
    expect(stmts).toHaveLength(1);
    expect(stmts[0].sql).toMatch(/^INSERT INTO parse_events/);
    expect(stmts[0].args[0]).toBe("kuaishou");
    expect(stmts[0].args[1]).toBe("https://v.kuaishou.com/abc");
    expect(stmts[0].args[3]).toBe("success");
    // IP 已匿名化（64 位十六进制 SHA-256），不落明文
    expect(stmts[0].args[2]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("多条事件合并为一次批量写入", async () => {
    process.env.TURSO_DB_URL = "libsql://test.turso.io";
    process.env.TURSO_AUTH_TOKEN = "test-token";
    await analytics.recordParse({
      platform: "huya",
      url: "https://v.huya.com/xyz",
      ip: "203.0.113.6",
      status: "failed",
      reason: "虎牙视频解析失败",
    });
    await analytics.recordParse({
      platform: "douyin",
      url: "https://v.douyin.com/abc",
      ip: "203.0.113.7",
    });
    await analytics.__flushAnalyticsForTest();

    expect(mockBatch).toHaveBeenCalledTimes(1);
    const stmts = mockBatch.mock.calls[0][0];
    expect(stmts).toHaveLength(2);
    expect(stmts[0].args[3]).toBe("failed");
    expect(stmts[0].args[4]).toBe("虎牙视频解析失败");
    expect(stmts[1].args[0]).toBe("douyin");
  });

  it("批量写入失败时回灌缓冲，下次 flush 重试", async () => {
    process.env.TURSO_DB_URL = "libsql://test.turso.io";
    process.env.TURSO_AUTH_TOKEN = "test-token";
    mockBatch.mockRejectedValueOnce(new Error("Turso HTTP 503"));
    await analytics.recordParse({
      platform: "weibo",
      url: "https://weibo.com/x",
      ip: "203.0.113.8",
    });
    await analytics.__flushAnalyticsForTest();
    expect(mockBatch).toHaveBeenCalledTimes(1);

    // 第二次 flush：失败回灌的事件被重试
    await analytics.__flushAnalyticsForTest();
    expect(mockBatch).toHaveBeenCalledTimes(2);
    const stmts = mockBatch.mock.calls[1][0];
    expect(stmts).toHaveLength(1);
    expect(stmts[0].args[0]).toBe("weibo");
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

  it("queryStats 结果走 5 分钟内存缓存：TTL 内不重复查询", async () => {
    process.env.TURSO_DB_URL = "libsql://test.turso.io";
    process.env.TURSO_AUTH_TOKEN = "test-token";
    mockExecute.mockResolvedValue({
      rows: [{ platform: "douyin", total: 6, success: 5, failed: 1 }],
    });
    const selectCalls = () =>
      mockExecute.mock.calls.filter(
        ([arg]) => typeof arg === "string" && arg.startsWith("SELECT")
      ).length;
    const first = await analytics.queryStats();
    expect(selectCalls()).toBe(3); // 三条聚合查询只在首次执行
    const second = await analytics.queryStats();
    expect(second).toBe(first); // 命中缓存：同一对象、零额外扫表
    expect(selectCalls()).toBe(3);
  });
});
