/**
 * X（Twitter）链接真机解析回归。
 *
 * 背景：X 解析走 cdn.syndication.twimg.com 公开接口，按媒体类型返回：
 *   - code === 200（成功）
 *   - data.type === "video"（视频：url 为视频直链）
 *   - data.type === "image"（图文：images 图集 + url/cover 指向第一张）
 *   - data.type === "text"（纯文字：无可下载媒体）
 *   - data.title 为推文正文
 *
 * 注意：X 的 syndication 接口偶发 fetch failed（网络抖动），重试即可。
 *
 * 本用例锁定 X 解析的关键行为，并保存线上案例，方便以后回归对比。
 *
 * 运行: RUN_LIVE_PARSE=1 npx vitest run tests/live/twitter-note.test.ts
 * 或:  npm run test:live
 */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { GET as GETTwitter } from "@/app/api/twitter/route.js";

// RUN_LIVE_PARSE 由 npm run test:live 注入；TWITTER_NOTE_TEST 供单独调试本文件使用
// （setup-dotenv.ts 会清除 RUN_LIVE_PARSE，除非通过 test:live 脚本运行）。
const RUN =
  process.env.RUN_LIVE_PARSE === "1" || process.env.TWITTER_NOTE_TEST === "1";

const LIVE_TIMEOUT = Number(process.env.LIVE_PARSE_TIMEOUT_MS || 120000);

function req(shareUrl: string) {
  return new Request(
    `http://127.0.0.1/api/twitter?url=${encodeURIComponent(shareUrl)}`,
    { headers: { "x-forwarded-for": "203.0.113.42" } }
  );
}

// 线上案例：以后新增 X 链接，追加到此处即可复用。
// type 标注该链接预期类型：video（视频）/ image（图文）/ text（纯文字）。
const CASES = [
  {
    name: "大雷：AI 内容形式（图文）",
    url: "https://x.com/AaronYiaazw/status/2094829468355641555",
    type: "image",
  },
  {
    name: "AYi：AI 版闲鱼（视频）",
    url: "https://x.com/AYi_AInotes/status/2094403099234386187",
    type: "video",
  },
  {
    name: "Nikola：手绘效果视频（视频）",
    url: "https://x.com/Nikola314159/status/2094748793623527608",
    type: "video",
  },
];

describe.skipIf(!RUN)("X 链接真机解析", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const res = await GETTwitter(req(c.url));
      const json = await res.json();

      // 成功返回 code=200
      expect(json.code).toBe(200);

      const data = json.data;
      expect(data).toBeTruthy();

      // 类型符合预期
      expect(data.type).toBe(c.type);

      // 标题非空
      expect(data.title).toBeTruthy();

      if (c.type === "video") {
        // 视频：url 为可访问的视频直链
        expect(data.url).toMatch(/^https?:\/\//);
      } else if (c.type === "image") {
        // 图文：images 图集非空，每张都是可访问的图片地址
        expect(Array.isArray(data.images)).toBe(true);
        expect(data.images.length).toBeGreaterThan(0);
        for (const img of data.images) {
          expect(img).toMatch(/^https?:\/\//);
        }
        // url/cover 指向第一张图
        expect(data.url).toMatch(/^https?:\/\//);
      }
    }, LIVE_TIMEOUT);
  }
});