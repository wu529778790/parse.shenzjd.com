// 登录用户免费配额门禁集成测试（api-middleware）
// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApiHandler } from "@/lib/api-middleware";
import * as apiUtils from "@/lib/api-utils";
import { __resetQuotaForTest } from "@/lib/unlock-quota";

const originalFetch = global.fetch;
const originalVITEST = process.env.VITEST;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// 默认远端 mock：/auth/check → 已认证；/mp-reward/verify → 验票通过
function defaultFetch(url) {
  const s = String(url);
  if (s.includes("/api/auth/mp-reward/verify")) {
    return Promise.resolve(jsonResponse({ valid: true }));
  }
  return Promise.resolve(jsonResponse({ authenticated: true }));
}

function parseUrl(path) {
  return `http://127.0.0.1/api/parse?url=${encodeURIComponent(path)}`;
}

function authedRequest(urlPath, token, extraHeaders = {}) {
  return new Request(parseUrl(urlPath), {
    headers: { cookie: `wxauth-token=${token}`, ...extraHeaders },
  });
}

function setupCommonMocks() {
  vi.spyOn(apiUtils, "rateLimit").mockReturnValue(true);
  vi.spyOn(apiUtils, "isValidUrl").mockReturnValue(true);
  vi.spyOn(apiUtils, "sanitizeUrl").mockImplementation((url) => url);
  vi.spyOn(apiUtils, "getClientIP").mockReturnValue("203.0.113.42");
}

