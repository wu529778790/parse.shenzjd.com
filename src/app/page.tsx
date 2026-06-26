"use client";
import { useState, useEffect } from "react";
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {/* Hero Section */}
          <header className="text-center mb-8 reveal">
            {/* Title */}
            <h1 className="text-3xl sm:text-4xl font-bold mb-2 glow-text">
              <span className="gradient-text">ParseShort</span>
            </h1>

            {/* Subtitle */}
            <p className="text-sm text-muted max-w-md mx-auto">
              抖音 / B站 / 快手 / 小红书 / 虎牙 / 西瓜 / X…
            </p>
          </header>

          {/* Form Section */}
          <div className={`reveal reveal-delay-2 ${mounted ? "opacity-100" : "opacity-0"}`}>
            <VideoParserForm
              onResult={handleParseResult}
              setLoading={setLoading}
              loading={loading}
            />
          </div>

          {/* Error State */}
          {error && (
            <div className="reveal max-w-2xl mx-auto mt-8">
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
            <div className="reveal max-w-3xl mx-auto mt-8">
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
    </>
  );
}
