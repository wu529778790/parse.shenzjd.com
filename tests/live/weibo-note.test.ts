/**
 * 微博（weibo）链接真机解析回归。
 *
 * 背景：微博解析（游客模式，无需 Cookie），按媒体类型返回：
 *   - code === 200（成功）
 *   - data.type === "video"（视频：url 为视频直链）
 *   - data.type === "image"（图文：images 图集 + url/cover 指向第一张）
 *   - data.type === "text"（纯文字：无媒体字段）
 *   - data.title 为微博正文
 *
 * 本用例锁定微博解析的关键行为，并保存线上案例，方便以后回归对比。
 *
 * 运行: RUN_LIVE_PARSE=1 npx vitest run tests/live/weibo-note.test.ts
 * 或:  npm run test:live
 */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { GET as GETParse } from "@/app/api/parse/route.js";

const RUN =
  process.env.RUN_LIVE_PARSE === "1" || process.env.WEIBO_NOTE_TEST === "1";

const LIVE_TIMEOUT = Number(process.env.LIVE_PARSE_TIMEOUT_MS || 120000);

// 统一走聚合接口 /api/parse：由服务端识别平台并转发到对应解析器。
function req(shareUrl: string) {
  return new Request(
    `http://127.0.0.1/api/parse?url=${encodeURIComponent(shareUrl)}`,
    { headers: { "x-forwarded-for": "203.0.113.42" } }
  );
}

// 线上案例：以后新增微博链接，追加到此处即可复用。
// type 标注该链接预期类型：video（视频）/ image（图文）/ text（纯文字）。
const CASES = [
  {
    name: "微博视频（fid=1034:5336294365265960）",
    url: "https://video.weibo.com/show?fid=1034:5336294365265960",
    type: "video",
  },
  {
    name: "微博视频（fid=1034:5337667139731501）",
    url: "https://video.weibo.com/show?fid=1034:5337667139731501",
    type: "video",
  },
  {
    name: "罗永浩谈孙宇晨事件（图文）",
    url: "https://weibo.com/1956700750/5338266484347047",
    type: "image",
  },
];

describe.skipIf(!RUN)("微博链接真机解析", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const res = await GETParse(req(c.url));
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