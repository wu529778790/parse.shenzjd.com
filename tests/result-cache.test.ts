// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getResultCache,
  putResultCache,
  resultStale,
  _resetForTests,
} from "@/lib/result-cache";

// vitest 的 node 环境没有 caches 全局，本文件覆盖内存兜底路径；
// Workers 的 Cache API 路径与它共用同一套读写/探测逻辑
describe("result-cache", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    _resetForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("roundtrips a successful result", async () => {
    const url = "https://v.douyin.com/abc123/";
    await putResultCache(url, {
      code: 200,
      msg: "解析成功",
      platform: "douyin",
      data: { url: "https://cdn.example.com/video.mp4" },
    });
    expect(await getResultCache(url)).toMatchObject({ platform: "douyin" });
  });

  it("never caches transient failed results", async () => {
    const url = "https://v.douyin.com/fail123/";
    await putResultCache(url, { code: 400, msg: "解析失败" });
    await putResultCache(url, { code: 0, msg: "B站风控拦截，请稍后重试" });
    expect(await getResultCache(url)).toBeNull();
  });

  it("caches permanent deleted-content failures (code 404)", async () => {
    const url = "https://xhslink.cn/o/deleted1";
    await putResultCache(url, {
      code: 404,
      msg: "该内容已被删除",
      platform: "xhs",
      data: [],
    });
    expect(await getResultCache(url)).toMatchObject({
      code: 404,
      msg: "该内容已被删除",
    });
  });

  it("caches permanent deleted-content failures (code 0, bilibili shape)", async () => {
    const url = "https://www.bilibili.com/video/BV1deleted/";
    await putResultCache(url, { code: 0, msg: "该内容已被删除", platform: "bilibili" });
    expect(await getResultCache(url)).toMatchObject({
      code: 0,
      msg: "该内容已被删除",
    });
  });

  it("returns null for unknown urls", async () => {
    expect(await getResultCache("https://v.douyin.com/never/")).toBeNull();
  });

  it("marks stale only on definitive dead links (404/410)", async () => {
    // 主直链 404：明确死链
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    expect(
      await resultStale({ code: 200, data: { url: "https://cdn.example.com/video.mp4" } })
    ).toBe(true);

    // 403：CDN 可能拒 HEAD 但 GET 可用，不确定 → 不判失效
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    expect(
      await resultStale({ code: 200, data: { url: "https://cdn.example.com/video.mp4" } })
    ).toBe(false);

    // 无直链（纯图集）→ 无可探测，不判失效
    expect(await resultStale({ code: 200, data: {} })).toBe(false);
  });

  it("probes bilibili first part when main url is empty", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 410 }));
    const stale = await resultStale({
      code: 200,
      data: { videos: [{ url: "https://cdn.example.com/p1.mp4" }] },
    });
    expect(stale).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
