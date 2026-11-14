// @ts-nocheck
/**
 * middleware 单测：带 Next-Action 头的请求（扫描器伪造，应用无 Server
 * Actions）一律 403 短路；普通请求放行。
 */
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

function fakeRequest(headers = {}) {
  return { headers: new Headers(headers) };
}

describe("middleware Next-Action 短路", () => {
  it("携带 Next-Action 头 → 403 空响应", () => {
    const res = middleware(
      fakeRequest({ "Next-Action": "7f9c2d5e" })
    );
    expect(res.status).toBe(403);
  });

  it("普通 GET 请求放行", () => {
    const res = middleware(fakeRequest());
    expect(res.status).not.toBe(403);
  });

  it("认证后的 /api/parse POST 也不受影响（无该头时）", () => {
    const res = middleware(
      fakeRequest({ "Content-Type": "application/json" })
    );
    expect(res.status).not.toBe(403);
  });
});
