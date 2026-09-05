/**
 * floating-unlock（激励视频广告）站点级配置
 *
 * 产品口径（2026-09 调整）：后端已完全放开，不再有任何配额校验与验票；
 * 广告弹窗是纯前端行为——每成功解析 freeQuota 次弹一次窗，用户看不看、
 * 关不关都不影响解析（前端 fire-and-forget，结果不参与任何业务判断）。
 *
 * 纯静态对象，可在客户端与服务端同时引用（不要在此读取 process.env）。
 */
export const floatingUnlockConfig = {
  /** wx-auth 后端地址：前端 unlock() 建票在这里（后端不再调 verify 验票） */
  apiBase: "https://wx-auth.shenzjd.com",

  /** 站点标识：小程序激励页展示「为哪个站点解锁」+ 广告分桶/统计；需与 wx-auth 后台登记一致 */
  siteId: "parse.shenzjd.com",

  /** 前端等待 SDK 脚本加载 / 自定义元素升级的超时（毫秒） */
  sdkLoadTimeoutMs: 10000,

  /**
   * 弹窗节奏：前端每累计 freeQuota 次【成功】解析，弹一次广告提示窗。
   * 仅此而已——弹窗失败/被关闭均不重试、不拦截、不影响任何业务流程。
   */
  freeQuota: 3,
} as const;
