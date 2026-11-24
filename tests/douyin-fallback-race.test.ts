// @ts-nocheck
/**
 * 抖音公共解析兜底引擎「真·竞速」测试（2026-11-24）。
 *
 * 原实现 Promise.allSettled 会等齐四路：douyin.wtf 常 404、tenapi 常 502，
 * 只要有一路卡到 9s 超时，即使另一路 200ms 就命中，用户也要多等 9s。
 * 现在任何一路成功立即返回，失败时才汇总各源原因。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { douyinPublicFallback } from "@/lib/douyinFallback";

const VIDEO_URL = "https://www.douyin.com/video/7610459237881282737";
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function delayedJson(body, ms) {
  return new Promise((resolve) =>
    setTimeout(
      () =>
        resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        ),
      ms
    )
  );
}

describe("douyinPublicFallback：真·竞速", () => {
  it("一路先成功后立即返回，不等慢源", async () => {
    global.fetch = vi.fn(async (url) => {
      const target = String(url);
      if (target.includes("17change")) {
        return new Response(
          JSON.stringify({
            code: 200,
            data: { title: "t", video: { url: "https://v.example.com/a.mp4" } },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      // 其余三路都慢 2s
      return delayedJson({ code: 200, data: {} }, 2000);
    });

    const startedAt = Date.now();
    const result = await douyinPublicFallback(VIDEO_URL);
    const elapsed = Date.now() - startedAt;

    expect(result.ok).toBe(true);
    expect(result.key).toBe("17change");
    expect(result.url).toBe("https://v.example.com/a.mp4");
    // 旧实现（Promise.allSettled）会等满 2s
    expect(elapsed).toBeLessThan(1000);
  }, 15000);

  it("全部失败时返回汇总错误，不挂起", async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    const result = await douyinPublicFallback(VIDEO_URL);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("fetch failed");
  }, 15000);
});
