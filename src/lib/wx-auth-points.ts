/**
 * 解析接口的积分客户端（服务端转发 wx-auth 账本）
 *
 * 产品口径（2026-09-18 拍板）：**没有免费额度**——每次「真实解析」扣 1 积分，
 * 余额不足直接提示。小程序侧（看广告赚积分、网页出码闭环）尚未上线，本期不接入。
 *
 * 为什么必须服务端调用：wx-auth 的 spend 契约要求由接入方服务端集中代理
 * （Bearer 转发，与现有 check 同一模式）。浏览器直调等于把「扣谁的钱、扣多少」
 * 交给客户端，等于没做限制。本模块只做转发，不做任何本地记账。
 *
 * fail-open（可用性优先）：账本超时 / 非 2xx / 响应缺字段一律当「放行」——
 * 积分是计费能力，不能因为 wx-auth 抖动把整个解析服务打挂；代价是极少数请求免费。
 * 唯一的例外是「账本明确回了余额不足」，那种情况要拦住（见 ensureParseQuota）。
 *
 * 幂等（最重要契约）：actionId 是「本次用户动作」的随机 ID，网络超时重发必须复用
 * 同一个，否则同一次解析会被扣两次；wx-auth 侧 point_ledger.action_id 是 UNIQUE
 * 索引，兜底保证只扣一次。
 */

const AUTH_API_BASE =
  process.env.WXAUTH_API_BASE || "https://wx-auth.shenzjd.com";
const BALANCE_TIMEOUT_MS = 3000;
const SPEND_TIMEOUT_MS = 3000;
const CHECKIN_TIMEOUT_MS = 3000;

/** 每次真实解析扣几分（业务定价；账本只拦单笔上限，默认 100） */
export const PARSE_COST = 1;
/** 来源标签：进 wx-auth 流水，供后台按来源分组统计（不参与任何判定） */
export const PARSE_SCENE = "parse:video";

/**
 * 计费总开关：`WXAUTH_POINTS_ENABLED=false` 时整体回退为「免费不限次」。
 * 线上应急用（账本侧异常时不必回滚代码重新部署），默认开启。
 */
export function pointsEnabled(): boolean {
  return process.env.WXAUTH_POINTS_ENABLED !== "false";
}

const UA = "parse.shenzjd.com/points";

export interface PointsBalance {
  balance: number;
  /** 今天（北京自然日）是否已签到——由账本判定，客户端不自己算日期 */
  checkedIn: boolean;
  /** 一次广告得几分（小程序链路用，本期仅用于文案兜底） */
  adReward: number;
  /** 每日签到发几分（后台可调，别写死） */
  checkinReward: number;
}

/** 统一的请求头：Bearer 转发用户凭证 + 固定 UA 便于账本侧日志辨识来源 */
function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "user-agent": UA,
  };
}

/**
 * 查询余额（GET /api/points/balance）。
 * 返回 null = 账本不可用/响应不可信，调用方按 fail-open 处理。
 */
