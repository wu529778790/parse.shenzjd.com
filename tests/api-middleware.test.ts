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

    const req = new Request("http://127.0.0.1/api/bilibili?url=https://www.bilibili.com/video/BV1xx411c7mD");
    const res = await handler(req);
    const json = await res.json();

    expect(json.code).toBe(1);
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
});
