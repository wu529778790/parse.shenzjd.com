// @ts-nocheck
/**
 * verifyDirectUrl 直链验证的单元测试。
 *
 * 重点回归 2026-09/11 线上的「抖音直链被误判坏链」：
 * - HEAD 404 但 GET 复核可用 → 不得判死（uncertain 通过）
 * - HEAD/GET 都 404 → 判死（置空 URL 的唯一依据）
 * - 防盗链 CDN（douyinvod 等）的探测请求必须带对应 Referer——
 *   缺 Referer 时 CDN 对好链也回 404，是误判根因（GET 复核同头才有效）
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyDirectUrl, refererForDirectUrl } from "@/lib/verifyUrl";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 依次返回预设响应（函数项可动态构造），并记录每次 fetch 的调用参数 */
function mockFetchSequence(responses) {
  const calls = [];
  const fetchMock = vi.fn(async (url, init) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch: " + url);
    return typeof next === "function" ? next(url, init) : next;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

describe("verifyDirectUrl", () => {
  it("HEAD 200 直接通过，只发一次请求", async () => {
    const { fetchMock, calls } = mockFetchSequence([
      new Response(null, { status: 200 }),
    ]);
    const v = await verifyDirectUrl("https://cdn.example.com/a.mp4");
    expect(v).toMatchObject({ ok: true, status: 200 });
    expect(v.uncertain).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].init.method).toBe("HEAD");
  });

  it("HEAD 404 但 GET 复核可用 → 通过且不置空（抖音 CDN 误判 404 场景）", async () => {
    const { calls } = mockFetchSequence([
      new Response(null, { status: 404 }),
      new Response(null, { status: 206 }),
    ]);
    const v = await verifyDirectUrl("https://v26-web.douyinvod.com/a.mp4");
    expect(v.ok).toBe(true);
    expect(v.uncertain).toBe(true);
    expect(calls[1].init.method).toBe("GET");
    expect(calls[1].init.headers.Range).toBe("bytes=0-0");
  });

  it("HEAD 与 GET 复核都 404 → 判死链", async () => {
    mockFetchSequence([
      new Response(null, { status: 404 }),
      new Response(null, { status: 404 }),
    ]);
    const v = await verifyDirectUrl("https://v26-web.douyinvod.com/a.mp4");
    expect(v.ok).toBe(false);
    expect(v.status).toBe(404);
  });

  it("douyinvod 直链的 HEAD/GET 探测都带抖音防盗链 Referer", async () => {
    const { calls } = mockFetchSequence([
      new Response(null, { status: 404 }),
      new Response(null, { status: 404 }),
    ]);
    await verifyDirectUrl("https://v26-web.douyinvod.com/a.mp4?sign=x");
    for (const c of calls) {
      expect(c.init.headers.Referer).toBe("https://www.douyin.com/");
      expect(c.init.headers["Accept-Language"]).toContain("zh-CN");
    }
  });

  it("未知 CDN 不带 Referer（维持原行为，不给陌生 CDN 乱发头）", async () => {
    const { calls } = mockFetchSequence([
      new Response(null, { status: 200 }),
    ]);
    await verifyDirectUrl("https://cdn.example.com/a.mp4");
    expect(calls[0].init.headers.Referer).toBeUndefined();
  });

  it("HEAD 403 视为不确定（不阻断），不发起 GET 复核", async () => {
    const { fetchMock } = mockFetchSequence([
      new Response(null, { status: 403 }),
    ]);
    const v = await verifyDirectUrl("https://cdn.example.com/a.mp4");
    expect(v.ok).toBe(true);
    expect(v.uncertain).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("refererForDirectUrl", () => {
  it.each([
    ["https://v3-web.douyinvod.com/a.mp4", "https://www.douyin.com/"],
    ["https://www.douyin.com/aweme/v1/play/x", "https://www.douyin.com/"],
    ["https://v9.awsnackvideo.com/v.mp4", "https://www.douyin.com/"],
    ["https://aweme.snssdk.com/aweme/v1/play/x", "https://www.douyin.com/"],
    ["https://sns-video-qd.xhscdn.com/v.mp4", "https://www.xiaohongshu.com/"],
    ["https://upos-sz-mirrorbd.bilivideo.com/v.mp4", "https://www.bilibili.com/"],
    ["https://upos-hz-mirrorakam.akamaized.net/v.mp4", "https://www.bilibili.com/"],
    ["https://i0.hdslb.com/img.png", "https://www.bilibili.com/"],
  ])("%s → %s", (url, expected) => {
    expect(refererForDirectUrl(url)).toBe(expected);
  });

  it.each([
    ["https://cdn.example.com/a.mp4"],
    ["not-a-url"],
    ["https://evil-douyinvod.com.example.com/a.mp4"],
  ])("%s → 空串（不匹配后缀即不发）", (url) => {
    expect(refererForDirectUrl(url)).toBe("");
  });
});