export async function fetchPointsBalance(
  token: string
): Promise<PointsBalance | null> {
  try {
    const response = await fetch(`${AUTH_API_BASE}/api/points/balance`, {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(BALANCE_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[wx-auth-points] balance 查询失败 HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    const balance = Number(data?.balance);
    if (!Number.isFinite(balance)) {
      console.error("[wx-auth-points] balance 响应缺少余额字段，按不可信处理");
      return null;
    }
    return {
      balance,
      checkedIn: data?.checkedIn === true,
      adReward: Number(data?.adReward) || 0,
      checkinReward: Number(data?.checkinReward) || 0,
    };
  } catch (error) {
    console.error(
      "[wx-auth-points] balance 请求异常:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/** 扣分结果：ok=已扣/已抵扣，insufficient=明确余额不足，null=账本不可用（fail-open） */
export type SpendResult =
  | { ok: true; charged: string; balance: number }
  | { ok: false; insufficient: true; balance: number }
  | null;

/**
 * 扣 1 分（POST /api/points/spend，body `{ amount, actionId, scene }`）。
 * actionId 必须是本次用户动作的幂等键，重试复用同一个。
 */
export async function spendParsePoints(
  token: string,
  actionId: string
): Promise<SpendResult> {
  try {
    const response = await fetch(`${AUTH_API_BASE}/api/points/spend`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: PARSE_COST,
        actionId,
        scene: PARSE_SCENE,
      }),
      signal: AbortSignal.timeout(SPEND_TIMEOUT_MS),
    });

    // 409 = 账本明确判定余额不足（唯一需要「拦截」的业务分支）
    if (response.status === 409) {
      const data = await response.json().catch(() => ({}));
      return {
        ok: false,
        insufficient: true,
        balance: Number(data?.data?.balance) || 0,
      };
    }
    if (!response.ok) {
      console.error(`[wx-auth-points] spend 失败 HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    return {
      ok: true,
      charged: String(data?.charged || "points"),
      balance: Number(data?.balance) || 0,
    };
  } catch (error) {
    console.error(
      "[wx-auth-points] spend 请求异常:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * 领取当日签到积分（POST /api/points/checkin，幂等：一人一天一次）。
 * 返回 null = 账本不可用；`balance` 仅在本次真的发了分时可信（granted>0），
 * 重复调用（今天已领）账本会返回 granted=0 + balance=null。
 */
export async function checkinPoints(
  token: string
): Promise<{ granted: number; balance: number | null } | null> {
  try {
    const response = await fetch(`${AUTH_API_BASE}/api/points/checkin`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(CHECKIN_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[wx-auth-points] checkin 失败 HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    return {
      granted: Number(data?.granted) || 0,
      balance: data?.balance == null ? null : Number(data.balance),
    };
  } catch (error) {
    console.error(
      "[wx-auth-points] checkin 请求异常:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export interface ParseQuota {
  allowed: boolean;
  /** allowed=false 时给用户看的提示（直接进 errorResponse 的 msg） */
  message: string;
}

/**
 * 解析前的额度确认（预检 + 每日签到兜底）。
 *
 * - 余额 ≥ PARSE_COST：放行。
 * - 余额不足：先补领一次当日签到（幂等）。带这个兜底的原因是没有免费额度，
 *   积分用完后用户当天会彻底卡死；而「每天签到发分」本就是账本既有规则，
 *   这里只是把「用户手动点签到」挪到「首次使用时自动领」，用户无感。
 * - 仍不足（今天已领过且余额为 0）：拒绝，并告诉用户明天再来。
 * - 账本不可用：放行（fail-open，见文件头）。
 */
export async function ensureParseQuota(token: string): Promise<ParseQuota> {
  const balance = await fetchPointsBalance(token);
  if (!balance) return { allowed: true, message: "" };
  if (balance.balance >= PARSE_COST) return { allowed: true, message: "" };

  if (!balance.checkedIn) {
    const checkin = await checkinPoints(token);
    if (checkin && checkin.granted > 0) return { allowed: true, message: "" };
    // granted=0 可能是并发（同一用户两个请求同时领），再确认一次余额；
    // 这条路径只在「余额不足」时触发，额外一次往返成本可接受
    const again = await fetchPointsBalance(token);
    if (again && again.balance >= PARSE_COST) return { allowed: true, message: "" };
  }

  const reward = balance.checkinReward || 10;
  return {
    allowed: false,
    message: `积分不足，暂时无法解析（每日签到赠送 ${reward} 积分，明天再来吧）`,
  };
}

/**
 * 解析成功后的结算（best-effort）：
 * 只在真实返回成功结果时调用（解析失败不收费，见 api-middleware 的调用点）。
 * 任何失败只记日志、不抛异常——结果已经解析出来了，不能因为记账抖动把结果吞掉。
 */
export async function settleParsePoints(
  token: string,
  actionId: string
): Promise<void> {
  const result = await spendParsePoints(token, actionId);
  if (result === null) {
    // 账本不可用/超时：本次免费放行（fail-open），留日志便于对账
    console.error(`[wx-auth-points] 扣分未落账（actionId=${actionId}），本次解析免费`);
    return;
  }
  if (!result.ok) {
    // 预检通过但结算时余额不足：只可能是并发（同一用户同时发起多个解析）。
    // 结果已解析完成，按宽容口径返回给用户，不重复提示。
    console.warn(
      `[wx-auth-points] 结算时余额不足（actionId=${actionId}，balance=${result.balance}），本次解析免费`
    );
  }
}
