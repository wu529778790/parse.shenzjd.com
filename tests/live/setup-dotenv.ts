import { config } from "dotenv";
import { resolve } from "node:path";

const quiet = { quiet: true } as const;
config({ path: resolve(process.cwd(), ".env.local"), ...quiet });
config({ path: resolve(process.cwd(), ".env"), ...quiet });

// 防御性隔离：.env.local 里若误写了 RUN_LIVE_PARSE=1，
// 会被 dotenv 带入默认的 `npm test`，导致真机解析误跑、误连上游。
//
// 真机解析只能通过 `npm run test:live`（命令行前缀 RUN_LIVE_PARSE=1）触发，
// 该变量在 Node 启动前就存在于 process.env，dotenv 默认不覆盖。
// 为彻底隔离，这里在「非 test:live 脚本」下强制清除该标记。
//
// npm_lifecycle_event 是当前执行的 npm 脚本名（如 "test" / "test:live"）。
// 直接 `vitest run`（无 npm 上下文）时该值为 undefined，按"非真机"处理。
const lifecycle = process.env.npm_lifecycle_event;
if (lifecycle !== "test:live") {
  delete process.env.RUN_LIVE_PARSE;
}
