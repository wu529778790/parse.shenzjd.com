import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VIDEO_PLATFORMS } from "@/config/video-platforms";
import { getPlatformSeo } from "@/config/seo-platforms";
import { siteConfig } from "@/config/site";

// 静态生成全部平台页
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(VIDEO_PLATFORMS).map((key) => ({ key }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const platform = VIDEO_PLATFORMS[key as keyof typeof VIDEO_PLATFORMS];
  const seo = getPlatformSeo(key);
  if (!platform || !seo) return {};

  return {
    title: seo.title,
    description: seo.description,
    keywords: [
      `${platform.name}解析`,
      `${platform.name}视频解析`,
      `${platform.name}去水印`,
      `${platform.name}视频下载`,
      `${platform.name}无水印下载`,
    ],
    alternates: {
      canonical: `${siteConfig.url}/platform/${key}`,
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: `${siteConfig.url}/platform/${key}`,
      siteName: siteConfig.name,
      type: "website",
      locale: "zh_CN",
    },
  };
}

const steps = [
  "复制视频分享链接或完整分享文案（短链、视频页链接均可）",
  "打开神族九帝，把链接粘贴到输入框",
  "点击解析，即可预览并下载无水印视频",
];

export default async function PlatformPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const platform = VIDEO_PLATFORMS[key as keyof typeof VIDEO_PLATFORMS];
  const seo = getPlatformSeo(key);
  if (!platform || !seo) notFound();

  const otherPlatforms = Object.entries(VIDEO_PLATFORMS).filter(
    ([k]) => k !== key
  );

  return (
    <>
      <div className="morphing-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div className="relative" style={{ zIndex: 1 }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          {/* Breadcrumb */}
          <nav className="text-xs text-muted/70 mb-6" aria-label="面包屑">
            <Link href="/" className="hover:text-accent transition-colors">
              首页
            </Link>
            <span className="mx-2 text-muted/40">/</span>
            <span>{platform.name}视频解析</span>
          </nav>

          {/* Header */}
          <header className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 glow-text">
              <span className="gradient-text">{seo.title}</span>
            </h1>
            <p className="text-sm text-muted max-w-xl leading-relaxed">
              {seo.description}
            </p>
          </header>

          {/* CTA */}
          <div className="glass-card iridescent-border p-6 mb-8">
            <p className="text-sm text-primary font-medium mb-3">
              👇 粘贴链接，立即免费解析
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-[#7f77dd] to-[#d4537e] text-white text-sm font-medium hover:opacity-90 transition-opacity">
              去首页解析 {platform.name}视频
            </Link>
          </div>

          {/* Content */}
          <article className="glass-card iridescent-border p-6 sm:p-8 space-y-8">
            {/* Intro */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-primary mb-3">
                {platform.name}视频怎么去水印
              </h2>
              <p className="leading-relaxed text-sm text-secondary">{seo.intro}</p>
            </section>

            {/* Scenes */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-primary mb-3">
                常见使用场景
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-secondary">
                {seo.scenes.map((scene) => (
                  <li key={scene}>{scene}</li>
                ))}
              </ul>
            </section>

            {/* Steps */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-primary mb-3">
                使用步骤
              </h2>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-secondary">
                {steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </section>

            {/* FAQ */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-primary mb-3">
                常见问题
              </h2>
              <div className="space-y-4">
                {seo.faqs.map((faq) => (
                  <div key={faq.q}>
                    <h3 className="text-sm font-medium text-primary mb-1">
                      {faq.q}
                    </h3>
                    <p className="text-sm text-secondary leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Other platforms */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-primary mb-3">
                其他平台视频解析
              </h2>
              <div className="flex flex-wrap gap-2">
                {otherPlatforms.map(([k, p]) => (
                  <Link
                    key={k}
                    href={`/platform/${k}`}
                    className="px-3 py-1.5 rounded-lg text-xs bg-glass-2 hover:bg-glass-3 text-secondary hover:text-primary transition-colors">
                    {p.name}解析
                  </Link>
                ))}
              </div>
            </section>
          </article>

          {/* Disclaimer */}
          <p className="text-xs text-muted/50 mt-6 leading-relaxed">
            免责声明：本工具仅用于技术学习与个人素材整理，不存储、不传播任何受版权保护的内容，
            解析结果版权归原平台及原作者所有，请勿用于商业或侵权用途。
          </p>

          {/* FAQ JSON-LD */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: seo.faqs.map((faq) => ({
                  "@type": "Question",
                  name: faq.q,
                  acceptedAnswer: { "@type": "Answer", text: faq.a },
                })),
              }),
            }}
          />
        </div>
      </div>
    </>
  );
}
