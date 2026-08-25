// @ts-nocheck
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  tryParseEmbedded,
  hasValidData,
  parseVideoData,
  extractFilterReason,
  isChallengeHtml,
  extractIdFromUrl,
  extractTtwid,
} from "@/lib/douyin-extract";

// 页面快照：tests/snapshots/*.html
// 平台改版后，用新页面 HTML 替换快照文件，跑本测试即可定位提取逻辑失效点。
const snapshot = (name) =>
  readFileSync(path.join(process.cwd(), "tests/snapshots", name), "utf-8");

describe("douyin-extract：页面快照回归", () => {
  const videoHtml = snapshot("douyin-share-video.html");
  const noteHtml = snapshot("douyin-share-note.html");
  const filteredHtml = snapshot("douyin-share-filtered.html");

  it("标准视频分享页：解析出 _ROUTER_DATA 且数据有效", () => {
    const parsed = tryParseEmbedded(videoHtml);
    expect(parsed).not.toBeNull();
    expect(hasValidData(parsed)).toBe(true);
  });

  it("标准视频分享页：提取 title/author/url/audioUrl/duration", () => {
    const parsed = tryParseEmbedded(videoHtml);
    const result = parseVideoData(parsed);
    expect(result.code).toBe(200);
    expect(result.data).toMatchObject({
      title: "测试视频：快照回归",
      author: "快照作者",
      uid: "snapshot-author",
      // playwm → play（无水印）
      url: "https://v26-web.douyinvod.com/snapshot/play/video.mp4",
      type: "video",
      duration: 15000,
      like: 888,
      audioUrl: "https://sf6-cdn-tos.douyinstatic.com/music.mp3",
    });
  });

  it("图文笔记分享页：识别为 image 并提取图集", () => {
    const parsed = tryParseEmbedded(noteHtml);
    expect(hasValidData(parsed)).toBe(true);
    const result = parseVideoData(parsed);
    expect(result.code).toBe(200);
    expect(result.data.type).toBe("image");
    expect(result.data.images).toHaveLength(2);
    expect(result.data.cover).toBe("https://p3.douyinpic.com/img1.jpg");
    expect(result.data.url).toBeUndefined();
  });

  it("被过滤页（SYSTEM_ITEM_NOT_EXIST）：数据无效但能提取原因", () => {
    const parsed = tryParseEmbedded(filteredHtml);
    expect(hasValidData(parsed)).toBe(false);
    expect(extractFilterReason(parsed)).toBe("SYSTEM_ITEM_NOT_EXIST");
    expect(parseVideoData(parsed)).toBeNull();
  });

  it("RENDER_DATA（URL 编码）格式也能解析", () => {
    const payload = JSON.stringify({
      loaderData: {
        "video_(id)/page": {
          videoInfoRes: { item_list: [{ desc: "render-data-ok" }] },
        },
      },
    });
    const html = `<script id="RENDER_DATA">${encodeURIComponent(payload)}</script>`;
    const parsed = tryParseEmbedded(html);
    expect(
      parsed.loaderData["video_(id)/page"].videoInfoRes.item_list[0].desc
    ).toBe("render-data-ok");
  });

  it("argus 反爬页：无数据块且识别为 challenge", () => {
    const html = `<html><head><script src="/argus-csp-token"></script><script>var _$jsvmprt;</script></head></html>`;
    expect(tryParseEmbedded(html)).toBeNull();
    expect(isChallengeHtml(html)).toBe(true);
  });

  it("正常页面不被误判为反爬", () => {
    expect(isChallengeHtml(videoHtml)).toBe(false);
  });

  it("从 URL 提取视频/图文 ID", () => {
    expect(
      extractIdFromUrl("https://www.iesdouyin.com/share/video/1234567890123456789")
    ).toEqual({ id: "1234567890123456789", type: "video" });
    expect(
      extractIdFromUrl("https://www.iesdouyin.com/share/note/2345678901234567890")
    ).toEqual({ id: "2345678901234567890", type: "note" });
    expect(extractIdFromUrl("https://v.douyin.com/abc/")).toBeNull();
  });

  it("从跳转域名 target 参数提取 ID（wtturl.cn 等）", () => {
    // 跳转服务失效时，target 参数里的完整抖音链接兜底可提取
    expect(
      extractIdFromUrl(
        "https://link.wtturl.cn/?target=https%3A%2F%2Fwww.iesdouyin.com%2Fshare%2Fvideo%2F6891626572860706051"
      )
    ).toEqual({ id: "6891626572860706051", type: "video" });
    // 无 target 参数的普通链接不受影响
    expect(extractIdFromUrl("https://link.wtturl.cn/")).toBeNull();
  });

  it("从响应头提取 ttwid", () => {
    const res = new Response(null, {
      headers: {
        "set-cookie": "ttwid=abc123; Path=/; Max-Age=31536000",
      },
    });
    expect(extractTtwid(res)).toBe("ttwid=abc123");
    expect(extractTtwid(new Response(null))).toBe("");
  });
});
