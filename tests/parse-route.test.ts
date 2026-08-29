// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/parse/route.js";

describe("parse route", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("routes share urls through the platform handler and returns parsed JSON", async () => {
    const shareUrl = "https://www.douyin.com/video/1234567890123456789";
    const routerData = {
      loaderData: {
        "video_(id)/page": {
          videoInfoRes: {
            item_list: [
              {
                author: {
                  nickname: "作者",
                  unique_id: "author-1",
                  avatar_medium: { url_list: ["https://example.com/avatar.jpg"] },
                },
                statistics: {
                  digg_count: 42,
                },
                create_time: 1710000000,
                desc: "测试视频",
                aweme_type: 0,
                video: {
                  cover: { url_list: ["https://example.com/cover.jpg"] },
                  play_addr: {
                    url_list: ["https://example.com/playwm/video.mp4"],
                  },
                  duration: 10000,
                },
                music: {
                  author: "配乐作者",
                  cover_large: { url_list: ["https://example.com/music.jpg"] },
                },
              },
            ],
          },
        },
      },
    };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("ok"))
      .mockResolvedValueOnce(
        new Response(
          `<script>window._ROUTER_DATA = ${JSON.stringify(routerData)}</script>`
        )
      )
      // 直链有效性验证：对解析出的 URL 发 HEAD 校验
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const res = await GET(
      new Request(
        `http://127.0.0.1/api/parse?url=${encodeURIComponent(shareUrl)}`,
        {
          headers: { "x-forwarded-for": "203.0.113.42" },
        }
      )
    );

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      shareUrl,
      expect.objectContaining({ redirect: "follow" })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://www.iesdouyin.com/share/video/1234567890123456789",
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "https://example.com/play/video.mp4",
      expect.objectContaining({ method: "HEAD" })
    );

    const json = await res.json();
    expect(json).toMatchObject({
      code: 200,
      msg: "解析成功",
      platform: "douyin",
      data: {
        author: "作者",
        title: "测试视频",
        url: "https://example.com/play/video.mp4",
      },
    });
  });

  it("supports source+id mode without requiring a url parameter", async () => {
    const res = await GET(
      new Request("http://127.0.0.1/api/parse?source=douyin&id=1234567890")
    );

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.msg).toContain("ID 解析模式");
  });

  it("routes xiaohongshu share urls to the xhs handler (PLATFORM_INFO key redbook)", async () => {
    // 回归：identifyPlatform 对小红书返回 "redbook"（lib/platforms.ts 的 PLATFORMS.XHS），
    // platformRoutes.js 曾误用路由目录名 "xhs" 作 key，导致统一入口报
    // 「暂不支持 小红书 平台的统一解析」。
    const shareUrl =
      "https://www.xiaohongshu.com/explore/65f0c0e5000000001203d2a3";
    const noteId = "65f0c0e5000000001203d2a3";
    const initialState = {
      note: {
        currentNoteId: noteId,
        noteDetailMap: {
          [noteId]: {
            note: {
              title: "测试笔记",
              desc: "测试描述",
              user: { nickName: "测试作者", userId: "u1" },
              imageList: [
                {
                  urlDefault:
                    "https://sns-webpic-qc.xhscdn.com/202401/img1.jpg",
                },
              ],
            },
          },
        },
      },
    };
    const pageHtml = `<html><script>window.__INITIAL_STATE__=${JSON.stringify(
      initialState
    )}</script></html>`;

    global.fetch = vi.fn().mockResolvedValue(new Response(pageHtml));

    const res = await GET(
      new Request(
        `http://127.0.0.1/api/parse?url=${encodeURIComponent(shareUrl)}`,
        { headers: { "x-forwarded-for": "203.0.113.43" } }
      )
    );

    const json = await res.json();
    expect(json).toMatchObject({
      code: 200,
      msg: "解析成功",
      platform: "redbook",
      data: { type: "image", title: "测试笔记", author: "测试作者" },
    });
    expect(json.data.images[0]).toContain("/api/image?url=");
  });
});
