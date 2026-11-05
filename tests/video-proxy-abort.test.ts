// @ts-nocheck
/**
 * video-proxy 客户端断开时的 abort 原因测试。
 *
 * 必须是 AbortError 命名的错误：Next 的 pipeToNodeResponse 捕获 pipe 失败后
 * 只对 AbortError 静默返回（server/pipe-readable.js 的 isAbortError），
 * 普通 Error 会被包装成「failed to pipe response」连 cause 全栈打进日志——
 * 播放器 seek/关页面的高频断流曾以此刷屏（2026-11 日志：5 天 80 次）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/video-proxy/route.js";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

function makeReq(target, init = {}) {
  return new Request(
    "http://localhost/api/video-proxy?url=" + encodeURIComponent(target),
    { headers: { "x-forwarded-for": "203.0.113.42" }, ...init }
  );
}

describe("video-proxy：客户端断开的 abort 原因", () => {
  let fetchMock;

  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fetchMock = vi.fn(async () => {
      // 慢速视频流：先给一段数据，之后不再产出（模拟大文件传输中被断开）
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
          },
        }),
        { status: 200, headers: { "content-type": "video/mp4" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("客户端中途断开，上游 abort 原因是 AbortError（Next 对其静默，不打 pipe 日志）", async () => {
    const ac = new AbortController();
    const res = await GET(makeReq("https://cdn.example.com/v.mp4", { signal: ac.signal }));
    expect(res.status).toBe(200);

    // 模拟客户端断开（播放器 seek / 关页面）
    ac.abort();

    const upstreamSignal = fetchMock.mock.calls[0][1].signal;
    expect(upstreamSignal.aborted).toBe(true);
    expect(upstreamSignal.reason?.name).toBe("AbortError");
    // 上游确实被中止（避免后台白拉流量），只是原因换成了能被 Next 静默的错误
    expect(String(upstreamSignal.reason?.message)).toContain("client aborted");
  });
});
