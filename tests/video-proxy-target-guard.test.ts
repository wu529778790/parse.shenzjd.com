// @ts-nocheck
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { GET } from "@/app/api/video-proxy/route.js";

// 目标地址网守：路由无登录态，必须挡住内网/环回/链路本地目标，否则等于公开 SSRF
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

const PUBLIC_IP = [{ address: "93.184.216.34", family: 4 }];

function makeReq(target, init = {}) {
  return new Request(
    "http://localhost/api/video-proxy?url=" +
      encodeURIComponent(target),
    { headers: { "x-forwarded-for": "203.0.113.42" }, ...init }
  );
}

describe("video-proxy：目标地址加固（防 SSRF）", () => {
  let fetchMock;

  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue(PUBLIC_IP);
    fetchMock = vi.fn().mockResolvedValue(
      new Response("video-bytes", {
        status: 200,
        headers: { "content-type": "video/mp4" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["环回 IPv4", "http://127.0.0.1:9000/status"],
    ["云元数据地址", "http://169.254.169.254/latest/meta-data/"],
    ["内网 10/8", "http://10.0.0.5/admin"],
    ["内网 192.168/16", "http://192.168.1.1/"],
    ["内网 172.16/12", "http://172.20.0.1/"],
    ["localhost 主机名", "http://localhost:6702/api"],
    ["IPv6 环回", "http://[::1]:8080/"],
    ["IPv6 唯一本地", "http://[fd00::1]/"],
    ["IPv4 映射 IPv6", "http://[::ffff:127.0.0.1]/"],
  ])("拒绝%s目标，且不发起任何上游请求", async (_label, target) => {
    const res = await GET(makeReq(target));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("域名解析到内网地址时拒绝", async () => {
    lookupMock.mockResolvedValue([{ address: "10.1.2.3", family: 4 }]);
    const res = await GET(makeReq("https://evil.example.com/v.mp4"));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("解析失败时放行，交由 fetch 自行失败（不存在绕过收益）", async () => {
    lookupMock.mockRejectedValue(
      Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" })
    );
    const res = await GET(makeReq("https://cdn.example.com/v.mp4"));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("公网目标正常代理", async () => {
    const res = await GET(makeReq("https://cdn.example.com/v.mp4"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("video-bytes");
  });

  it("重定向到内网目标时阻断并丢弃响应体", async () => {
    const upstream = new Response("metadata", {
      status: 200,
      headers: { "content-type": "video/mp4" },
    });
    // Response.url 只读，用 defineProperty 模拟 undici 跟随跳转后的最终 URL
    Object.defineProperty(upstream, "url", {
      value: "http://169.254.169.254/latest/meta-data/",
    });
    fetchMock.mockResolvedValue(upstream);

    const res = await GET(makeReq("https://cdn.example.com/v.mp4"));
    expect(res.status).toBe(403);
  });

  it("重试退避期间客户端断开返回 499，而不是 500", async () => {
    vi.useFakeTimers();
    try {
      const err = new TypeError("fetch failed");
      err.cause = Object.assign(new Error("other side closed"), {
        code: "ECONNRESET",
      });
      fetchMock.mockRejectedValue(err);

      const ac = new AbortController();
      const pending = GET(
        makeReq("https://v11-default.365yg.com/main.mp4", { signal: ac.signal })
      );
      // 让首次 fetch 失败并进入 500ms 退避窗口
      await vi.advanceTimersByTimeAsync(100);
      ac.abort();
      await vi.advanceTimersByTimeAsync(1000);

      const res = await pending;
      expect(res.status).toBe(499);
    } finally {
      vi.useRealTimers();
    }
  });
});
