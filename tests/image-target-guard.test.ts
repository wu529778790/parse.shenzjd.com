// @ts-nocheck
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { GET } from "@/app/api/image/route.js";

// 目标地址网守：图片代理无登录态，必须挡住内网/环回/链路本地目标，
// 否则等于公开 SSRF（2026-11-27 线上被用来扫穿 docker 内网）
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

const PUBLIC_IP = [{ address: "93.184.216.34", family: 4 }];

function makeReq(target, init = {}) {
  return new Request("http://localhost/api/image?url=" + encodeURIComponent(target), {
    headers: { "x-forwarded-for": "203.0.113.42" },
    ...init,
  });
}

describe("image 代理：目标地址加固（防 SSRF）", () => {
  let fetchMock;

  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue(PUBLIC_IP);
    fetchMock = vi.fn().mockResolvedValue(
      new Response("image-bytes", {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["环回 IPv4", "http://127.0.0.1:6702/api/auth/userinfo"],
    ["docker 网关", "http://172.17.0.1:5253/api/search.stream?kw=短剧"],
    ["内网容器", "http://172.17.0.2:3000/api/auth/profile"],
    ["云元数据地址", "http://169.254.169.254/latest/meta-data/"],
    ["内网 10/8", "http://10.0.0.5/admin"],
    ["内网 192.168/16", "http://192.168.1.1/"],
    ["localhost 主机名", "http://localhost:3000/"],
    ["IPv6 环回", "http://[::1]:8080/"],
    ["IPv6 唯一本地", "http://[fd00::1]/"],
    ["IPv4 映射 IPv6", "http://[::ffff:127.0.0.1]/"],
    ["内网后缀", "http://metadata.google.internal/computeMetadata/v1/"],
  ])("拒绝%s目标，且不发起任何上游请求", async (_label, target) => {
    const res = await GET(makeReq(target));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("域名解析到内网地址时拒绝", async () => {
    lookupMock.mockResolvedValue([{ address: "10.1.2.3", family: 4 }]);
    const res = await GET(makeReq("https://evil.example.com/a.jpg"));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("非标准数字写法（十进制 IP）经 DNS 复查拦下", async () => {
    // isIP("2130706433") 判不出是 IP，走 lookup；getaddrinfo 会解析成 127.0.0.1
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const res = await GET(makeReq("http://2130706433/a.jpg"));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("解析失败时放行，交由 fetch 自行失败（不存在绕过收益）", async () => {
    lookupMock.mockRejectedValue(
      Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" })
    );
    const res = await GET(makeReq("https://cdn.example.com/ok.jpg"));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("公网图片正常代理，透传图片类型", async () => {
    const res = await GET(makeReq("https://sns-img-hw.xhscdn.com/a.jpg"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(await res.text()).toBe("image-bytes");
    // 跳转必须手动跟随（默认 follow 会绕过逐跳校验）
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe("manual");
    // 小红书图床仍要带防盗链 Referer
    expect(fetchMock.mock.calls[0][1]?.headers?.Referer).toBe(
      "https://www.xiaohongshu.com/"
    );
  });

  it("上游返回 HTML 时拒绝回吐（避免变成任意文本读取通道）", async () => {
    fetchMock.mockResolvedValue(
      new Response("<!DOCTYPE html><html>internal</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );
    const res = await GET(makeReq("https://cdn.example.com/notimage.jpg"));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("internal");
  });

  it("上游缺少 content-type 时同样拒绝", async () => {
    fetchMock.mockResolvedValue(new Response("no-type", { status: 200 }));
    const res = await GET(makeReq("https://cdn.example.com/no-type.jpg"));
    expect(res.status).toBe(502);
  });

  it("跳转到内网目标时阻断", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://172.17.0.1:6702/api/auth/profile" },
      })
    );
    const res = await GET(makeReq("https://cdn.example.com/redir1.jpg"));
    expect(res.status).toBe(403);
    // 只发了第一跳，跳转目标从未被请求
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("跳转到公网 CDN 时按最终主机重算请求头", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://p26-sign.douyinpic.com/b.jpg" },
        })
      )
      .mockResolvedValueOnce(
        new Response("final-image", {
          status: 200,
          headers: { "content-type": "image/webp" },
        })
      );

    const res = await GET(makeReq("https://cdn.example.com/redir2.jpg"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("final-image");
    expect(fetchMock.mock.calls[1][0]).toBe("https://p26-sign.douyinpic.com/b.jpg");
    expect(fetchMock.mock.calls[1][1]?.headers?.Referer).toBeUndefined();
  });

  it("跳转次数超限返回 502", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://cdn.example.com/loop.jpg" },
      })
    );
    const res = await GET(makeReq("https://cdn.example.com/loop.jpg"));
    expect(res.status).toBe(502);
  });

  it("上游非 2xx 返回 502，且不回吐正文", async () => {
    fetchMock.mockResolvedValue(
      new Response("nope", { status: 404, headers: { "content-type": "image/jpeg" } })
    );
    const res = await GET(makeReq("https://cdn.example.com/miss.jpg"));
    expect(res.status).toBe(502);
  });
});
