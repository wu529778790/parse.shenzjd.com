// @ts-nocheck
/**
 * 快手专用路由兜底逻辑测试：
 * - 主解析失败（parseKuaishou 返回 null）→ 自动走 public17Parse 兜底
 * - 兜底也失败 → 返回 404 提示
 * - 主解析成功 → 不走兜底直接返回
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/kuaishou/route.js";
import * as kuaishouCore from "@/lib/kuaishouCore";
import * as douyinFallback from "@/lib/douyinFallback";

function makeRequest(url) {
  return new Request(`http://127.0.0.1/api/kuaishou?url=${encodeURIComponent(url)}`, {
    headers: { "x-forwarded-for": "203.0.113.42" },
  });
}

describe("kuaishou route fallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.VITEST = "true";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("主解析成功时直接返回，不走兜底", async () => {
    vi.spyOn(kuaishouCore, "parseKuaishou").mockResolvedValue({
      code: 200,
      msg: "解析成功",
      data: { photoUrl: "https://v.kwaicdn.com/x.mp4", source: "main" },
      platform: "kuaishou",
    });
    const fallbackSpy = vi
      .spyOn(douyinFallback, "public17Parse")
      .mockResolvedValue({ ok: true, key: "17change", url: "https://fb.mp4" });

    const res = await GET(makeRequest("https://www.kuaishou.com/short-video/abc123"));
    const json = await res.json();

    expect(json.code).toBe(200);
    expect(json.data.photoUrl).toBe("https://v.kwaicdn.com/x.mp4");
    expect(json.data.source).toBe("main");
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it("主解析返回 null 时走 17change 兜底并成功", async () => {
    vi.spyOn(kuaishouCore, "parseKuaishou").mockResolvedValue(null);
    vi.spyOn(douyinFallback, "public17Parse").mockResolvedValue({
      ok: true,
      key: "17change",
      url: "https://v23-3.kwaicdn.com/upic/x.mp4",
      title: "测试视频",
      cover: "https://p66.a.kwimgs.com/cover.jpg",
      author: "测试作者",
    });

    const res = await GET(makeRequest("https://www.kuaishou.com/f/abc123"));
    const json = await res.json();

    expect(json.code).toBe(200);
    expect(json.data.photoUrl).toMatch(/^https?:\/\//);
    expect(json.data.source).toBe("17change");
    expect(json.data.caption).toBe("测试视频");
    expect(json.data.authorName).toBe("测试作者");
  });

  it("主解析失败且兜底也失败时返回 404", async () => {
    vi.spyOn(kuaishouCore, "parseKuaishou").mockResolvedValue(null);
    vi.spyOn(douyinFallback, "public17Parse").mockResolvedValue({
      ok: false,
      error: "17change: 响应无视频地址",
    });

    const res = await GET(makeRequest("https://www.kuaishou.com/f/fallback404"));
    const json = await res.json();

    expect(json.code).toBe(404);
    expect(json.msg).toContain("解析失败");
  });

  it("主解析返回非 200 结果时走兜底", async () => {
    vi.spyOn(kuaishouCore, "parseKuaishou").mockResolvedValue({
      code: 404,
      msg: "解析失败",
      data: null,
    });
    vi.spyOn(douyinFallback, "public17Parse").mockResolvedValue({
      ok: true,
      key: "17change",
      url: "https://v23-3.kwaicdn.com/upic/y.mp4",
    });

    const res = await GET(makeRequest("https://www.kuaishou.com/photo/xyz"));
    const json = await res.json();

    expect(json.code).toBe(200);
    expect(json.data.photoUrl).toBe("https://v23-3.kwaicdn.com/upic/y.mp4");
  });
});