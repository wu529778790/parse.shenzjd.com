/**
 * 小红书已删除笔记真机回归。
 *
 * 背景：已删除/不可见笔记的短链会被小红书重定向到 /explore 并附带
 * undertake_note_error 参数，解析器应直接返回 404「该内容已被删除」，
 * 不进入页面解析，更不应给出可重试的模糊报错。
 *
 * ⚠️ 样本已失效（2026-09-23）：原线上案例 https://xhslink.cn/o/3Gyr8qtncG6
 * 已被作者恢复/审核放行，实测返回完整笔记数据（「当AI给女友拍写真」视频），
 * 不再是「已删除」样本，继续断言 404 只会得到假失败。因此本文件默认不随
 * `npm run test:live` 一起跑，找到新的已删除短链后把链接换进下面的常量，
 * 再用 XHS_DELETED_TEST=1 单独启用。
 *
 * 该分支的确定性覆盖不依赖真机：见 tests/xhs-login-redirect.test.ts
 * 的「undertake_note_error → 404 该内容已被删除」用例（mock 重定向）。
 *
 * 运行: RUN_LIVE_PARSE=1 XHS_DELETED_TEST=1 npx vitest run tests/live/xhs-deleted-live.test.ts
 */
// @ts-nocheck
import { describe, it, expect } from "vitest";

// 注意：不要改回 RUN_LIVE_PARSE——样本失效期间它会污染整批真机回归
const RUN = process.env.XHS_DELETED_TEST === "1";

const LIVE_TIMEOUT = Number(process.env.LIVE_PARSE_TIMEOUT_MS || 120000);

// 线上案例（2026-09-04 日志中被反复重试的已删除笔记短链，现已失效，见文件头）
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
