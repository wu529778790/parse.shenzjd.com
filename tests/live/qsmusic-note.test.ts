/**
 * 汽水音乐（qsmusic）链接真机解析回归。
 *
 * 背景：汽水音乐支持歌曲（track）和 UGC 视频/MV（ugc_video）两种类型，
 * 返回结构为：
 *   - code === 200（成功）
 *   - data.type === "music"
 *   - data.url 为可访问的音乐/视频直链
 *   - data.name 为歌曲名（归一化后映射到 data.title）
 *   - data.author 为歌手名
 *
 * 本用例锁定汽水音乐解析的关键行为，并保存线上案例，方便以后回归对比。
 *
 * 运行: RUN_LIVE_PARSE=1 npx vitest run tests/live/qsmusic-note.test.ts
 * 或:  npm run test:live
 */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { GET as GETParse } from "@/app/api/parse/route.js";

// RUN_LIVE_PARSE 由 npm run test:live 注入；QSMUSIC_NOTE_TEST 供单独调试本文件使用
// （setup-dotenv.ts 会清除 RUN_LIVE_PARSE，除非通过 test:live 脚本运行）。
const RUN =
  process.env.RUN_LIVE_PARSE === "1" || process.env.QSMUSIC_NOTE_TEST === "1";

const LIVE_TIMEOUT = Number(process.env.LIVE_PARSE_TIMEOUT_MS || 120000);

// 统一走聚合接口 /api/parse：由服务端识别平台并转发到对应解析器。
function req(shareUrl: string) {
  return new Request(
    `http://127.0.0.1/api/parse?url=${encodeURIComponent(shareUrl)}`,
    { headers: { "x-forwarded-for": "203.0.113.42" } }
  );
}

// 线上案例：以后新增汽水音乐链接，追加到此处即可复用。
const CASES = [
  {
    name: "Ngẫu Hứng / 洪荒之力（纯音乐）",
    url: "https://qishui.douyin.com/s/iXfucf4F/",
  },
  {
    name: "爱要怎么说出口",
    url: "https://qishui.douyin.com/s/iXfH1EG1/",
  },
  {
    name: "开着你的花在每一个晚霞",
    url: "https://qishui.douyin.com/s/iXfugrR3/",
  },
];

describe.skipIf(!RUN)("汽水音乐链接真机解析", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const res = await GETParse(req(c.url));
      const json = await res.json();

      // 成功返回 code=200
      expect(json.code).toBe(200);

      const data = json.data;
      expect(data).toBeTruthy();

      // 音乐类型
      expect(data.type).toBe("music");

      // 音乐直链可访问
      expect(data.url).toMatch(/^https?:\/\//);

      // 歌曲名非空（归一化后映射到 title）
      expect(data.title || data.name).toBeTruthy();
    }, LIVE_TIMEOUT);
  }
});