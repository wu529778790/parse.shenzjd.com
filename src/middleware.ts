/**
 * 全局 middleware：
 *
 * 1. Server Action 探测短路——本应用完全没有使用 React Server Actions
 *    （全仓无 "use server"），任何携带 Next-Action 头的请求都只可能是扫描器
 *    伪造的。放行的话 Next 内部会抛 NoFallbackError / Server Reference ID
 *    mismatch 并多行刷屏（2026-11-14 线上 4 天 ~180 行，占日志 17%），
 *    这里在路由解析前直接 403 短路，不记日志（纯扫描噪音，无排障价值）。
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(req: NextRequest) {
  if (req.headers.get("Next-Action")) {
    return new NextResponse(null, { status: 403 });
  }
  return NextResponse.next();
}
