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
});
