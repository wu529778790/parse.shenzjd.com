/**
 * 抖音图文（note）链接真机解析回归。
 *
 * 背景：图文类型没有视频，只有图片。抖音分享页里 video.play_addr 存的是
 * 背景音乐的播放地址（aweme.snssdk.com/aweme/v1/play/?video_id=<mp3>），
 * 不能当作视频直链返回。本用例锁定图文解析的关键行为：
 *   - type === "image"
 *   - images 数组非空（图片列表）
 *   - url 字段为空（不返回错误的音乐地址）
 *
 * 运行: RUN_LIVE_PARSE=1 npx vitest run tests/live/douyin-note.test.ts
 * 或:  npm run test:live
 */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { GET as GETParse } from "@/app/api/parse/route.js";

// RUN_LIVE_PARSE 由 npm run test:live 注入；DOUYIN_NOTE_TEST 供单独调试本文件使用
// （setup-dotenv.ts 会清除 RUN_LIVE_PARSE，除非通过 test:live 脚本运行）。
const RUN =
  process.env.RUN_LIVE_PARSE === "1" || process.env.DOUYIN_NOTE_TEST === "1";

const LIVE_TIMEOUT = Number(process.env.LIVE_PARSE_TIMEOUT_MS || 120000);

// 统一走聚合接口 /api/parse：由服务端识别平台并转发到对应解析器。
function req(shareUrl: string) {
  return new Request(
    `http://127.0.0.1/api/parse?url=${encodeURIComponent(shareUrl)}`,
    { headers: { "x-forwarded-for": "203.0.113.42" } }
  );
}

// 线上图文案例：以后新增图文链接，追加到此处即可复用。
const CASES = [
  { name: "宋钱来图文", url: "https://v.douyin.com/RdT8EVMUD8Q/" },
  { name: "王腾Thomas图文", url: "https://v.douyin.com/upsI7BKbus0/" },
];

describe.skipIf(!RUN)("抖音图文链接真机解析", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const res = await GETParse(req(c.url));
      const json = await res.json();

      expect(json.code).toBe(200);
      const data = json.data;
      expect(data).toBeTruthy();

      // 图文类型
      expect(data.type).toBe("image");

      // 图片列表非空，且每张都是可访问的图片地址
      expect(Array.isArray(data.images)).toBe(true);
      expect(data.images.length).toBeGreaterThan(0);
      for (const img of data.images) {
        expect(img).toMatch(/^https?:\/\//);
      }

      // 图文没有视频，url 字段必须为空（不能返回背景音乐地址）
      expect(data.url).toBeUndefined();
    }, LIVE_TIMEOUT);
  }
});