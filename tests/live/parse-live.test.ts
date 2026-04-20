/**
 * 真机解析：直连各平台上游，不使用 mock。
 * 运行: pnpm test:live
 * 需先在 .env.local（或环境变量）中配置 tests/live/urls.example.env 所列全部 LIVE_URL_*。
 */
// @ts-nocheck
import { describe, it, expect, beforeAll } from "vitest";
import { GET as GETDouyin } from "@/app/api/douyin/route.js";
import { GET as GETBilibili } from "@/app/api/bilibili/route.js";
import { GET as GETKuaishou } from "@/app/api/kuaishou/route.js";
import { GET as GETWeibo } from "@/app/api/weibo/route.js";
import { GET as GETXhs } from "@/app/api/xhs/route.js";
import { GET as GETQsmusic } from "@/app/api/qsmusic/route.js";
import { GET as GETPipigx } from "@/app/api/pipigx/route.js";
import { GET as GETPpxia } from "@/app/api/ppxia/route.js";
import { GET as GETHuoshan } from "@/app/api/huoshan/route.js";
import { GET as GETWeishi } from "@/app/api/weishi/route.js";
import { GET as GETXigua } from "@/app/api/xigua/route.js";
import { GET as GETZuiyou } from "@/app/api/zuiyou/route.js";
import { GET as GETQuanmin } from "@/app/api/quanmin/route.js";
import { GET as GETLishipin } from "@/app/api/lishipin/route.js";
import { GET as GETHuya } from "@/app/api/huya/route.js";
import { GET as GETAcfun } from "@/app/api/acfun/route.js";
import { GET as GETMeipai } from "@/app/api/meipai/route.js";
import { GET as GETDoupai } from "@/app/api/doupai/route.js";
import { GET as GETQuanminkge } from "@/app/api/quanminkge/route.js";
import { GET as GETSixroom } from "@/app/api/sixroom/route.js";
import { GET as GETXinpianchang } from "@/app/api/xinpianchang/route.js";
import { GET as GETHaokan } from "@/app/api/haokan/route.js";
import { GET as GETLvzhou } from "@/app/api/lvzhou/route.js";
import { GET as GETTwitter } from "@/app/api/twitter/route.js";

const RUN = process.env.RUN_LIVE_PARSE === "1";

const LIVE_TIMEOUT = Number(process.env.LIVE_PARSE_TIMEOUT_MS || 120000);

function req(path: string, shareUrl: string) {
  return new Request(
    `http://127.0.0.1${path}?url=${encodeURIComponent(shareUrl)}`,
    {
      headers: { "x-forwarded-for": "203.0.113.42" },
    }
  );
}

function expectSuccessCode(json: { code: number }) {
  expect([200, 1]).toContain(json.code);
}

