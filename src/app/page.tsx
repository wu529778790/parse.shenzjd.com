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
} from "@/components/videos";
import { ApiResponse } from "@/types/api";

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

      {/* GitHub Floating Button */}
      <a
        href="https://github.com/wu529778790/parse.shenzjd.com"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed top-4 right-4 z-50 group"
        aria-label="GitHub Repository">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-glass-2 backdrop-blur-xl border border-border-subtle hover:border-accent/50 hover:bg-glass-3 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/20">
          <svg
            className="w-5 h-5 text-muted group-hover:text-accent transition-colors duration-300"
            fill="currentColor"
            viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.112.82-.262.82-.582 0-.288-.01-1.05-.016-2.06-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.744.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.42-1.305.763-1.606-2.665-.304-5.466-1.333-5.466-5.93 0-1.31.47-2.382 1.236-3.222-.124-.303-.536-1.524.117-3.176 0 0 1.008-.323 3.3 1.23a11.5 11.5 0 0 1 3.003-.404c1.02.005 2.047.138 3.003.404 2.29-1.553 3.297-1.23 3.297-1.23.655 1.652.243 2.873.12 3.176.77.84 1.235 1.912 1.235 3.222 0 4.61-2.805 5.624-5.477 5.92.431.372.815 1.103.815 2.222 0 1.604-.015 2.896-.015 3.29 0 .322.216.699.825.58C20.565 21.796 24 17.297 24 12c0-6.63-5.37-12-12-12Z" />
          </svg>
          <span className="text-sm font-medium text-muted group-hover:text-primary transition-colors duration-300">
            GitHub
          </span>
        </div>
      </a>

      {/* Main Content */}
      <div className="relative min-h-screen" style={{ zIndex: 1 }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          {/* Hero Section */}
          <header className="text-center mb-16 reveal">
            {/* Logo Mark */}
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-2xl mb-8 float-animation">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125-.504 1.125-1.125M12 14.625c0 .621.504 1.125 1.125 1.125m0 1.5c0 .621-.504 1.125-1.125 1.125m0 0c-.621 0-1.125.504-1.125 1.125M12 14.625v1.5m0-1.5c0 .621.504-1.125 1.125-1.125M12 14.625c0 .621-.504-1.125-1.125-1.125"
                />
              </svg>
            </div>

            {/* Title */}
            <h1 className="text-5xl sm:text-6xl font-bold mb-4 glow-text">
              <span className="gradient-text">ParseShort</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-secondary max-w-xl mx-auto leading-relaxed">
              精通各平台短视频解析
              <span className="block mt-2 text-sm text-muted">
                抖音 · 哔哩哔哩 · 快手 · 小红书
              </span>
            </p>

            {/* Platform Pills */}
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {[
                { name: "抖音", color: "bg-[#fe2c55]/10 text-[#fe2c55]" },
                { name: "哔哩哔哩", color: "bg-[#00aeec]/10 text-[#00aeec]" },
                { name: "快手", color: "bg-[#ff6600]/10 text-[#ff6600]" },
                { name: "小红书", color: "bg-[#ff2442]/10 text-[#ff2442]" },
              ].map((platform, i) => (
                <span
                  key={platform.name}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${platform.color} reveal reveal-delay-${i + 1}`}>
                  {platform.name}
                </span>
              ))}
            </div>
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
                  {result.platform === "bilibili" && (
                    <BilibiliVideo data={result} />
                  )}
                  {result.platform === "douyin" && <DouyinVideo data={result} />}
                  {result.platform === "kuaishou" && (
                    <KuaishouVideo data={result} />
                  )}
                  {result.platform === "weibo" && <WeiboVideo data={result} />}
                  {result.platform === "xhs" && <XhsVideo data={result} />}
                  {result.platform === "qsmusic" && (
                    <QsMusicVideo data={result} />
                  )}
                  {result.platform === "pipigx" && <PipigxVideo data={result} />}
                  {result.platform === "ppxia" && <PpxiaVideo data={result} />}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
