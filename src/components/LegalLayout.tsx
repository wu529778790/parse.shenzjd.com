import { ReactNode } from "react";

// 法律页面共享布局：与首页视觉风格一致（morphing-bg + glass-card）
// 排版样式通过 Tailwind 任意变体集中定义，无需改 globals.css
const proseClass = [
  "leading-relaxed text-sm text-secondary",
  "[&_h2]:text-base sm:[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-primary [&_h2]:mt-8 [&_h2]:mb-3",
  "[&_h3]:text-sm sm:[&_h3]:text-base [&_h3]:font-medium [&_h3]:text-primary [&_h3]:mt-6 [&_h3]:mb-2",
  "[&_p]:my-3",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5",
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5",
  "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-dotted",
  "[&_strong]:text-primary [&_strong]:font-medium",
  "[&_hr]:my-6 [&_hr]:border-border-subtle",
].join(" ");

export default function LegalLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  // 动态最近更新日期（构建/请求时），始终为当前年月
  const lastUpdated = `${new Date().getFullYear()}年${
    new Date().getMonth() + 1
  }月`;

  return (
    <>
      {/* Morphing Background（与首页一致） */}
      <div className="morphing-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div className="relative" style={{ zIndex: 1 }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 glow-text">
              <span className="gradient-text">{title}</span>
            </h1>
            {subtitle && (
              <p className="text-sm text-muted max-w-md">{subtitle}</p>
            )}
            <p className="text-xs text-muted/50 mt-3">
              最近更新：{lastUpdated}
            </p>
          </header>

          {/* Content */}
          <article
            className={`glass-card iridescent-border p-6 sm:p-10 ${proseClass}`}>
            {children}
          </article>
        </div>
      </div>
    </>
  );
}
