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
import { GET as GETParse } from "@/app/api/parse/route.js";

const RUN =
  process.env.RUN_LIVE_PARSE === "1" || process.env.BILIBILI_NOTE_TEST === "1";

const LIVE_TIMEOUT = Number(process.env.LIVE_PARSE_TIMEOUT_MS || 120000);

// 统一走聚合接口 /api/parse：由服务端识别平台并转发到对应解析器。
function req(shareUrl: string) {
  return new Request(
    `http://127.0.0.1/api/parse?url=${encodeURIComponent(shareUrl)}`,
    { headers: { "x-forwarded-for": "203.0.113.42" } }
  );
}

// 线上案例：以后新增 B 站链接，追加到此处即可复用。
const CASES = [
  {
    name: "年轻人口加速集中！这届年轻人正在悄悄换战场？",
    url: "https://b23.tv/xlg2vP0",
  },
  {
    // 2026-09-22 线上失败案例：b23.tv 番剧短链 → /bangumi/play/ep675522
    // 原来被 /video/ 判定拦下（code=-1「好像不是视频链接」），现已走 PGC 接口
    name: "番剧 ep 短链（盟卡车神之魔幻元珠 第01集）",
    url: "https://b23.tv/ep675522",
  },
  {
    // 整季链接（ss）→ 取第一集
    name: "番剧 ss 整季链接",
    url: "https://www.bilibili.com/bangumi/play/ss42916",
  },
];

describe.skipIf(!RUN)("B站视频链接真机解析", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const res = await GETParse(req(c.url));
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