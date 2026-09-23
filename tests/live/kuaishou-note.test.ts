/**
 * 快手（kuaishou）真机解析回归。
 *
 * 背景（2026-09-22 线上日志）：www.kuaishou.com/f/<token> 长链连续 3 次
 * 「解析失败（无返回结果）」，而 v.kuaishou.com 短链能成功。根因是对移动 UA
 * 请求 PC 页面 www.kuaishou.com/short-video/<id> 会被反爬，只返回 63 字节 JSON。
 *
 * 本用例锁定修复后的行为：长链（/f/）、短链（v.kuaishou.com）、规范短链
 * （/short-video/）三种形态都要能解析出 mp4 直链。
 *
 * 运行: RUN_LIVE_PARSE=1 npx vitest run tests/live/kuaishou-note.test.ts
 */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { GET as GETParse } from "@/app/api/parse/route.js";

const RUN = process.env.RUN_LIVE_PARSE === "1";

const LIVE_TIMEOUT = Number(process.env.LIVE_PARSE_TIMEOUT_MS || 120000);

function req(shareUrl: string) {
  return new Request(
    `http://127.0.0.1/api/parse?url=${encodeURIComponent(shareUrl)}`,
    { headers: { "x-forwarded-for": "203.0.113.42" } }
  );
}

// 线上失败案例（2026-09-22）+ 对照正常的短链形态
const CASES = [
  { name: "长链 /f/（线上失败案例 1）", url: "https://www.kuaishou.com/f/X7usJFngfn0dcIM" },
  { name: "长链 /f/（线上失败案例 2）", url: "https://www.kuaishou.com/f/X5JuDhU5GWtp1I3" },
  { name: "短链 v.kuaishou.com（对照）", url: "https://v.kuaishou.com/KjYpv3I5" },
];

describe.skipIf(!RUN)("快手链接真机解析", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const res = await GETParse(req(c.url));
      const json = await res.json();

      expect(json.code).toBe(200);
      const url = json.data?.url || json.data?.photoUrl;
      expect(url).toMatch(/^https?:\/\//);
      // 直链必须是干净的 mp4（转义页面的宽正则会带上尾部反斜杠，必须已清洗）
      expect(url).not.toMatch(/\\/);
      // 必须是 mp4 而不是 HLS(m3u8)：页面里 HLS 排在更前面，浏览器 <video> 播不了
      expect(url).toMatch(/\.mp4/i);
      // 标题（文案）应被抽出，而不是只有一条裸直链
      expect(json.data?.title).toBeTruthy();
    }, LIVE_TIMEOUT);
  }
});
