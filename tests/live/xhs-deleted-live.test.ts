/**
 * 小红书已删除笔记真机回归。
 *
 * 背景：已删除/不可见笔记的短链会被小红书重定向到 /explore 并附带
 * undertake_note_error 参数，解析器应直接返回 404「该内容已被删除」，
 * 不进入页面解析，更不应给出可重试的模糊报错。
 *
 * 运行: RUN_LIVE_PARSE=1 npx vitest run tests/live/xhs-deleted-live.test.ts
 * 或:  npm run test:live
 */
// @ts-nocheck
import { describe, it, expect } from "vitest";

const RUN =
  process.env.RUN_LIVE_PARSE === "1" || process.env.XHS_DELETED_TEST === "1";

const LIVE_TIMEOUT = Number(process.env.LIVE_PARSE_TIMEOUT_MS || 120000);

// 线上案例：2026-09-04 日志中被反复重试的已删除笔记短链
const DELETED_NOTE_URL = "https://xhslink.cn/o/3Gyr8qtncG6";

describe.skipIf(!RUN)("xhs 已删除笔记（live）", () => {
  it(
    "重定向到 undertake_note_error 时直接返回该内容已被删除",
    async () => {
      const xhs = (await import("@/lib/parsers/xhs")).default;
      const r = await xhs(DELETED_NOTE_URL);
      expect(r.code).toBe(404);
      expect(r.msg).toBe("该内容已被删除");
    },
    LIVE_TIMEOUT
  );
});
