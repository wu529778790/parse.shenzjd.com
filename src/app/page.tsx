"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import VideoParserForm from "@/components/VideoParserForm";
import {
  BilibiliVideo,
  DouyinVideo,
  KuaishouVideo,
  WeiboVideo,
  XhsVideo,
  QsMusicVideo,
  PipigxVideo,
  PpxiaVideo,
  GenericParsedVideo,
} from "@/components/videos";
import { ApiResponse } from "@/types/api";
import { VIDEO_PLATFORMS } from "@/config/video-platforms";

// 平台名称单一数据源：从配置读取，避免与代码脱节（之前 README/SEO 只列了 7 个，实际 24 个）
const PLATFORM_NAMES = Object.values(VIDEO_PLATFORMS).map((p) => p.name);

function renderPlatformResult(result: ApiResponse) {
  switch (result.platform) {
    case "bilibili":
      return <BilibiliVideo data={result} />;
    case "douyin":
      return <DouyinVideo data={result} />;
    case "kuaishou":
      return <KuaishouVideo data={result} />;
    case "weibo":
      return <WeiboVideo data={result} />;
    case "xhs":
      return <XhsVideo data={result} />;
    case "qsmusic":
      return <QsMusicVideo data={result} />;
    case "pipigx":
      return <PipigxVideo data={result} />;
    case "ppxia":
      return <PpxiaVideo data={result} />;
    default:
      // 头部 8 个平台有专属 UI；其余平台（huya/acfun/xigua/twitter 等）
      // 后端返回的都是 GenericParsedData 扁平结构，由 GenericParsedVideo 统一渲染。
      // 如需为某平台定制，新增对应组件并在此补充 case 即可。
      return <GenericParsedVideo data={result} />;
  }
}

export default function Home() {
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  // 公众号浮窗可见性：用户可关闭，关闭状态不持久化（刷新页面后重新显示）
  const [showWxQr, setShowWxQr] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleParseResult = (
    data: ApiResponse | null,
    errorMsg: string = ""
  ) => {
    setResult(data);
    setError(errorMsg);
  };

  return (
    <>
      {/* Morphing Background */}
      <div className="morphing-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* Main Content */}
      <div className="relative min-h-screen" style={{ zIndex: 1 }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {/* Hero Section */}
          <header className="text-center mb-8 reveal">
            {/* Title */}
            <h1 className="text-3xl sm:text-4xl font-bold mb-2 glow-text">
              <span className="gradient-text">ParseShort</span>
            </h1>

            {/* Subtitle */}
            <p className="text-sm text-muted max-w-md mx-auto">
              {PLATFORM_NAMES.slice(0, 8).join(" / ")} / 等 {PLATFORM_NAMES.length}+ 平台
            </p>
          </header>

          {/* Body: Form/Results（公众号浮窗挪到 body 末尾做 fixed，不挤压主结构） */}
          <div className="max-w-3xl mx-auto">
            <div className={`reveal reveal-delay-2 ${mounted ? "opacity-100" : "opacity-0"}`}>
              <VideoParserForm
                onResult={handleParseResult}
                setLoading={setLoading}
                loading={loading}
              />
            </div>

              {/* Error State */}
              {error && (
                <div className="reveal max-w-3xl mt-8">
                  <div className="glass-card iridescent-border p-6 border-l-4 border-l-red-500">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-red-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                          />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-red-400 mb-1">解析失败</h3>
                        <p className="text-sm text-red-300/80">{error}</p>
                      </div>
                      <button
                        onClick={() => setError("")}
                        className="p-1 hover:bg-red-500/10 rounded-lg transition-colors">
                        <svg
                          className="w-5 h-5 text-red-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Results Section */}
              {result && (result.code === 1 || result.code === 200) && (
                <div className="reveal max-w-3xl mt-8">
                  <div className="glass-card iridescent-border">
                    {/* Result Header */}
                    <div className="px-6 py-4 border-b border-border-subtle bg-glass-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-sm font-medium text-primary">
                            解析成功
                          </span>
                        </div>
                        <button
                          onClick={() => setResult(null)}
                          className="p-2 hover:bg-glass-3 rounded-lg transition-colors group">
                          <svg
                            className="w-5 h-5 text-muted group-hover:text-primary transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2}>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Result Content */}
                    <div className="p-6" style={{ touchAction: 'manipulation' }}>
                      {renderPlatformResult(result)}
                    </div>
                  </div>
                </div>
              )}
          </div>

          {/* 右侧悬浮公众号浮窗：lg+ 显示，可关闭，刷新页面后重新显示。
              fixed 定位，不占文档流、不挤压主结构；滚动时保持在视口右侧垂直正中央。 */}
          {showWxQr && (
            <div className="hidden lg:block fixed right-4 top-1/2 -translate-y-1/2 z-40">
              <div className="glass-card iridescent-border p-3 w-32 relative shadow-2xl">
                <button
                  onClick={() => setShowWxQr(false)}
                  aria-label="关闭公众号卡片"
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 text-white text-xs flex items-center justify-center transition-colors leading-none">
                  ×
                </button>
                <p className="text-xs font-medium text-primary text-center mb-2">
                  📱 公众号
                </p>
                <Image
                  src="https://cdn.jsdmirror.com/gh/wu529778790/img.shenzjd.com@master/wp/1782738963299-5wrchz.jpg"
                  alt="公众号二维码"
                  width={120}
                  height={120}
                  className="rounded w-full h-auto"
                  unoptimized
                />
                <p className="text-[10px] text-muted mt-2 text-center leading-tight">
                  关注获取最新更新
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
