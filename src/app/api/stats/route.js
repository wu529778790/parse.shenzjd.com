import { queryStats } from "@/lib/analytics";
import { getCorsHeaders } from "@/lib/api-utils";
import { getWxAuthUser } from "@/lib/wx-auth-guard";

export const runtime = "nodejs";

/**
 * 解析行为统计接口（只读）。
 * 鉴权：复用微信登录态（wxauth-token），仅管理员（用户表 is_admin 标记）可访问。
 * 返回：按平台 / 按天（近 14 天）聚合 + 总量 / 独立访客（IP 匿名哈希）/ 独立链接数。
 */
export async function GET(request) {
  const corsHeaders = getCorsHeaders(request.headers.get("origin") || "");

  const user = await getWxAuthUser(request);
  if (!user.authenticated) {
    return Response.json(
      { code: 401, msg: "请先完成微信登录" },
      { status: 401, headers: corsHeaders }
    );
  }
  if (!user.isAdmin) {
    return Response.json(
      { code: 403, msg: "仅管理员可访问" },
      { status: 403, headers: corsHeaders }
    );
  }

  const stats = await queryStats();
  if (!stats) {
    return Response.json(
      { code: 500, msg: "统计数据库未配置或查询失败" },
      { status: 500, headers: corsHeaders }
    );
  }

  return Response.json({ code: 200, msg: "ok", data: stats }, { headers: corsHeaders });
}
