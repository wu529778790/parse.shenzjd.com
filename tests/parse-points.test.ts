// 解析接口积分计费单测（2026-09-18 接入 wx-auth 账本）
// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApiHandler } from "@/lib/api-middleware";
import * as apiUtils from "@/lib/api-utils";

/**
 * 说明：本文件必须 delete process.env.VITEST 才能让认证/积分门禁真实生效
 *（VITEST=true 是生产逻辑的显式豁免开关），因此 rateLimit 等需要 mock，
 * 且每个用例使用**唯一的 token**——wx-auth-guard 的认证结果按 token 缓存 5 分钟。
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** 按 URL 分派 mock fetch，并记录全部调用（便于断言契约与调用次数） */
function mockBackend(handlers: {
  check?: () => Response;
  balance?: () => Response;
  spend?: () => Response;
  checkin?: () => Response;
}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/api/auth/check")) {
      return handlers.check ? handlers.check() : json({ authenticated: true });
    }
    if (url.includes("/api/points/balance")) {
      if (!handlers.balance) throw new Error("用例未预期 balance 调用");
      return handlers.balance();
    }
    if (url.includes("/api/points/spend")) {
      if (!handlers.spend) throw new Error("用例未预期 spend 调用");
      return handlers.spend();
    }
    if (url.includes("/api/points/checkin")) {
      if (!handlers.checkin) throw new Error("用例未预期 checkin 调用");
      return handlers.checkin();
    }
    throw new Error(`未预期的请求: ${url}`);
  }) as unknown as typeof fetch;
  return calls;
}

function parseRequest(token: string, path = "pointsCase"): Request {
  return new Request(
    `http://127.0.0.1/api/parse?url=${encodeURIComponent(
      `https://v.douyin.com/${path}${token}/`
    )}`,
    { headers: { cookie: `wxauth-token=${token}` } }
  );
}

describe("解析接口积分计费", () => {
  const originalFetch = global.fetch;
  const originalVITEST = process.env.VITEST;
  const originalPointsSwitch = process.env.WXAUTH_POINTS_ENABLED;

  beforeEach(() => {
    vi.restoreAllMocks();
    // 关闭 VITEST 豁免，让认证与积分门禁真实生效
    delete process.env.VITEST;
    delete process.env.WXAUTH_POINTS_ENABLED;
    vi.spyOn(apiUtils, "rateLimit").mockReturnValue(true);
    vi.spyOn(apiUtils, "isValidUrl").mockReturnValue(true);
    vi.spyOn(apiUtils, "sanitizeUrl").mockImplementation((url) => url);
    vi.spyOn(apiUtils, "getClientIP").mockReturnValue("203.0.113.42");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalVITEST === undefined) delete process.env.VITEST;
    else process.env.VITEST = originalVITEST;
    if (originalPointsSwitch === undefined) delete process.env.WXAUTH_POINTS_ENABLED;
    else process.env.WXAUTH_POINTS_ENABLED = originalPointsSwitch;
  });

  it("余额充足：解析成功后按 1 分结算（amount / scene / actionId 契约）", async () => {
    const calls = mockBackend({
      balance: () => json({ balance: 5, checkedIn: true, adReward: 10, checkinReward: 10 }),
      spend: () => json({ ok: true, charged: "points", balance: 4 }),
    });
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const res = await handler(parseRequest("t-balance-ok"));

    expect(res.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    const spendCall = calls.find((c) => c.url.includes("/api/points/spend"));
    expect(spendCall).toBeTruthy();
    const body = JSON.parse(String(spendCall!.init?.body));
    expect(body.amount).toBe(1);
    expect(body.scene).toBe("parse:video");
    // actionId 幂等键：必须是账本侧合法形态（8~64 位 [A-Za-z0-9_-]）
    expect(body.actionId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("余额不足且今日已签到：返回 402 提示，且不发起解析", async () => {
    mockBackend({
      balance: () => json({ balance: 0, checkedIn: true, checkinReward: 10 }),
    });
    const parseSpy = vi.fn();
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const res = await handler(parseRequest("t-insufficient"));
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.code).toBe(402);
    expect(body.msg).toContain("积分不足");
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("余额不足但今日未签到：自动补领签到积分后放行解析", async () => {
    const calls = mockBackend({
      balance: () => json({ balance: 0, checkedIn: false, checkinReward: 10 }),
      checkin: () => json({ ok: true, granted: 10, balance: 10 }),
      spend: () => json({ ok: true, charged: "points", balance: 9 }),
    });
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const res = await handler(parseRequest("t-checkin-fallback"));

    expect(res.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.url.includes("/api/points/checkin"))).toBe(true);
    expect(calls.some((c) => c.url.includes("/api/points/spend"))).toBe(true);
  });

  it("解析失败（code!=200）不扣分", async () => {
    const calls = mockBackend({
      balance: () => json({ balance: 5, checkedIn: true }),
    });
    const parseSpy = vi.fn().mockResolvedValue({ code: 400, msg: "解析失败" });
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const res = await handler(parseRequest("t-parse-fail"));

    expect(parseSpy).toHaveBeenCalledTimes(1);
    // code=400 归一化后仍是失败，不应触发结算
    expect(calls.some((c) => c.url.includes("/api/points/spend"))).toBe(false);
    const body = await res.json();
    expect(body.code).toBe(400);
  });

  it("账本不可用（balance 500）时放行解析（fail-open，不阻断业务）", async () => {
    mockBackend({
      balance: () => json({ error: "server_error" }, 500),
    });
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const res = await handler(parseRequest("t-ledger-down"));

    expect(res.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it("WXAUTH_POINTS_ENABLED=false 时完全跳过计费（不查余额不扣分）", async () => {
    process.env.WXAUTH_POINTS_ENABLED = "false";
    const calls = mockBackend({});
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const res = await handler(parseRequest("t-switch-off"));

    expect(res.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.url.includes("/api/points/"))).toBe(false);
  });

  it("结果缓存命中：不重复预检、不重复扣分", async () => {
    const calls = mockBackend({
      balance: () => json({ balance: 5, checkedIn: true }),
      spend: () => json({ ok: true, charged: "points", balance: 4 }),
    });
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy); // shouldCache 默认 true

    const token = "t-cache-hit";
    const first = await handler(parseRequest(token));
    expect(first.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // 同一 URL 再请求一次：命中进程内存结果缓存，解析器与账本都不该被再调用
    const second = await handler(parseRequest(token));
    expect(second.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.url.includes("/api/points/spend"))).toHaveLength(1);
  });

  it("spend 超时/异常不影响结果返回（best-effort 结算）", async () => {
    mockBackend({
      balance: () => json({ balance: 5, checkedIn: true }),
      spend: () => {
        throw new Error("network timeout");
      },
    });
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const res = await handler(parseRequest("t-spend-error"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe(200);
  });
});
