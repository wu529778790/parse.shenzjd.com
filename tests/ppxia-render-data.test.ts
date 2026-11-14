// @ts-nocheck
import { afterEach, describe, expect, it, vi } from "vitest";
import ppxia from "@/lib/parsers/ppxia";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const CELL_ID = "7704912964934965530";
const SHARE_URL = `https://h5.pipix.com/s/dbb_K7sVxkA/`;
const ITEM_URL = `https://h5.pipix.com/ppx/item/${CELL_ID}`;

// 与生产 RENDER_DATA 同构：ppxItemDetail.item（视频/作者/文案），video 各
// 清晰度可能为 null，video_download 是通用下载源（2026-11-14 生产实测）
function itemPageHtml(item, { escapeAmp = false } = {}) {
  const payload = { ppxItemDetail: { item } };
  let encoded = encodeURIComponent(JSON.stringify(payload));
  if (escapeAmp) encoded = encoded.replace(/&/g, "&amp;");
  return `<html><script id="RENDER_DATA" type="application/json">${encoded}</script></html>`;
}

const FULL_ITEM = {
  content: "韩服王者的精彩操作QAQ",
  author: {
    name: "念晴921",
    avatar: { url_list: [{ url: "https://p6-ppx-sign.byteimg.com/a.jpg" }] },
  },
  video: {
    cover_image: { url_list: [{ url: "https://p3-ppx-sign.byteimg.com/cover.jpg" }] },
    video_high: null,
    video_mid: null,
    video_low: null,
    video_download: {
      url_list: [{ url: "https://v3-cdn-tos.ppxvod.com/video.mp4?sign=x" }],
    },
  },
};

function mockRedirectAndPage(html, finalUrl = ITEM_URL) {
  const redirectResp = new Response(null, { status: 302 });
  Object.defineProperty(redirectResp, "url", { value: finalUrl });
  global.fetch = vi
    .fn()
    .mockResolvedValueOnce(redirectResp)
    .mockResolvedValueOnce(new Response(html, { status: 200 }));
}

describe("ppxia 解析器（RENDER_DATA 方案）", () => {
  it("分享链接 → item 页 RENDER_DATA → 返回 200 与媒体字段", async () => {
    mockRedirectAndPage(itemPageHtml(FULL_ITEM));

    const result = await ppxia(SHARE_URL);

    expect(result.code).toBe(200);
    expect(result.data.author).toBe("念晴921");
    expect(result.data.title).toBe("韩服王者的精彩操作QAQ");
    expect(result.data.url).toBe("https://v3-cdn-tos.ppxvod.com/video.mp4?sign=x");
    expect(result.data.cover).toBe("https://p3-ppx-sign.byteimg.com/cover.jpg");
    // 页面请求必须带移动 UA（桌面 UA 可能被风控）
    const [pageUrl, init] = global.fetch.mock.calls[1];
    expect(pageUrl).toBe(ITEM_URL);
    expect(init.headers["User-Agent"]).toMatch(/iPhone/);
  });

  it("video_high 存在时优先于 video_download", async () => {
    const item = {
      ...FULL_ITEM,
      video: {
        ...FULL_ITEM.video,
        video_high: {
          url_list: [{ url: "https://v3-cdn-tos.ppxvod.com/high.mp4" }],
        },
      },
    };
    mockRedirectAndPage(itemPageHtml(item));

    const result = await ppxia(SHARE_URL);

    expect(result.code).toBe(200);
    expect(result.data.url).toBe("https://v3-cdn-tos.ppxvod.com/high.mp4");
  });

  it("RENDER_DATA 里的 & 被 SSR 转义成 &amp; 时仍能解析", async () => {
    const item = {
      ...FULL_ITEM,
      video: {
        ...FULL_ITEM.video,
        video_download: {
          url_list: [{ url: "https://v3-cdn-tos.ppxvod.com/video.mp4?a=1&b=2" }],
        },
      },
    };
    mockRedirectAndPage(itemPageHtml(item, { escapeAmp: true }));

    const result = await ppxia(SHARE_URL);

    expect(result.code).toBe(200);
    expect(result.data.url).toBe("https://v3-cdn-tos.ppxvod.com/video.mp4?a=1&b=2");
  });

  it("全部清晰度为 null（图文贴/失效贴）→ 404 视频地址不存在", async () => {
    const item = {
      ...FULL_ITEM,
      video: { ...FULL_ITEM.video, video_download: null },
    };
    mockRedirectAndPage(itemPageHtml(item));

    const result = await ppxia(SHARE_URL);

    expect(result.code).toBe(404);
    expect(result.msg).toBe("视频地址不存在");
  });

  it("页面无 RENDER_DATA → 404 未找到视频数据", async () => {
    mockRedirectAndPage("<html><body>err</body></html>");

    const result = await ppxia(SHARE_URL);

    expect(result.code).toBe(404);
    expect(result.msg).toBe("未找到视频数据");
  });

  it("重定向后不含 /item/<id> → 400", async () => {
    mockRedirectAndPage(itemPageHtml(FULL_ITEM), "https://h5.pipix.com/index");

    const result = await ppxia(SHARE_URL);

    expect(result.code).toBe(400);
    expect(result.msg).toBe("无法从 URL 中提取视频 ID");
  });

  it("短链重定向失败 → 500", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("boom"));

    const result = await ppxia(SHARE_URL);

    expect(result.code).toBe(500);
  });
});
