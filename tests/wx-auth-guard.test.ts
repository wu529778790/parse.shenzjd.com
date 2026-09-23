// 微信认证守卫单元测试
// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApiHandler } from "@/lib/api-middleware";
import { checkWxAuthToken } from "@/lib/wx-auth-guard";
import * as apiUtils from "@/lib/api-utils";

describe("wx-auth guard (解析接口强制认证)", () => {
  const originalFetch = global.fetch;
  const originalVITEST = process.env.VITEST;

  beforeEach(() => {
    vi.restoreAllMocks();
    // 关闭 VITEST 豁免，让守卫真实生效（rateLimit 等仍需 mock）
    delete process.env.VITEST;
    vi.spyOn(apiUtils, "rateLimit").mockReturnValue(true);
    vi.spyOn(apiUtils, "isValidUrl").mockReturnValue(true);
    vi.spyOn(apiUtils, "sanitizeUrl").mockImplementation((url) => url);
    vi.spyOn(apiUtils, "getClientIP").mockReturnValue("203.0.113.42");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalVITEST === undefined) delete process.env.VITEST;
    else process.env.VITEST = originalVITEST;
  });

  it("无认证 Cookie 时解析接口返回 401", async () => {
    const parseSpy = vi.fn();
    const handler = createApiHandler(parseSpy);
    const res = await handler(
      new Request(
        "http://127.0.0.1/api/parse?url=https://v.douyin.com/gnrPF7GJYkY/"
      )
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe(401);
    expect(json.msg).toContain("关注公众号");
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("带有效 token 时放行解析", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true, user: {} }), {
        status: 200,
      })
    );
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    const res = await handler(
      new Request(
        "http://127.0.0.1/api/parse?url=https://v.douyin.com/gnrPF7GJYkY/",
        { headers: { cookie: "wxauth-token=valid.token.abc" } }
      )
    );
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it("token 无效时返回 401 且不调用解析器", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), { status: 200 })
    );
    const parseSpy = vi.fn();
    const handler = createApiHandler(parseSpy);
    const res = await handler(
      new Request(
        "http://127.0.0.1/api/parse?url=https://v.douyin.com/gnrPF7GJYkY/",
        { headers: { cookie: "wxauth-token=bad.token.xyz" } }
      )
    );
    expect(res.status).toBe(401);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("Authorization: Bearer 有效 token（小程序端）时放行解析", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true, user: { openid: "mp:oXXXX", type: "mp" } }), {
        status: 200,
      })
    );
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    const res = await handler(
      new Request(
        "http://127.0.0.1/api/parse?url=https://v.douyin.com/gnrPF7GJYkY/bearer1/",
        { headers: { authorization: "Bearer mp.valid.token.abc" } }
      )
    );
    expect(res.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it("Bearer 前缀大小写不敏感且允许多余空白", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), { status: 200 })
    );
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    const res = await handler(
      new Request(
        "http://127.0.0.1/api/parse?url=https://v.douyin.com/gnqPF7GJYkY/trimme/",
        { headers: { Authorization: "  bearer   mp.token.trim.me  " } }
      )
    );
    expect(res.status).toBe(200);
    // 取出的 token 已 trim，check URL 中不应有空格
    const checkUrl = String(global.fetch.mock.calls[0][0]);
    expect(checkUrl).toContain("token=mp.token.trim.me");
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it("Authorization 头存在但非 Bearer scheme 时按无凭证处理（401）", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const parseSpy = vi.fn();
    const handler = createApiHandler(parseSpy);
    const res = await handler(
      new Request(
        "http://127.0.0.1/api/parse?url=https://v.douyin.com/gnrPF7GJYkY/",
        { headers: { authorization: "Basic dXNlcjpwYXNz" } }
      )
    );
    expect(res.status).toBe(401);
    expect(parseSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Cookie 与 Authorization 同时存在时 Cookie 优先", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), { status: 200 })
    );
    global.fetch = fetchMock;
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    await handler(
      new Request(
        "http://127.0.0.1/api/parse?url=https://v.douyin.com/gnsPF7GJYkY/cookiewins/",
        {
          headers: {
            cookie: "wxauth-token=cookie.token.wins",
            authorization: "Bearer bearer.token.loses",
          },
        }
      )
    );
    const checkUrl = String(fetchMock.mock.calls[0][0]);
    expect(checkUrl).toContain("token=cookie.token.wins");
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it("Bearer token 无效时返回 401 且不调用解析器", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), { status: 200 })
    );
    const parseSpy = vi.fn();
    const handler = createApiHandler(parseSpy);
    const res = await handler(
      new Request(
        "http://127.0.0.1/api/parse?url=https://v.douyin.com/gnrPF7GJYkY/",
        { headers: { authorization: "Bearer expired.mp.token" } }
      )
    );
    expect(res.status).toBe(401);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("校验结果按 token 缓存 10 分钟：同一 token 只调一次 check", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), { status: 200 })
    );
    global.fetch = fetchMock;
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    const cookie = { cookie: "wxauth-token=cached-token-0001" };
    // 两次请求用不同 URL：避免命中解析结果缓存，专门验证认证缓存
    await handler(
      new Request("http://127.0.0.1/api/parse?url=https://v.douyin.com/aaa/", {
        headers: cookie,
      })
    );
    await handler(
      new Request("http://127.0.0.1/api/parse?url=https://v.douyin.com/bbb/", {
        headers: cookie,
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(parseSpy).toHaveBeenCalledTimes(2);
  });

  it("认证缓存超过上限时按批淘汰，而不是整体清空（回归：旧实现是 clear()）", async () => {
    // AUTH_CACHE_MAX 为 2000：灌到略微溢出，验证最近写入的 token 仍命中缓存。
    // 旧实现的 `if (size >= MAX) clear()` 会在溢出瞬间清空全表，导致在线用户
    // 集体重新回源 check。
    // 每次调用返回全新的 Response：Response 的 body 只能读一次，复用会让
    // 第二次及以后的 .json() 抛错（被守卫按「服务异常」处理）
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        new Response(JSON.stringify({ authenticated: true }), { status: 200 })
      );
    global.fetch = fetchMock;

    const total = 2100;
    for (let i = 0; i < total; i++) {
      await checkWxAuthToken(`lru-token-${i}`);
    }
    expect(fetchMock).toHaveBeenCalledTimes(total);

    const callsBefore = fetchMock.mock.calls.length;
    expect(await checkWxAuthToken(`lru-token-${total - 1}`)).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("x-parse-internal 头不再绕过认证（回归：伪造内部标记应 401）", async () => {
    // 旧版中间件信任客户端可伪造的 x-parse-internal 头跳过认证，已废除；
    // 内部转发改为统一入口直接函数调用，该头对守卫不再有任何作用。
    const parseSpy = vi.fn();
    const handler = createApiHandler(parseSpy);
    const res = await handler(
      new Request("http://127.0.0.1/api/parse?url=https://v.douyin.com/zzz/", {
        headers: { "x-parse-internal": "1" },
      })
    );
    expect(res.status).toBe(401);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("非解析类路由（route=test）跳过守卫", async () => {
    const parseSpy = vi.fn().mockResolvedValue({ code: 200, msg: "ok" });
    const handler = createApiHandler(parseSpy);
    const res = await handler(
      new Request("http://127.0.0.1/api/test?url=https://example.com/video")
    );
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });
});
