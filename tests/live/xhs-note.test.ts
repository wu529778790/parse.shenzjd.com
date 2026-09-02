/**
 * 小红书图文（note）链接真机解析回归。
 *
 * 背景：小红书笔记可能是视频或图文。图文类型没有视频，只有图片，
 * 返回结构为：
 *   - type === "image"
 *   - images 数组非空（图片列表，已代理为 /api/image?url=...）
 *   - cover 为封面图（代理地址）
 *   - url 字段为空（图文没有视频直链）
 *
 * 本用例锁定图文解析的关键行为，并保存线上案例，方便以后回归对比。
 *
 * 运行: RUN_LIVE_PARSE=1 npx vitest run tests/live/xhs-note.test.ts
 * 或:  npm run test:live
 */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { GET as GETXhs } from "@/app/api/xhs/route.js";

// RUN_LIVE_PARSE 由 npm run test:live 注入；XHS_NOTE_TEST 供单独调试本文件使用
// （setup-dotenv.ts 会清除 RUN_LIVE_PARSE，除非通过 test:live 脚本运行）。
const RUN =
  process.env.RUN_LIVE_PARSE === "1" || process.env.XHS_NOTE_TEST === "1";

const LIVE_TIMEOUT = Number(process.env.LIVE_PARSE_TIMEOUT_MS || 120000);

function req(shareUrl: string) {
  return new Request(
    `http://127.0.0.1/api/xhs?url=${encodeURIComponent(shareUrl)}`,
    { headers: { "x-forwarded-for": "203.0.113.42" } }
  );
}

// 线上案例：以后新增小红书链接，追加到此处即可复用。
// type 标注该链接预期类型：image（图文）或 video（视频）。
const CASES = [
  {
    name: "深圳市第二高级中学宝安高中部",
    url: "https://xhslink.cn/o/57ocV3bDobA",
    type: "video",
  },
  {
    name: "AMD 提供 150 小时免费 token",
    url: "https://xhslink.cn/o/8L6yyJlYIBm",
    type: "image",
  },
];

describe.skipIf(!RUN)("小红书链接真机解析", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const res = await GETXhs(req(c.url));
      const json = await res.json();

      expect(json.code).toBe(200);
      const data = json.data;
      expect(data).toBeTruthy();

      // 类型符合预期
      expect(data.type).toBe(c.type);

      // 标题/描述非空
      expect(data.title || data.desc).toBeTruthy();

      if (c.type === "image") {
        // 图文：图片列表非空，且每张都是可访问的代理图片地址
        expect(Array.isArray(data.images)).toBe(true);
        expect(data.images.length).toBeGreaterThan(0);
        for (const img of data.images) {
          expect(img).toMatch(/^\/api\/image\?url=/);
        }
        // 封面图存在
        expect(data.cover).toMatch(/^\/api\/image\?url=/);
        // 图文没有视频，url 字段必须为空
        expect(data.url).toBeUndefined();
      } else {
        // 视频：url 为可访问的视频直链
        expect(data.url).toMatch(/^https?:\/\//);
      }
    }, LIVE_TIMEOUT);
  }
});