describe("floating-unlock 免费配额门禁（Docker 内存计数）", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetQuotaForTest();
    delete process.env.VITEST;
    process.env.FLOATING_UNLOCK_GATE = "1"; // 本组用例开启配额门禁
    global.fetch = vi.fn(defaultFetch);
    setupCommonMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.FLOATING_UNLOCK_GATE;
    if (originalVITEST === undefined) delete process.env.VITEST;
    else process.env.VITEST = originalVITEST;
  });

  it("连续 3 次成功解析后，第 4 次请求无验票头 → 403 needsUnlock 且不解析", async () => {
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    const token = "quota-user-001";

    // 前 3 次真实解析成功，均放行
    for (let i = 1; i <= 3; i++) {
      const res = await handler(authedRequest(`https://v.douyin.com/a${i}/`, token));
      expect(res.status).toBe(200);
    }
    expect(parseSpy).toHaveBeenCalledTimes(3);

    // 第 4 次：免费次数用完，无验票头 → 403 + needsUnlock
    const blocked = await handler(
      authedRequest("https://v.douyin.com/blocked-quota/", token)
    );
    expect(blocked.status).toBe(403);
    const json = await blocked.json();
    expect(json.data.needsUnlock).toBe(true);
    expect(json.msg).toContain("广告");
    expect(parseSpy).toHaveBeenCalledTimes(3); // 未真正解析

    // 未带票据时不应发起 verify 请求
    const fetchCalls = global.fetch.mock.calls.map((c) => String(c[0]));
    expect(
      fetchCalls.some((u) => u.includes("/api/auth/mp-reward/verify"))
    ).toBe(false);
  });

  it("满额后携带有效 grant → 验票放行并清零，后续可继续免费解析", async () => {
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    const token = "quota-user-002";

    for (let i = 1; i <= 3; i++) {
      const res = await handler(authedRequest(`https://v.douyin.com/b${i}/`, token));
      expect(res.status).toBe(200);
    }

    // 带 ticket+grant 发起：验票通过 → 放行并清零（本次解析成功计为新一轮第 1 次）
    const res = await handler(
      authedRequest("https://v.douyin.com/ad-unlocked/", token, {
        "x-unlock-ticket": "ticket-ok",
        "x-unlock-grant": "grant-ok",
      })
    );
    expect(res.status).toBe(200);
    const verifyCalls = global.fetch.mock.calls.filter((c) =>
      String(c[0]).includes("/api/auth/mp-reward/verify")
    );
    expect(verifyCalls).toHaveLength(1);
    expect(JSON.parse(verifyCalls[0][1].body)).toEqual({
      ticket: "ticket-ok",
      grant: "grant-ok",
    });
    expect(parseSpy).toHaveBeenCalledTimes(4);

    // 清零后连续 2 次真实解析仍放行（无需广告）
    const free1 = await handler(authedRequest("https://v.douyin.com/c1/", token));
    const free2 = await handler(authedRequest("https://v.douyin.com/c2/", token));
    expect(free1.status).toBe(200);
    expect(free2.status).toBe(200);
  });

  it("grant 验票不通过 → 403（不带 needsUnlock），不解析", async () => {
    global.fetch = vi.fn((url) => {
      const s = String(url);
      if (s.includes("/api/auth/mp-reward/verify")) {
        return Promise.resolve(
          jsonResponse({ valid: false, code: "invalid_grant" })
        );
      }
      return Promise.resolve(jsonResponse({ authenticated: true }));
    });
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    const token = "quota-user-003";
    for (let i = 1; i <= 3; i++) {
      await handler(authedRequest(`https://v.douyin.com/d${i}/`, token));
    }
    const res = await handler(
      authedRequest("https://v.douyin.com/bad-grant/", token, {
        "x-unlock-ticket": "stale-ticket",
        "x-unlock-grant": "stale-grant",
      })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.data).toBeUndefined(); // 不带 needsUnlock，避免前端反复重试广告
    expect(json.msg).toContain("失效");
    expect(parseSpy).toHaveBeenCalledTimes(3);
  });

  it("缓存命中（同一链接）不计数、不触发广告", async () => {
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    const token = "quota-user-004";
    const cachedUrl = "https://v.douyin.com/cache-hit-zz/";

    // 第 1 次真实解析成功（计数 1）并写入内存缓存
    expect((await handler(authedRequest(cachedUrl, token))).status).toBe(200);

    // 再次请求同一链接 → 命中缓存直接返回，不再解析也不计数
    const cached = await handler(authedRequest(cachedUrl, token));
    expect(cached.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // 再来 2 次真实解析成功（计数到 3）
    expect(
      (await handler(authedRequest("https://v.douyin.com/e1/", token))).status
    ).toBe(200);
    const lastFree = await handler(
      authedRequest("https://v.douyin.com/e2/", token)
    );
    expect(lastFree.status).toBe(200); // 若缓存命中有误计入 3，这次会提前被 403

    // 第 5 次真实请求才需要广告（说明缓存命中确实没计数）
    const blocked = await handler(
      authedRequest("https://v.douyin.com/e3/", token)
    );
    expect(blocked.status).toBe(403);
  });

  it("小程序端（Bearer、无 Cookie）连续解析不受配额限制", async () => {
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    const token = "mp-bearer-001";
    // 小程序端：Authorization: Bearer 携带凭证，无 Cookie
    const mpRequest = (urlPath) =>
      new Request(parseUrl(urlPath), {
        headers: { authorization: `Bearer ${token}` },
      });

    for (let i = 1; i <= 6; i++) {
      const res = await handler(mpRequest(`https://v.douyin.com/mp${i}/`));
      expect(res.status).toBe(200);
    }
    expect(parseSpy).toHaveBeenCalledTimes(6);
    // 全程不触发广告解锁验票
    const verifyCalls = global.fetch.mock.calls.filter((c) =>
      String(c[0]).includes("/api/auth/mp-reward/verify")
    );
    expect(verifyCalls).toHaveLength(0);
  });

  it("带 Cookie 的网页请求即使携带多余 Bearer 头也不按小程序端放过（防伪造）", async () => {
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    const token = "cookie-plus-bearer-001";
    // 网页端 Cookie 登录，同时带一个多余 Bearer 头（伪造场景，应仍按网页端计配额）
    const trickyRequest = (urlPath) =>
      new Request(parseUrl(urlPath), {
        headers: {
          cookie: `wxauth-token=${token}`,
          authorization: `Bearer ${token}`,
        },
      });

    for (let i = 1; i <= 3; i++) {
      const res = await handler(trickyRequest(`https://v.douyin.com/g${i}/`));
      expect(res.status).toBe(200);
    }
    // 第 4 次仍应触发网页端广告门禁
    const blocked = await handler(trickyRequest("https://v.douyin.com/g4/"));
    expect(blocked.status).toBe(403);
    const json = await blocked.json();
    expect(json.data.needsUnlock).toBe(true);
  });

  it("门禁通过 FLOATING_UNLOCK_GATE=0 强制关闭后，满额也不拦截", async () => {
    process.env.FLOATING_UNLOCK_GATE = "0";
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    const token = "quota-user-005";
    for (let i = 1; i <= 6; i++) {
      const res = await handler(authedRequest(`https://v.douyin.com/f${i}/`, token));
      expect(res.status).toBe(200);
    }
    expect(parseSpy).toHaveBeenCalledTimes(6);
  });

  it("未登录用户仍被 wx-auth 401 拦截（登录逻辑不受配额影响）", async () => {
    const parseSpy = vi.fn();
    const handler = createApiHandler(parseSpy);
    const res = await handler(new Request(parseUrl("https://v.douyin.com/no-login/")));
    expect(res.status).toBe(401);
    expect(parseSpy).not.toHaveBeenCalled();
  });
});
