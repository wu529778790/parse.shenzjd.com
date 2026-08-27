import { VIDEO_PLATFORMS, type VideoPlatformKey } from "@/config/video-platforms";

// 各大平台在色块里展示的简短标识（没有则回退到名称首字）— 仅作回退
const MONOGRAM: Partial<Record<VideoPlatformKey, string>> = {
  douyin: "抖",
  bilibili: "B",
  kuaishou: "快",
  weibo: "微",
  xhs: "红",
  qsmusic: "汽",
  pipigx: "皮",
  ppxia: "虾",
  huoshan: "火",
  weishi: "视",
  xigua: "西",
  zuiyou: "右",
  quanmin: "度",
  lishipin: "梨",
  huya: "虎",
  acfun: "A",
  meipai: "美",
  doupai: "逗",
  quanminkge: "K",
  sixroom: "六",
  xinpianchang: "新",
  haokan: "好",
  twitter: "X",
  youtube: "Y",
  tiktok: "T",
  lvzhou: "绿",
};

/**
 * 平台图标，优先级：
 * 1) logo 为真实彩色 PNG（参考站同款）→ 直接展示原图
 * 2) logo 为白标 SVG（simple-icons，注入白填充）→ 铺在品牌色块上
 * 3) 都没有 → 品牌色块 + 文字回退
 */
export default function PlatformIcon({
  platform,
  size = 20,
  className = "",
  rounded = "rounded-lg",
}: {
  platform: VideoPlatformKey;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const cfg = VIDEO_PLATFORMS[platform] as (typeof VIDEO_PLATFORMS)[VideoPlatformKey] & {
    logo?: string;
  };
  if (!cfg) return null;
  const logo = cfg.logo;
  const isPng = !!logo && /\.png$/i.test(logo);
  const isSvg = !!logo && /\.svg$/i.test(logo);

  // 1) 真实彩色 PNG：直接展示原图（透明/彩色背景自适应深色站点）
  if (isPng) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 object-contain ${rounded} ${className}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  // 2) 白标 SVG：铺在品牌色块上（fill=#fff）
  if (isSvg) {
    return (
      <span
        className={`inline-grid shrink-0 place-items-center ${rounded} ${className}`}
        style={{
          width: size,
          height: size,
          background: cfg.color,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.28), 0 1px 2px rgba(15,23,42,.18)",
        }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          width={size}
          height={size}
          className="object-contain"
          style={{ width: size * 0.55, height: size * 0.55 }}
        />
      </span>
    );
  }

  // 3) 回退：品牌色块 + 文字
  const label = MONOGRAM[platform] ?? cfg.name.slice(0, 1);
  return (
    <span
      className={`inline-grid shrink-0 place-items-center font-bold text-white ${rounded} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.46,
        lineHeight: 1,
        background: cfg.color,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,.28), 0 1px 2px rgba(15,23,42,.18)",
      }}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}