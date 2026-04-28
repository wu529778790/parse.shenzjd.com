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
                video: {
                  cover: { url_list: ["https://example.com/cover.jpg"] },
                  play_addr: {
                    url_list: ["https://example.com/playwm/video.mp4"],
                  },
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
      );

    const res = await GET(
      new Request(
        `http://127.0.0.1/api/parse?url=${encodeURIComponent(shareUrl)}`,
        {
          headers: { "x-forwarded-for": "203.0.113.42" },
        }
      )
    );

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
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
});
