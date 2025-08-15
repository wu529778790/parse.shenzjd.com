import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // 处理代理后的 HTTPS
  const forwarded = request.headers.get("x-forwarded-proto");

  // 如果是通过 Cloudflare 代理的 HTTPS 请求
  if (forwarded === "https" || request.headers.get("cf-visitor")) {
    // 设置安全头
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");

    // 强制升级不安全请求
    response.headers.set(
      "Content-Security-Policy",
      "upgrade-insecure-requests; default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; img-src 'self' data: https: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
