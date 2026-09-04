// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApiHandler } from "@/lib/api-middleware";
import * as apiUtils from "@/lib/api-utils";

// result-cache 整体 mock：单测不依赖真实 Cache API/内存缓存状态
const resultCacheMocks = vi.hoisted(() => ({
  getResultCache: vi.fn(),
  putResultCache: vi.fn(),
  resultStale: vi.fn(),
}));
vi.mock("@/lib/result-cache", () => resultCacheMocks);

describe("api-middleware sharedCache (统一入口共享结果缓存)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resultCacheMocks.getResultCache.mockReset();
    resultCacheMocks.putResultCache.mockReset();
    resultCacheMocks.resultStale.mockReset();
    vi.spyOn(apiUtils, "rateLimit").mockReturnValue(true);
    vi.spyOn(apiUtils, "isValidUrl").mockReturnValue(true);
    vi.spyOn(apiUtils, "sanitizeUrl").mockImplementation((url) => url);
    vi.spyOn(apiUtils, "getClientIP").mockReturnValue("203.0.113.42");
  });

  const makeHandler = (parseSpy) =>
    createApiHandler(parseSpy, { shouldCache: false, sharedCache: true });
  const makeRequest = () =>
    new Request("http://127.0.0.1/api/parse?url=https://v.douyin.com/abc123/");

  it("serves a fresh cached result without calling the parser", async () => {
    resultCacheMocks.getResultCache.mockResolvedValue({
      code: 200,
      msg: "解析成功",
      platform: "douyin",
      data: { url: "https://cdn.example.com/video.mp4" },
    });
    resultCacheMocks.resultStale.mockResolvedValue(false);
    const parseSpy = vi.fn();

    const res = await makeHandler(parseSpy)(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ platform: "douyin" });
    expect(parseSpy).not.toHaveBeenCalled();
    expect(resultCacheMocks.putResultCache).not.toHaveBeenCalled();
  });

  it("serves a cached deleted-content failure with HTTP 200 + body code 404", async () => {
    // 缓存的「该内容已被删除」条目命中时，HTTP 状态须与新鲜解析路径一致（200），
    // 业务码 404 由 body.code 承载
    resultCacheMocks.getResultCache.mockResolvedValue({
      code: 404,
      msg: "该内容已被删除",
      platform: "xhs",
      data: [],
    });
    resultCacheMocks.resultStale.mockResolvedValue(false);
    const parseSpy = vi.fn();

    const res = await makeHandler(parseSpy)(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ code: 404, msg: "该内容已被删除" });
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("re-parses and writes back when the cached direct url is dead", async () => {
    resultCacheMocks.getResultCache.mockResolvedValue({
      code: 200,
      msg: "解析成功",
      platform: "douyin",
      data: { url: "https://cdn.example.com/expired.mp4" },
    });
    resultCacheMocks.resultStale.mockResolvedValue(true);
    const parseSpy = vi
      .fn()
      .mockResolvedValue({ code: 200, msg: "解析成功", data: { url: "https://cdn.example.com/fresh.mp4" } });

    const res = await makeHandler(parseSpy)(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { url: "https://cdn.example.com/fresh.mp4" } });
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(resultCacheMocks.putResultCache).toHaveBeenCalledTimes(1);
  });

  it("writes the parsed result back to the shared cache on miss", async () => {
    resultCacheMocks.getResultCache.mockResolvedValue(null);
    const parseSpy = vi
      .fn()
      .mockResolvedValue({ code: 200, msg: "解析成功", data: { url: "https://cdn.example.com/video.mp4" } });

    await makeHandler(parseSpy)(makeRequest());

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(resultCacheMocks.putResultCache).toHaveBeenCalledTimes(1);
    expect(resultCacheMocks.putResultCache.mock.calls[0][1]).toMatchObject({ code: 200 });
  });

  it("does not touch the shared cache when the option is off", async () => {
    const parseSpy = vi
      .fn()
      .mockResolvedValue({ code: 200, msg: "解析成功", data: { url: "https://cdn.example.com/video.mp4" } });
    const handler = createApiHandler(parseSpy, { shouldCache: false });

    await handler(makeRequest());

    expect(resultCacheMocks.getResultCache).not.toHaveBeenCalled();
    expect(resultCacheMocks.putResultCache).not.toHaveBeenCalled();
  });
});
