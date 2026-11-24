// @ts-nocheck
/**
 * B站匿名指纹（buvid3/buvid4）从 spi 接口获取的单元测试（2026-11-24）。
 *
 * 背景：线上 kv_store 里从来没有过 bilibili_anon_cookie——捕获依赖响应头
 * Set-Cookie，而 API 在机房出口上基本不下发，于是每次冷启动都落到「本地伪造
 * buvid3」兜底。spi 接口不受风控（实测 200），改为主动要一组真指纹并落库。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { biliFetchMock } = vi.hoisted(() => ({ biliFetchMock: vi.fn() }));

vi.mock("@/lib/bilibili-fetch", () => ({
  biliFetch: biliFetchMock,
  BILIBILI_USER_AGENT: "test-ua",
}));

import { fetchAnonCookieFromSpi } from "@/lib/bilibili-cookie";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  biliFetchMock.mockReset();
});

afterEach(() => {
  biliFetchMock.mockReset();
});

describe("bilibili 匿名指纹 spi", () => {
  it("拿到 b_3/b_4 时拼成 buvid3 + buvid4 Cookie 串", async () => {
    biliFetchMock.mockResolvedValue(
      jsonResponse({ code: 0, data: { b_3: "AAA-infoc", b_4: "BBB-infoc" } })
    );

    await expect(fetchAnonCookieFromSpi()).resolves.toBe(
      "buvid3=AAA-infoc; buvid4=BBB-infoc"
    );
    expect(String(biliFetchMock.mock.calls[0][0])).toContain(
      "api.bilibili.com/x/frontend/finger/spi"
    );
  });

  it("只有 b_3 时只带 buvid3", async () => {
    biliFetchMock.mockResolvedValue(
      jsonResponse({ code: 0, data: { b_3: "AAA-infoc" } })
    );

    await expect(fetchAnonCookieFromSpi()).resolves.toBe("buvid3=AAA-infoc");
  });

  it("响应里没有 b_3（如风控返回 412 HTML）时返回空串，调用方回落本地伪造", async () => {
    biliFetchMock.mockResolvedValue(
      new Response("<!DOCTYPE html>", { status: 412 })
    );

    await expect(fetchAnonCookieFromSpi()).resolves.toBe("");
  });

  it("请求抛错时返回空串，不向上冒泡", async () => {
    biliFetchMock.mockRejectedValue(new Error("中继故障(timeout) HTTP 504"));

    await expect(fetchAnonCookieFromSpi()).resolves.toBe("");
  });
});
