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
    // 主直链 404：HEAD 明确死链，GET 复核仍 404 → 判失效
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    expect(
      await resultStale({ code: 200, data: { url: "https://cdn.example.com/video.mp4" } })
    ).toBe(true);

    // 403：CDN 可能拒 HEAD 但 GET 可用，不确定 → 不判失效
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    expect(
      await resultStale({ code: 200, data: { url: "https://cdn.example.com/video.mp4" } })
    ).toBe(false);

    // HEAD 404 但 GET Range 可用（抖音 CDN 实测行为）→ 不判失效
    global.fetch = vi.fn().mockImplementation((url, init) => {
      const method = init?.method || "GET";
      return Promise.resolve(
        new Response(null, { status: method === "HEAD" ? 404 : 206 })
      );
    });
    expect(
      await resultStale({ code: 200, data: { url: "https://cdn.example.com/video.mp4" } })
    ).toBe(false);

    // 无直链（纯图集）→ 无可探测，不判失效
    expect(await resultStale({ code: 200, data: {} })).toBe(false);
  });

  it("probes bilibili first part when main url is empty", async () => {
    // 410 死链：HEAD + GET 复核各一次
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 410 }));
    const stale = await resultStale({
      code: 200,
      data: { videos: [{ url: "https://cdn.example.com/p1.mp4" }] },
    });
    expect(stale).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("热链接命中探测有 60s memo：同一 URL 不重复外呼", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = fetchMock;
    const result = {
      code: 200,
      data: { url: "https://cdn.example.com/hot.mp4" },
    };

    expect(await resultStale(result)).toBe(false);
    expect(await resultStale(result)).toBe(false);
    expect(await resultStale(result)).toBe(false);

    // 三次命中只探测一次（线上日志：232 次命中仅 56 个 URL）
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("探测确认有效的 memo 过期后会重新探测", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = fetchMock;
    const result = {
      code: 200,
      data: { url: "https://cdn.example.com/aging.mp4" },
    };

    await resultStale(result);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 越过 60s memo 窗口后应重新探测（fake timers 只推进探测前的 now 取值）
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 61 * 1000);
      await resultStale(result);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("内存缓存上限提升到 5000 且按 LRU 淘汰（不再 500 条 FIFO）", async () => {
    const makeResult = (i) => ({
      code: 200,
      msg: "解析成功",
      platform: "douyin",
      data: { url: `https://cdn.example.com/v${i}.mp4` },
    });

    // 600 条：旧实现的 500 条 FIFO 会把最早那条挤掉
    for (let i = 0; i < 600; i++) {
      await putResultCache(`https://v.douyin.com/lru${i}/`, makeResult(i));
    }
    expect(await getResultCache("https://v.douyin.com/lru0/")).toMatchObject({
      platform: "douyin",
    });

    // 超过上限后按批淘汰最久未使用的条目，而不是整体清空
    const over = 5000 + 10;
    for (let i = 0; i < over; i++) {
      await putResultCache(`https://v.douyin.com/bulk${i}/`, makeResult(i));
    }
    // 最近写入的一批必然都还在（旧实现每次溢出会 clear()，只剩最后一条）
    for (let i = over - 100; i < over; i++) {
      expect(await getResultCache(`https://v.douyin.com/bulk${i}/`)).not.toBeNull();
    }
  });
});
