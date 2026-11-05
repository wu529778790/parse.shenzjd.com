// @ts-nocheck
/**
 * 番剧 season 接口不可用时的降级测试。
 *
 * 背景（2026-11-05 线上实证）：pgc/view/web/season 会整段挂起，ep3854822
 * 连续 4 次请求 × 中继超时全失败（每次用户干等 ~60s），同期普通稿件接口正常。
 * 修复：season 单次尝试 10s 硬超时 + 网络级失败时 ep 链接用 ep_id 单参
 * 直取 playurl（2026-11-06 实测 ep_id 单参 code=0 返回 durl）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { biliFetchMock } = vi.hoisted(() => ({ biliFetchMock: vi.fn() }));

vi.mock("@/lib/bilibili-fetch", () => ({
  biliFetch: biliFetchMock,
  BILIBILI_USER_AGENT: "test-ua",
}));
vi.mock("@/lib/bilibili-cookie", () => ({
  getBiliAnonCookie: async () => "",
  saveBiliAnonCookie: async () => {},
  extractBilibiliAnonCookie: () => null,
}));
// signWbiParams 返回 null 走裸查询串，顺带避开 nav 密钥的网络请求
vi.mock("@/lib/bilibili-wbi", () => ({
  signWbiParams: async () => null,
}));

import getBilibiliVideoInfo from "@/lib/parsers/bilibili";

const SEASON_URL_PART = "/pgc/view/web/season";
const PLAYURL_URL_PART = "/pgc/player/web/playurl";

/** 按请求 URL 分发响应；season 一律网络挂起（模拟 2026-11-05 线上故障） */
function mockSeasonDead(playurlEnvelopeFactory) {
  biliFetchMock.mockImplementation(async (url) => {
    if (String(url).includes(SEASON_URL_PART)) {
      throw new Error("The operation was aborted due to timeout");
    }
    if (String(url).includes(PLAYURL_URL_PART)) {
      const body = playurlEnvelopeFactory();
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("unexpected upstream: " + url);
  });
}

const EP_URL = "https://www.bilibili.com/bangumi/play/ep3854822";

const PLAYURL_OK_ENVELOPE = {
  code: 0,
  result: {
    timelength: 123456,
    accept_description: ["1080P 高清", "720P 高清"],
    durl: [
      {
        url: "https://upos-hz-mirrorakam.akamaized.net/x/39729758975-1-416.mp4?e=abc",
        backup_url: [],
      },
    ],
  },
};

beforeEach(() => {
  biliFetchMock.mockReset();
});

afterEach(() => {
  biliFetchMock.mockReset();
});

describe("bilibili 番剧 season 降级", () => {
  it("season 网络挂起时 ep 链接用 ep_id 单参降级直取 playurl，仍返回成功", async () => {
    mockSeasonDead(() => PLAYURL_OK_ENVELOPE);

    const result = await getBilibiliVideoInfo(EP_URL);

    expect(result.code).toBe(1);
    expect(result.msg).toBe("解析成功！");
    expect(result.title).toBe("哔哩哔哩番剧 ep3854822");
    // timelength 123456ms → 123s
    expect(result.data[0].duration).toBe(123);
    expect(result.data[0].video_url).toContain("upos-sz-mirrorbd.bilivideo.com");
    // 降级没有剧集元信息：作者留空（normalizeResult 会转成 undefined）
    expect(result.user.name).toBe("");
  });

  it("降级请求的 playurl 只带 ep_id 不带 cid", async () => {
    mockSeasonDead(() => PLAYURL_OK_ENVELOPE);

    await getBilibiliVideoInfo(EP_URL);

    const playurlCall = biliFetchMock.mock.calls.find(([u]) =>
      String(u).includes(PLAYURL_URL_PART)
    );
    expect(playurlCall).toBeTruthy();
    const query = new URL(String(playurlCall[0])).searchParams;
    expect(query.get("ep_id")).toBe("3854822");
    expect(query.get("cid")).toBeNull();
  });

  it("降级时 playurl 也失败 → 回落原有「解析失败！」", async () => {
    mockSeasonDead(() => ({ code: 0, result: {} }));

    const result = await getBilibiliVideoInfo(EP_URL);

    expect(result.code).toBe(0);
    expect(result.msg).toBe("解析失败！");
  });

  it("降级时 playurl 判定大会员专享 → 返回与正常路径一致的文案", async () => {
    mockSeasonDead(() => ({
      code: -10403,
      result: { is_preview: 1 },
    }));

    const result = await getBilibiliVideoInfo(EP_URL);

    expect(result.code).toBe(0);
    expect(result.msg).toBe("该剧集为大会员专享，匿名无法获取播放地址");
  });

  it("ss 链接没有 ep_id，season 挂起不降级、直接报错", async () => {
    biliFetchMock.mockImplementation(async (url) => {
      if (String(url).includes(SEASON_URL_PART)) {
        throw new Error("The operation was aborted due to timeout");
      }
      throw new Error("unexpected upstream: " + url);
    });

    const result = await getBilibiliVideoInfo(
      "https://www.bilibili.com/bangumi/play/ss42916"
    );

    expect(result.code).toBe(0);
    expect(result.msg).toBe("解析失败！");
    // 只尝试过 season（3 次重试），没有 playurl 请求
    expect(
      biliFetchMock.mock.calls.every(([u]) =>
        String(u).includes(SEASON_URL_PART)
      )
    ).toBe(true);
  });

  it("season 返回风控码是 B站的明确答复：给出风控文案、不走降级", async () => {
    biliFetchMock.mockImplementation(async (url) => {
      if (String(url).includes(SEASON_URL_PART)) {
        return new Response(JSON.stringify({ code: -412, msg: "风控拦截" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error("unexpected upstream: " + url);
    });

    const result = await getBilibiliVideoInfo(EP_URL);

    expect(result.code).toBe(0);
    expect(result.msg).toBe("B站风控拦截，请稍后重试");
    expect(
      biliFetchMock.mock.calls.every(([u]) =>
        String(u).includes(SEASON_URL_PART)
      )
    ).toBe(true);
  });

  it("season 返回 -404 是明确的内容答复：内容已删除文案、不走降级", async () => {
    biliFetchMock.mockImplementation(async (url) => {
      if (String(url).includes(SEASON_URL_PART)) {
        return new Response(JSON.stringify({ code: -404, msg: "啥都木有" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error("unexpected upstream: " + url);
    });

    const result = await getBilibiliVideoInfo(EP_URL);

    expect(result.code).toBe(0);
    expect(result.msg).toBe("该内容已被删除");
    expect(
      biliFetchMock.mock.calls.every(([u]) =>
        String(u).includes(SEASON_URL_PART)
      )
    ).toBe(true);
  });

  it("season 正常时走原路径：返回完整剧集元信息（回归保护）", async () => {
    biliFetchMock.mockImplementation(async (url) => {
      if (String(url).includes(SEASON_URL_PART)) {
        return new Response(
          JSON.stringify({
            code: 0,
            result: {
              title: "某番剧",
              evaluate: "很好看的番",
              episodes: [
                {
                  ep_id: 3854822,
                  cid: 999999,
                  title: "1",
                  long_title: "开场",
                  duration: 1400000,
                  cover: "https://i0.hdslb.com/cover.jpg",
                },
              ],
              up_info: { uname: "制作组", avatar: "https://i0.hdslb.com/a.jpg" },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (String(url).includes(PLAYURL_URL_PART)) {
        return new Response(JSON.stringify(PLAYURL_OK_ENVELOPE), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error("unexpected upstream: " + url);
    });

    const result = await getBilibiliVideoInfo(EP_URL);

    expect(result.code).toBe(1);
    expect(result.title).toBe("某番剧 第1集 开场");
    expect(result.user.name).toBe("制作组");
    expect(result.data[0].video_url).toContain("upos-sz-mirrorbd.bilivideo.com");
  });
});
