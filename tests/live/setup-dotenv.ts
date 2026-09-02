import { config } from "dotenv";
import { resolve } from "node:path";

// 加载 .env（供 setup-unit.ts 等使用），quiet 避免输出日志。
config({ path: resolve(process.cwd(), ".env"), quiet: true });