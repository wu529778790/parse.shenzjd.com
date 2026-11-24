// @ts-nocheck
/**
 * 抖音主解析的探测收敛测试（2026-11-24）。
 *
 * 线上现象：出口 IP 被抖音风控时，主解析会打满 2 轮 × 3 组 UA × 4 个候选
 * URL = 24 次请求（日志 `24 次请求均被反爬`），既慢又继续给风控送样本。
 * 现在整组 UA × 全部候选 URL 都被反爬命中时跳过本轮剩余 UA 组
 * （最坏请求数 24 → 8），第二轮（带 ttwid）照常进行。
 *
 * 兜底引擎的竞速行为见 tests/douyin-fallback-race.test.ts。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/douyin-cookie", () => ({
  extractDouyinTtwid: () => "",
  getDouyinTtwid: async () => "",
  saveDouyinTtwid: async () => {},
}));

const { fallbackMock } = vi.hoisted(() => ({ fallbackMock: vi.fn() }));
vi.mock("@/lib/douyinFallback", () => ({
  douyinPublicFallback: fallbackMock,
}));

import douyin from "@/lib/parsers/douyin";

const VIDEO_ID = "7610459237881282737";
const VIDEO_URL = `https://www.douyin.com/video/${VIDEO_ID}`;
// 反爬特征（argus-csp-token 是 isChallengeHtml 的判定标记之一）
const CHALLENGE_HTML =
  "<html><head><script src='/argus-csp-token.js'></script></head><body>verify</body></html>";

const originalFetch = global.fetch;

/** 所有请求都返回反爬页，并把 url 绑成请求地址（extractIdAndRedirectUrl 依赖它） */
function mockChallengeOnly() {
  const calls = [];
  global.fetch = vi.fn(async (url) => {
    calls.push(String(url));
    const response = new Response(CHALLENGE_HTML, { status: 200 });
    Object.defineProperty(response, "url", { value: String(url) });
    return response;
  });
  return calls;
}

beforeEach(() => {
  fallbackMock.mockReset();
  fallbackMock.mockResolvedValue({ ok: false, error: "兜底全失败(mock)" });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("抖音主解析：出口被反爬时收敛探测次数", () => {
  it("全部候选 URL 都命中反爬页时，最坏只打 8 次（原为 24 次）+ 1 次短链探测", async () => {
    const calls = mockChallengeOnly();

    const result = await douyin(VIDEO_URL);

    // 1 次 extractIdAndRedirectUrl + 2 轮 × 4 个候选 URL
    expect(calls.length).toBeLessThanOrEqual(9);
    // 反爬结论仍如实报出（不是静默降级）
    expect(result.code).toBe(201);
    expect(result.msg).toContain("风控拦截");
    // 兜底引擎仍被调用过（收敛探测不影响兜底）
    expect(fallbackMock).toHaveBeenCalledTimes(1);
  }, 20000);

  it("见到数据块（哪怕是空壳）不触发跳过：继续换 UA 尝试", async () => {
    // 空壳 _ROUTER_DATA（filter_list 形态）：不是 challenge，属于「有结构无数据」，
    // 这时换 UA / 换域名仍有意义，不能因为反爬计数跳过
    const shellHtml =
      '<html><script>window._ROUTER_DATA = {"loaderData":{}}</script></html>';
    const calls = [];
    global.fetch = vi.fn(async (url) => {
      calls.push(String(url));
      const response = new Response(shellHtml, { status: 200 });
      Object.defineProperty(response, "url", { value: String(url) });
      return response;
    });

    await douyin(VIDEO_URL);

    // 没有 challenge 命中 → 不跳过，打满 2 轮 × 3 组 UA × 4 URL
    expect(calls.length).toBeGreaterThan(9);
  }, 20000);
});
