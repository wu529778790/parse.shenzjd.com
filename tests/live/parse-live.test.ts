/**
 * 真机解析：直连各平台上游，不使用 mock。
 * 运行: npm run test:live
 * 需先在 .env（或环境变量）中配置 tests/live/urls.example.env 所列全部 LIVE_URL_*。
 */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { GET as GETParse } from "@/app/api/parse/route.js";

const RUN = process.env.RUN_LIVE_PARSE === "1";

const LIVE_TIMEOUT = Number(process.env.LIVE_PARSE_TIMEOUT_MS || 120000);

// 统一走聚合接口 /api/parse：由服务端识别平台并转发到对应解析器。
function req(shareUrl: string) {
  return new Request(
    `http://127.0.0.1/api/parse?url=${encodeURIComponent(shareUrl)}`,
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

  expect(data && typeof data === "object").toBe(true);
  const d = data as Record<string, unknown>;

  // 多分P/合集（bilibili 等）：data.videos 为分P数组，每项有 url 直链
  const videos = d.videos as { url?: string }[] | undefined;
  if (Array.isArray(videos) && videos.length > 0) {
    expect(videos[0]?.url).toMatch(/^https?:\/\//);
    return;
  }

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
  { id: "douyin", envKey: "LIVE_URL_DOUYIN" },
  { id: "bilibili", envKey: "LIVE_URL_BILIBILI" },
  { id: "kuaishou", envKey: "LIVE_URL_KUAISHOU" },
  { id: "weibo", envKey: "LIVE_URL_WEIBO" },
  { id: "lvzhou", envKey: "LIVE_URL_LVZHOU" },
  { id: "xhs", envKey: "LIVE_URL_XHS" },
  { id: "qsmusic", envKey: "LIVE_URL_QSMUSIC" },
  { id: "pipigx", envKey: "LIVE_URL_PIPIGX" },
  { id: "ppxia", envKey: "LIVE_URL_PPXIA" },
  { id: "huoshan", envKey: "LIVE_URL_HUOSHAN" },
  { id: "weishi", envKey: "LIVE_URL_WEISHI" },
  { id: "xigua", envKey: "LIVE_URL_XIGUA" },
  { id: "zuiyou", envKey: "LIVE_URL_ZUIYOU" },
  { id: "quanmin", envKey: "LIVE_URL_QUANMIN" },
  { id: "lishipin", envKey: "LIVE_URL_LISHIPIN" },
  { id: "huya", envKey: "LIVE_URL_HUYA" },
  { id: "acfun", envKey: "LIVE_URL_ACFUN" },
  { id: "meipai", envKey: "LIVE_URL_MEIPAI" },
  { id: "doupai", envKey: "LIVE_URL_DOUPAI" },
  { id: "quanminkge", envKey: "LIVE_URL_QUANMINKGE" },
  { id: "sixroom", envKey: "LIVE_URL_SIXROOM" },
  { id: "xinpianchang", envKey: "LIVE_URL_XINPIANCHANG" },
  { id: "haokan", envKey: "LIVE_URL_HAOKAN" },
  { id: "twitter", envKey: "LIVE_URL_TWITTER" },
] as const;

describe.skipIf(!RUN)("真机解析（LIVE_URL_* 已配置，统一走 /api/parse）", () => {
  const configured = CASES.filter(({ envKey }) => process.env[envKey]?.trim());

  for (const { id, envKey } of configured) {
    it(id, async () => {
      const shareUrl = process.env[envKey].trim();
      const res = await GETParse(req(shareUrl));
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
