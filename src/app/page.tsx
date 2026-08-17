"use client";
import { useState, useEffect } from "react";
import FloatingQR from "@wu529778790/floating-qr";
import "@wu529778790/floating-qr/style.css";
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
import { siteConfig } from "@/config/site";

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

  useEffect(() => {
    setMounted(true);
  }, []);

  // 右侧悬浮公众号+赞赏码浮窗：由 @wu529778790/floating-qr 提供
  // 全部走包默认值（标题/文案/二维码图都是为本站预设的），不传自定义文案
  useEffect(() => {
    const fq = new FloatingQR({
      position: "right-center",
    });
    return () => fq?.destroy();
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
              <span className="gradient-text">神族九帝</span>
            </h1>

            {/* Subtitle */}
            <p className="text-sm text-muted max-w-md mx-auto">
              支持 {PLATFORM_NAMES.length}+ 平台视频解析下载 · 免费在线 · 粘贴链接即用
            </p>
          </header>

          {/* Platform Chips（首页「SEO 收录入口」，对用户不可点击 —— 解析仍走上方输入框）
              HTML 保留 <a href> 让爬虫跟随、传递首页→落地页的内链权重；
              前端拦截点击/回车 + 视觉降透明度，让用户一眼看出是展示项。 */}
          <nav
            className="flex flex-wrap justify-center gap-2 mb-8 items-center"
            aria-label="支持平台列表（SEO 收录入口，解析请使用上方输入框）">
            <span className="text-xs text-muted/70 mr-1" aria-hidden="true">
              SEO 收录 ·
            </span>
            {Object.entries(VIDEO_PLATFORMS).map(([key, p]) => (
              <a
                key={key}
                href={`/platform/${key}`}
                onClick={(e) => e.preventDefault()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") e.preventDefault();
                }}
                title={`${p.name} - 仅供搜索引擎收录，解析请粘贴链接到上方输入框`}
                className="px-3 py-1.5 rounded-full text-xs bg-glass-2 text-secondary opacity-60 hover:opacity-90 cursor-default transition-opacity select-none">
                {p.emoji} {p.name}解析
              </a>
            ))}
          </nav>

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
                        <p className="text-xs text-muted mt-3 leading-relaxed">
                          遇到问题？关注公众号「神族九帝」并给公众号发消息，
                          向站长反馈失败链接，我们会尽快排查处理。
                        </p>
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
        </div>
      </div>

      {/* FAQ 结构化数据（SEO） */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "短视频怎么去水印下载？",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "复制视频分享链接或完整分享文案，粘贴到神族九帝输入框，点击解析即可获得无水印视频下载地址，全程免费在线使用，无需安装软件。",
                },
              },
              {
                "@type": "Question",
                name: "支持哪些平台的视频解析？",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: `支持 ${PLATFORM_NAMES.join("、")} 等 ${PLATFORM_NAMES.length}+ 平台的视频解析与无水印下载。`,
                },
              },
              {
                "@type": "Question",
                name: "解析失败怎么办？",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: `部分视频受平台风控或地区限制可能暂时无法解析，可更换网络环境后重试；如仍失败，关注公众号「${siteConfig.name}」并反馈链接，站长会协助排查。`,
                },
              },
            ],
          }),
        }}
      />
    </>
  );
}
