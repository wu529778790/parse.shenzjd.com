// @ts-nocheck
/**
 * 快手解析兜底逻辑测试（lib/parsers/kuaishou.js 纯函数，直接调用）：
 * - 主解析失败（parseKuaishou 返回 null）→ 自动走 public17Parse 兜底
 * - 兜底也失败 → 返回 404 提示
 * - 主解析成功 → 不走兜底直接返回
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import kuaishouParse from "@/lib/parsers/kuaishou";
import * as kuaishouCore from "@/lib/kuaishouCore";
import * as douyinFallback from "@/lib/douyinFallback";

describe("kuaishou parser fallback", () => {
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

    const result = await kuaishouParse(
      "https://www.kuaishou.com/short-video/abc123"
    );

    expect(result.code).toBe(200);
    expect(result.data.photoUrl).toBe("https://v.kwaicdn.com/x.mp4");
    expect(result.data.source).toBe("main");
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

    const result = await kuaishouParse("https://www.kuaishou.com/f/abc123");

    expect(result.code).toBe(200);
    expect(result.data.photoUrl).toMatch(/^https?:\/\//);
    expect(result.data.source).toBe("17change");
    expect(result.data.caption).toBe("测试视频");
    expect(result.data.authorName).toBe("测试作者");
  });

  it("主解析失败且兜底也失败时返回 404", async () => {
    vi.spyOn(kuaishouCore, "parseKuaishou").mockResolvedValue(null);
    vi.spyOn(douyinFallback, "public17Parse").mockResolvedValue({
      ok: false,
      error: "17change: 响应无视频地址",
    });

    const result = await kuaishouParse(
      "https://www.kuaishou.com/f/fallback404"
    );

    expect(result.code).toBe(404);
    expect(result.msg).toContain("解析失败");
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

    const result = await kuaishouParse("https://www.kuaishou.com/photo/xyz");

    expect(result.code).toBe(200);
    expect(result.data.photoUrl).toBe("https://v23-3.kwaicdn.com/upic/y.mp4");
  });
});
