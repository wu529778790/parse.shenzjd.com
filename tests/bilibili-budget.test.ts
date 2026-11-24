// @ts-nocheck
/**
 * B站解析总预算测试（2026-11-24）。
 *
 * 背景：单接口 20s 兜底 × 最多 3 次重试 = 60s，线上实测出现过 33s / 53s /
 * 60.9s 的解析（用户早就走了，连接还占着）。现在整次解析共享一个截止时间
 * （默认 25s，可用 BILIBILI_PARSE_BUDGET_MS 覆盖），预算耗尽后不再发起重试。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { biliFetchMock } = vi.hoisted(() => ({ biliFetchMock: vi.fn() }));

vi.mock("@/lib/bilibili-fetch", () => ({
  biliFetch: biliFetchMock,
  BILIBILI_USER_AGENT: "test-ua",
}));
vi.mock("@/lib/bilibili-cookie", () => ({
  getBiliAnonCookie: async () => "",
  saveBiliAnonCookie: async () => {},
  extractBilibiliAnonCookie: () => null,
  fetchAnonCookieFromSpi: async () => "",
}));
vi.mock("@/lib/bilibili-wbi", () => ({
  signWbiParams: async () => null,
}));

import getBilibiliVideoInfo from "@/lib/parsers/bilibili";

const VIDEO_URL = "https://www.bilibili.com/video/BV1xx411c7mD";

/** 上游永远挂起，只在 signal 触发时按 TimeoutError 失败（模拟中继 20s 超时） */
function mockHangingUpstream() {
  biliFetchMock.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const fail = () => {
          const error = new Error("The operation was aborted due to timeout");
          error.name = "TimeoutError";
          reject(error);
        };
        if (signal?.aborted) return fail();
        signal?.addEventListener("abort", fail, { once: true });
      })
  );
}

const originalBudget = process.env.BILIBILI_PARSE_BUDGET_MS;

beforeEach(() => {
  biliFetchMock.mockReset();
});

afterEach(() => {
  biliFetchMock.mockReset();
  if (originalBudget === undefined) delete process.env.BILIBILI_PARSE_BUDGET_MS;
  else process.env.BILIBILI_PARSE_BUDGET_MS = originalBudget;
});

describe("bilibili 解析总预算", () => {
  it("预算耗尽即停止重试，不再把用户拖到 60s", async () => {
    process.env.BILIBILI_PARSE_BUDGET_MS = "1500";
    mockHangingUpstream();

    const startedAt = Date.now();
    const result = await getBilibiliVideoInfo(VIDEO_URL);
    const elapsed = Date.now() - startedAt;

    expect(result.code).toBe(0);
    expect(result.msg).toBe("解析失败！");
    // 首次尝试被预算收敛到 1.5s；之后剩余预算不足 500ms，直接放弃
    expect(elapsed).toBeLessThan(5000);
    expect(biliFetchMock).toHaveBeenCalledTimes(1);
  }, 15000);

  it("预算是「每次解析各自一份」，不跨请求泄漏", async () => {
    process.env.BILIBILI_PARSE_BUDGET_MS = "1200";
    mockHangingUpstream();

    // 第二次调用若误用共享/过期的截止时间，会立刻判定预算耗尽（0 次请求）
    const first = await getBilibiliVideoInfo(VIDEO_URL);
    const callsAfterFirst = biliFetchMock.mock.calls.length;
    const second = await getBilibiliVideoInfo(VIDEO_URL);
    const callsAfterSecond = biliFetchMock.mock.calls.length;

    expect(first.msg).toBe("解析失败！");
    expect(second.msg).toBe("解析失败！");
    expect(callsAfterFirst).toBe(1);
    // 第二次请求仍然真实发起过（没有因为上次的 deadline 直接短路）
    expect(callsAfterSecond).toBe(callsAfterFirst + 1);
  }, 15000);
});
