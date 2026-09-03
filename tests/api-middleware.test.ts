// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApiHandler } from "@/lib/api-middleware";
import * as apiUtils from "@/lib/api-utils";

describe("api-middleware", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiUtils, "rateLimit").mockReturnValue(true);
    vi.spyOn(apiUtils, "isValidUrl").mockReturnValue(true);
    vi.spyOn(apiUtils, "sanitizeUrl").mockImplementation((url) => url);
    vi.spyOn(apiUtils, "getClientIP").mockReturnValue("203.0.113.42");
  });

  it("skips cache lookup when shouldCache is false", async () => {
    const getCacheSpy = vi.spyOn(apiUtils, "getCachedResponse");
    const setCacheSpy = vi.spyOn(apiUtils, "setCacheResponse");
    const parseSpy = vi.fn().mockResolvedValue({ code: 1, msg: "ok" });
    const handler = createApiHandler(parseSpy, {
      shouldCache: false,
      responseHeaders: {
        "Cache-Control": "no-store",
      },
    });

    const req = new Request("http://127.0.0.1/api/parse?url=https://www.bilibili.com/video/BV1xx411c7mD");
    const res = await handler(req);
    const json = await res.json();

    // 成功 code 在出口统一归一化为 200（bilibili 原返回 1）
    expect(json.code).toBe(200);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(getCacheSpy).not.toHaveBeenCalled();
    expect(setCacheSpy).not.toHaveBeenCalled();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("uses cache by default", async () => {
    vi.spyOn(apiUtils, "getCachedResponse").mockReturnValue({ code: 1, msg: "cached" });
    const parseSpy = vi.fn();
    const handler = createApiHandler(parseSpy);

    const req = new Request("http://127.0.0.1/api/test?url=https://example.com/video");
    const res = await handler(req);
    const json = await res.json();

    expect(json.msg).toBe("cached");
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("blocks requests when rate limit exceeded", async () => {
    vi.spyOn(apiUtils, "rateLimit").mockReturnValue(false);
    const parseSpy = vi.fn();
    const handler = createApiHandler(parseSpy);

    const req = new Request("http://127.0.0.1/api/test?url=https://example.com/video");
    const res = await handler(req);

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe(429);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("blocks SSRF attempts (sanitizeUrl returns null)", async () => {
    vi.spyOn(apiUtils, "sanitizeUrl").mockReturnValue(null);
    const parseSpy = vi.fn();
    const handler = createApiHandler(parseSpy);

    const req = new Request("http://127.0.0.1/api/test?url=http://192.168.1.1/secret");
    const res = await handler(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe(400);
    expect(json.msg).toContain("不允许访问");
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("returns CORS header for allowed origin (*.shenzjd.com)", async () => {
    vi.spyOn(apiUtils, "getCachedResponse").mockReturnValue(null);
    const parseSpy = vi.fn().mockResolvedValue({ code: 1, msg: "ok" });
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const req = new Request("http://127.0.0.1/api/test?url=https://example.com", {
      headers: { Origin: "https://parse.shenzjd.com" },
    });
    const res = await handler(req);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://parse.shenzjd.com");
  });

  it("does not return CORS header for unauthorized origin", async () => {
    vi.spyOn(apiUtils, "getCachedResponse").mockReturnValue(null);
    const parseSpy = vi.fn().mockResolvedValue({ code: 1, msg: "ok" });
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const req = new Request("http://127.0.0.1/api/test?url=https://example.com", {
      headers: { Origin: "https://evil-site.com" },
    });
    const res = await handler(req);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("分平台路由对外一律 403，x-parse-internal 头不再能绕过（回归）", async () => {
    // 旧版中间件信任客户端可伪造的 x-parse-internal 头：带上即可绕过
    // 平台路由 403、微信认证、配额与统计。内部转发已改为统一入口直接
    // 函数调用，该头不再有任何特权。
    const parseSpy = vi.fn();
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const douyinUrl =
      "http://127.0.0.1/api/douyin?url=" +
      encodeURIComponent("https://v.douyin.com/gnrPF7GJYkY/");

    const withoutHeader = await handler(new Request(douyinUrl));
    expect(withoutHeader.status).toBe(403);
    expect(parseSpy).not.toHaveBeenCalled();

    const withHeader = await handler(
      new Request(douyinUrl, { headers: { "x-parse-internal": "1" } })
    );
    expect(withHeader.status).toBe(403);
    const json = await withHeader.json();
    expect(json.msg).toContain("统一解析入口");
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("统一入口不受分平台 403 影响，抖音跳转域名 link.wtturl.cn 正常进入解析", async () => {
    // 回归：wtturl.cn 加入 douyin 白名单后，统一入口不应在中间件层被拒
    const parseSpy = vi.fn().mockResolvedValue({ code: 1, msg: "ok" });
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const req = new Request(
      "http://127.0.0.1/api/parse?url=" +
        encodeURIComponent(
          "https://link.wtturl.cn/?target=https%3A%2F%2Fwww.iesdouyin.com%2Fshare%2Fvideo%2F6891626572860706051"
        )
    );
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it("returns honeypot (200 + 公众号宣传) for blacklisted IP instead of 403", async () => {
    // 黑名单 IP 直连解析接口 → 不再 403，而是 200 + 结构化蜜罐数据（宣传公众号）
    vi.spyOn(apiUtils, "getClientIP").mockReturnValue("120.42.187.174");
    const parseSpy = vi.fn();
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const req = new Request("http://127.0.0.1/api/parse?url=https://v.douyin.com/xxxxx/");
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(parseSpy).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.code).toBe(200);
    // 蜜罐标志 + 宣传文案 + 引导链接
    expect(json.data.honeypot).toBe(true);
    expect(json.msg).toContain("神族九帝");
    expect(json.data.url).toContain("parse.shenzjd.com");
  });

  it("allows non-blacklisted IP through (regression)", async () => {
    const parseSpy = vi.fn().mockResolvedValue({ code: 1, msg: "ok" });
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    const req = new Request("http://127.0.0.1/api/parse?url=https://www.bilibili.com/video/BV1xx411c7mD");
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });
});
