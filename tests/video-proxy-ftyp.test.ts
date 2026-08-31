// @ts-nocheck
import { describe, expect, it, vi, afterEach } from "vitest";
import { GET } from "@/app/api/video-proxy/route.js";

// 模拟抖音混淆的 MP4 数据：ftyp size 首字节 00→01
function makeObfuscatedMp4() {
  const ftyp = Buffer.from([
    0x01, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  ]);
  const mdat = Buffer.from("mdat-content-chunk");
  return Buffer.concat([ftyp, mdat]);
}

describe("video-proxy：抖音 ftyp 头混淆修复", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("代理抖音 365yg.com 视频时修复 ftyp 混淆", async () => {
    const obfuscated = makeObfuscatedMp4();
    // mock 上游 fetch：返回混淆数据
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(obfuscated, {
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "content-length": String(obfuscated.length),
          },
        })
      )
    );

    const req = new Request(
      "http://localhost/api/video-proxy?url=" +
        encodeURIComponent("https://v11-default.365yg.com/xxx/main.mp4"),
      { headers: { "x-forwarded-for": "203.0.113.42" } }
    );
    const res = await GET(req);
    const buf = Buffer.from(await res.arrayBuffer());

    // 前 4 字节应为修复后的 ftyp size 0x00000020
    expect(buf[0]).toBe(0x00);
    expect(buf.subarray(0, 4).toString("hex")).toBe("00000020");
    // 第 4-7 字节仍为 "ftyp"
    expect(buf.subarray(4, 8).toString("latin1")).toBe("ftyp");
    // 后续 mdat 数据不受影响（ftyp box 共 12 字节：size+type+4 字节 brand）
    expect(buf.subarray(12).toString()).toBe("mdat-content-chunk");
  });

  it("非抖音域名不修复 ftyp（原样透传）", async () => {
    const data = makeObfuscatedMp4();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(data, {
          status: 200,
          headers: { "content-type": "video/mp4" },
        })
      )
    );

    const req = new Request(
      "http://localhost/api/video-proxy?url=" +
        encodeURIComponent("https://cdn.example.com/video.mp4"),
      { headers: { "x-forwarded-for": "203.0.113.42" } }
    );
    const res = await GET(req);
    const buf = Buffer.from(await res.arrayBuffer());
    // 非抖音域名：混淆数据原样透传（首字节仍为 0x01）
    expect(buf[0]).toBe(0x01);
  });
});