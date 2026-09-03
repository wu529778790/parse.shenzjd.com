/**
 * floating-unlock（激励视频广告解锁）站点级配置
 *
 * 目前只提供「通用封装」所需的参数与触发开关占位：
 * - 前端何时调用 unlockByAd()（触发时机，如「每日免费 N 次后用广告解锁继续解析」）
 * - 服务端验票 gate 是否介入业务接口
 * 待产品确认交互后接线，届时把开关打开并补充对应逻辑即可，无需改动本库封装。
 *
 * 纯静态对象，可在客户端与服务端同时引用（不要在此读取 process.env；
 * 服务端专属的 env 覆盖见 src/lib/floating-unlock-verify.ts）。
 */
export const floatingUnlockConfig = {
  /** wx-auth 后端地址：unlock() 建票（create）与业务后端验票（verify）都在这里 */
  apiBase: "https://wx-auth.shenzjd.com",

  /** 站点标识：小程序激励页展示「为哪个站点解锁」+ 广告分桶/统计；需与 wx-auth 后台登记一致 */
  siteId: "parse.shenzjd.com",

  /** 前端等待 SDK 脚本加载 / 自定义元素升级的超时（毫秒） */
  sdkLoadTimeoutMs: 10000,

  /**
   * 服务端 gate 开关：默认开启（true）。
   * 接入点（api-middleware）会按本开关对登录用户做「免费 N 次 → 广告解锁」门禁。
   * 如需临时关停（线上快速回退、不动代码重建），设环境变量 FLOATING_UNLOCK_GATE=0；
   * 设 FLOATING_UNLOCK_GATE=1 也可显式开启。环境变量优先于本字段。
   *
   * 注意：开启前请确认 wx-auth 后台已把 siteId（parse.shenzjd.com）登记为广告位站点，
   * 否则解锁建票会失败，满额用户将无法继续解析。
   */
  enableGate: true,

  /**
   * 免费配额：登录用户连续【成功】解析 freeQuota 次后，下一次解析前必须先看广告解锁。
   * 服务端内存计数（仅 Docker / Node 单进程部署可靠；Cloudflare Workers 多 isolate 不可用，
   * 如切到 Workers 需改用 KV/Durable Object 或关闭本开关）。
   * 看完广告、grant 验票通过后计数清零，重新累计 freeQuota 次。
   */
  freeQuota: 3,
} as const;