function expectPlayablePayload(id: string, json: Record<string, unknown>) {
  expectSuccessCode(json);
  const data = json.data as Record<string, unknown> | undefined;

  if (id === "bilibili") {
    expect(Array.isArray(data)).toBe(true);
    expect((data as { video_url?: string }[])[0]?.video_url).toMatch(
      /^https?:\/\//
    );
    return;
  }

  expect(data && typeof data === "object").toBe(true);
  const d = data as Record<string, unknown>;

  const directUrl =
    (d.url as string) ||
    (d.photoUrl as string) ||
    (d.video as string) ||
    (d.playurl_video as string);

  const images = d.images as string[] | undefined;

  if (directUrl) {
    expect(directUrl).toMatch(/^https?:\/\//);
    return;
  }
  if (Array.isArray(images) && images.length > 0) {
    expect(images[0]).toMatch(/^https?:\/\//);
    return;
  }

  throw new Error(`${id}: 响应无可用播放/图片地址`);
}

const CASES = [
  { id: "douyin", path: "/api/douyin", envKey: "LIVE_URL_DOUYIN", GET: GETDouyin },
  {
    id: "bilibili",
    path: "/api/bilibili",
    envKey: "LIVE_URL_BILIBILI",
    GET: GETBilibili,
  },
  {
    id: "kuaishou",
    path: "/api/kuaishou",
    envKey: "LIVE_URL_KUAISHOU",
    GET: GETKuaishou,
  },
  { id: "weibo", path: "/api/weibo", envKey: "LIVE_URL_WEIBO", GET: GETWeibo },
  {
    id: "lvzhou",
    path: "/api/lvzhou",
    envKey: "LIVE_URL_LVZHOU",
    GET: GETLvzhou,
  },
  { id: "xhs", path: "/api/xhs", envKey: "LIVE_URL_XHS", GET: GETXhs },
  {
    id: "qsmusic",
    path: "/api/qsmusic",
    envKey: "LIVE_URL_QSMUSIC",
    GET: GETQsmusic,
  },
  {
    id: "pipigx",
    path: "/api/pipigx",
    envKey: "LIVE_URL_PIPIGX",
    GET: GETPipigx,
  },
  { id: "ppxia", path: "/api/ppxia", envKey: "LIVE_URL_PPXIA", GET: GETPpxia },
  {
    id: "huoshan",
    path: "/api/huoshan",
    envKey: "LIVE_URL_HUOSHAN",
    GET: GETHuoshan,
  },
  {
    id: "weishi",
    path: "/api/weishi",
    envKey: "LIVE_URL_WEISHI",
    GET: GETWeishi,
  },
  { id: "xigua", path: "/api/xigua", envKey: "LIVE_URL_XIGUA", GET: GETXigua },
  { id: "zuiyou", path: "/api/zuiyou", envKey: "LIVE_URL_ZUIYOU", GET: GETZuiyou },
  {
    id: "quanmin",
    path: "/api/quanmin",
    envKey: "LIVE_URL_QUANMIN",
    GET: GETQuanmin,
  },
  {
    id: "lishipin",
    path: "/api/lishipin",
    envKey: "LIVE_URL_LISHIPIN",
    GET: GETLishipin,
  },
  { id: "huya", path: "/api/huya", envKey: "LIVE_URL_HUYA", GET: GETHuya },
  { id: "acfun", path: "/api/acfun", envKey: "LIVE_URL_ACFUN", GET: GETAcfun },
  {
    id: "meipai",
    path: "/api/meipai",
    envKey: "LIVE_URL_MEIPAI",
    GET: GETMeipai,
  },
  { id: "doupai", path: "/api/doupai", envKey: "LIVE_URL_DOUPAI", GET: GETDoupai },
  {
    id: "quanminkge",
    path: "/api/quanminkge",
    envKey: "LIVE_URL_QUANMINKGE",
    GET: GETQuanminkge,
  },
  {
    id: "sixroom",
    path: "/api/sixroom",
    envKey: "LIVE_URL_SIXROOM",
    GET: GETSixroom,
  },
  {
    id: "xinpianchang",
    path: "/api/xinpianchang",
    envKey: "LIVE_URL_XINPIANCHANG",
    GET: GETXinpianchang,
  },
  {
    id: "haokan",
    path: "/api/haokan",
    envKey: "LIVE_URL_HAOKAN",
    GET: GETHaokan,
  },
  {
    id: "twitter",
    path: "/api/twitter",
    envKey: "LIVE_URL_TWITTER",
    GET: GETTwitter,
  },
] as const;

describe.skipIf(!RUN)("真机解析（LIVE_URL_* 已配置，直连上游）", () => {
  const configured = CASES.filter((c) => process.env[c.envKey]?.trim());

  for (const { id, path, envKey, GET } of configured) {
    it(id, async () => {
      const shareUrl = process.env[envKey].trim();
      const res = await GET(req(path, shareUrl));
      const json = await res.json();
      if (json.code !== 200 && json.code !== 1) {
        throw new Error(
          `[${id}] 解析失败 code=${json.code} msg=${json.msg}\nurl=${shareUrl}`
        );
      }
      expectPlayablePayload(id, json);
    }, LIVE_TIMEOUT);
  }
});
