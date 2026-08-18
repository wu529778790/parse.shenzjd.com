import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// 站点为 SSG + API 模式，无 ISR/增量缓存需求，采用最简配置（不引入 KV 依赖）。
// 如需 ISR 增量缓存，可引入 kvIncrement override 并配置 NEXT_CACHE_WORKERS_KV 绑定。
export default defineCloudflareConfig({});
