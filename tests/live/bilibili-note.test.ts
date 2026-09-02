/**
 * B 站（bilibili）视频链接真机解析回归。
 *
 * 背景：B 站解析器原始返回 code=1 + data 分P数组，经出口层 normalizeResult
 * 归一化后为统一契约：
 *   - code === 200（成功）
 *   - data.videos 为分P数组，非空
 *   - 每个分P 的 url 为可访问的视频直链
 *   - data.title 为视频标题
 *
 * 本用例锁定 B 站解析的关键行为，并保存线上案例，方便以后回归对比。
 *
 * 运行: RUN_LIVE_PARSE=1 npx vitest run tests/live/bilibili-note.test.ts
 * 或:  npm run test:live
 */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { GET as GETBilibili } from "@/app/api/bilibili/route.js";

// RUN_LIVE_PARSE 由 npm run test:live 注入；BILIBILI_NOTE_TEST 供单独调试本文件使用
// （setup-dotenv.ts 会清除 RUN_LIVE_PARSE，除非通过 test:live 脚本运行）。
const RUN =
  process.env.RUN_LIVE_PARSE === "1" || process.env.BILIBILI_NOTE_TEST === "1";

const LIVE_TIMEOUT = Number(process.env.LIVE_PARSE_TIMEOUT_MS || 120000);

function req(shareUrl: string) {
  return new Request(
    `http://127.0.0.1/api/bilibili?url=${encodeURIComponent(shareUrl)}`,
    { headers: { "x-forwarded-for": "203.0.113.42" } }
  );
}

// 线上案例：以后新增 B 站链接，追加到此处即可复用。
const CASES = [
  {
    name: "年轻人口加速集中！这届年轻人正在悄悄换战场？",
    url: "https://b23.tv/xlg2vP0",
  },
];

describe.skipIf(!RUN)("B站视频链接真机解析", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const res = await GETBilibili(req(c.url));
      const json = await res.json();

      // 归一化后成功返回 code=200
      expect(json.code).toBe(200);

      const data = json.data;
      expect(data).toBeTruthy();

      // data.videos 为分P 数组，非空
      expect(Array.isArray(data.videos)).toBe(true);
      expect(data.videos.length).toBeGreaterThan(0);

      // 每个分P 都有可访问的视频直链
      for (const v of data.videos) {
        expect(v.url).toMatch(/^https?:\/\//);
      }

      // 标题非空
      expect(data.title).toBeTruthy();
    }, LIVE_TIMEOUT);
  }
});