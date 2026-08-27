"use client";
import { useState, useEffect } from "react";
import VideoParserForm from "@/components/VideoParserForm";
import PlatformIcon from "@/components/PlatformIcon";
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
import { VIDEO_PLATFORMS, type VideoPlatformKey } from "@/config/video-platforms";
import { siteConfig } from "@/config/site";

// 平台名称单一数据源：从配置读取，避免与代码脱节（之前 README/SEO 只列了 7 个，实际 24 个）
const PLATFORM_NAMES = Object.values(VIDEO_PLATFORMS).map((p) => p.name);

const STEPS = [
  {
    title: "复制分享链接",
    desc: "在抖音、快手、B站等 App 内点「分享」，复制链接（支持 .short 等短链）。",
  },
  {
    title: "粘贴到解析框",
    desc: "回到本页把链接粘贴进输入框，可一次粘贴多个，每行一个。",
  },
  {
    title: "一键解析下载",
    desc: "点击「开始解析」，自动识别平台并去水印，结果可直接在线预览与下载。",
  },
];

const FAQS = [
  {
    q: "支持哪些平台？",
    a: `目前已支持 ${PLATFORM_NAMES.join("、")} 等 ${PLATFORM_NAMES.length}+ 个国内外平台，并持续增加中。`,
  },
  {
    q: "解析出来的视频 / 图片带水印吗？",
    a: "本工具会自动提取去水印后的原画地址，多数平台可得到无水印资源；个别平台受接口限制可能仍为原画，请以解析结果为准。",
  },
  {
    q: "需要登录或安装软件吗？",
    a: `无需安装任何软件。首次使用需关注公众号「${siteConfig.name}」并发送验证码完成验证（免费），验证通过后即可正常解析下载。`,
  },
  {
    q: "粘贴链接后提示解析失败怎么办？",
    a: "请确认链接是从 App「分享」复制的完整链接；部分内容因作者设置权限或已删除会无法解析，可切换具体平台后重试。",
  },
  {
    q: "可以同时解析多个链接吗？",
    a: "可以。在输入框中每行粘贴一个链接，系统会依次解析并逐条展示结果。",
  },
];

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
  const [pickedPlatform, setPickedPlatform] = useState<VideoPlatformKey | "auto" | null>(null);
  const [pickNonce, setPickNonce] = useState(0);
  const [activePlatform, setActivePlatform] = useState<VideoPlatformKey | "auto">("auto");

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
      <div className="relative" style={{ zIndex: 1 }}>
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
            {/* 卖点清单 */}
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
              <span className="rounded-full bg-glass-2 px-3 py-1 text-secondary">✓ 免费</span>
              <span className="rounded-full bg-glass-2 px-3 py-1 text-secondary">✓ 免安装</span>
              <span className="rounded-full bg-glass-2 px-3 py-1 text-secondary">✓ 无水印</span>
              <span className="rounded-full bg-glass-2 px-3 py-1 text-secondary">✓ 多平台</span>
            </div>
          </header>

          {/* 平台选择器：等宽网格，点击即选中并解析；「自动识别」为默认（平台项 href 保留供 SEO 收录） */}
          <nav
            className="grid grid-cols-3 gap-2 mb-8 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7"
            aria-label="选择平台进行解析">
            {/* 自动识别 */}
            <button
              type="button"
              onClick={() => {
                setPickedPlatform("auto");
                setPickNonce((n) => n + 1);
              }}
              aria-pressed={activePlatform === "auto"}
              title="自动识别平台并解析"
              className={`flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs transition ${
                activePlatform === "auto"
                  ? "border-accent/60 bg-accent/10 font-medium text-foreground"
                  : "border-glass-2 bg-glass-2 text-secondary hover:-translate-y-0.5 hover:bg-glass-3 hover:text-foreground"
              }`}>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="truncate">自动识别</span>
            </button>

            {Object.entries(VIDEO_PLATFORMS).map(([key, p]) => {
              const k = key as VideoPlatformKey;
              const active = activePlatform === k;
              // 网格内用短名，避免超长名换行/截断（X (Twitter) → X）
              const label = p.name.replace(" (Twitter)", "");
              return (
                <a
                  key={key}
                  href={`/platform/${key}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setPickedPlatform(k);
                    setPickNonce((n) => n + 1);
                  }}
                  title={`解析${p.name}`}
                  aria-pressed={active}
                  className={`flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs transition ${
                    active
                      ? "border-accent/60 bg-accent/10 font-medium text-foreground"
                      : "border-glass-2 bg-glass-2 text-secondary hover:-translate-y-0.5 hover:bg-glass-3 hover:text-foreground"
                  }`}>
                  <PlatformIcon platform={k} size={16} />
                  <span className="truncate">{label}</span>
                </a>
              );
            })}
          </nav>

          {/* Body: Form/Results（公众号浮窗挪到 body 末尾做 fixed，不挤压主结构） */}
          <div className="max-w-3xl mx-auto">
            <div className={`reveal reveal-delay-2 ${mounted ? "opacity-100" : "opacity-0"}`}>
              <VideoParserForm
                onResult={handleParseResult}
                setLoading={setLoading}
                loading={loading}
                pickedPlatform={pickedPlatform}
                pickNonce={pickNonce}
                onPlatformChange={setActivePlatform}
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

          {/* 三步使用教程 */}
          <section className="glass-card iridescent-border p-4 sm:p-6 mt-8">
            <h2 className="text-lg font-bold text-foreground">三步解析下载</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <div
                  key={s.title}
                  className="flex items-start gap-3 rounded-xl border border-border-subtle bg-glass-2 p-4">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-primary">{s.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-secondary">
                      {s.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 常见问题（可见，与 JSON-LD 呼应） */}
          <section className="glass-card iridescent-border p-4 sm:p-6 mt-6">
            <h2 className="text-lg font-bold text-foreground">常见问题</h2>
            <div className="mt-4 space-y-2">
              {FAQS.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-xl border border-border-subtle bg-glass-2 px-4 py-3"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-primary">
                    {f.q}
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 shrink-0 text-secondary transition group-open:rotate-45"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                  </summary>
                  <p className="mt-2 text-xs leading-relaxed text-secondary">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
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
