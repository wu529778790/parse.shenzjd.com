"use client";
import React, { useState } from "react";
import Image from "next/image";
import { ApiResponse, ParseData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";
import { downloadAllImages } from "@/utils/downloadImages";
import { useDouyinVideoUrl } from "@/hooks/useDouyinVideoUrl";

interface DouyinVideoProps {
  data: ApiResponse;
}

export default function DouyinVideo({ data }: DouyinVideoProps) {
  const [downloading, setDownloading] = useState(false);

  if (!data.data) {
    return null;
  }

  const douyinData = data.data as ParseData;
  const isImageType = douyinData.type === "image";
  const images = douyinData.images?.filter(Boolean) || [];

  // 合集（mix）：data.videos 存在时展示可点击的合集列表
  const mixVideos = douyinData.videos || [];
  const isMix = mixVideos.length > 0;
  if (isMix) {
    return <DouyinMixList data={data} videos={mixVideos} />;
  }

  const handleDownloadAll = async () => {
    if (downloading || images.length === 0) return;
    setDownloading(true);
    try {
      await downloadAllImages(images, `douyin-${douyinData.author || "图集"}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5" style={{ touchAction: 'pan-y' }}>
      {/* 视频：封面 + 中心播放图标（点击新页签打开）+ 下方下载按钮 + 音频下载 */}
      {!isImageType && douyinData.url && (
        <VideoPosterCard
          url={douyinData.url}
          cover={douyinData.cover}
          alt={douyinData.title || "视频封面"}
          accent="orange"
          tall
          showPlay={false}
          downloadText="下载视频"
          audioUrl={douyinData.audioUrl}
        />
      )}

      {/* Image Gallery：单图全宽展示，多图网格（手机 2 列 / 桌面 3 列），点击打开原图 */}
      {isImageType && images.length > 0 && (
        <div className="glass-card p-3">
          {images.length === 1 ? (
            <a
              href={images[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl overflow-hidden bg-black">
              <Image
                src={images[0]}
                alt={douyinData.title || "图片"}
                width={864}
                height={1920}
                className="w-full h-auto rounded-xl"
                priority
                unoptimized
              />
            </a>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {images.map((imageUrl, index) => (
                <a
                  key={index}
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-[3/4] rounded-xl overflow-hidden group block bg-black">
                  <Image
                    src={imageUrl}
                    alt={`${douyinData.title || "图片"} ${index + 1}`}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </a>
              ))}
            </div>
          )}

          {/* 一键下载全部图片 */}
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloading}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-xl bg-gradient-to-r from-[#ff6600] to-[#ff9933] hover:from-[#e65c00] hover:to-[#ff8800] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
            {downloading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                正在下载...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                一键下载全部图片（{images.length} 张）
              </>
            )}
          </button>
        </div>
      )}

      {/* Image type hint */}
      {isImageType && (
        <div className="glass-card p-3 flex items-center gap-2 text-xs text-muted">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>当前显示为静态图，动图/实况图的动画效果暂不支持</span>
        </div>
      )}

      {/* Video Info */}
      {douyinData.title && (
        <div className="glass-card p-4">
          <p className="text-sm text-muted line-clamp-2">{douyinData.title}</p>
        </div>
      )}
    </div>
  );
}

/** 抖音合集（mix）列表展示 —— 复用 B 站多分P 交互，每个视频可点击下载 */
function DouyinMixList({
  data,
  videos,
}: {
  data: ApiResponse;
  videos: NonNullable<ParseData["videos"]>;
}) {
  const parsed = data.data as ParseData;
  const primaryVideoUrl = videos[0]?.url || "";
  const posterUrl = parsed?.cover || videos[0]?.cover || undefined;

  return (
    <div className="space-y-5" style={{ touchAction: "pan-y" }}>
      {/* 合集信息卡片 */}
      {(parsed?.avatar || parsed?.title) && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-4">
            {parsed?.avatar && (
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#ff6600] to-[#ff9933] blur-sm opacity-50" />
                <Image
                  src={parsed.avatar}
                  alt={parsed.author || ""}
                  width={56}
                  height={56}
                  className="relative rounded-full border-2 border-glass-3"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {parsed?.title && (
                <h2 className="text-lg font-semibold text-primary line-clamp-2 mb-1">
                  {parsed.title}
                </h2>
              )}
              {parsed?.author && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-secondary">作者</span>
                  <span className="text-sm font-medium text-accent">
                    {parsed.author}
                  </span>
                </div>
              )}
              {parsed?.totalEpisodes ? (
                <p className="text-xs text-muted mt-1">
                  合集 · 共 {parsed.totalEpisodes} 集
                </p>
              ) : (
                <p className="text-xs text-muted mt-1">合集 · 共 {videos.length} 集</p>
              )}
            </div>

            {/* 抖音 Logo */}
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff6600] to-[#ff9933] flex items-center justify-center">
                <span className="text-white font-bold text-sm">抖</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 第一个视频：封面 + 播放 */}
      {primaryVideoUrl && (
        <VideoPosterCard
          url={primaryVideoUrl}
          cover={posterUrl}
          alt={videos[0]?.title || "视频封面"}
          accent="orange"
          tall
          showDownload={false}
        />
      )}

      {/* 合集视频列表：每个视频可点击下载 */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
          <svg
            className="w-4 h-4 text-accent"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          合集视频 ({videos.length})
        </h3>

        <div className="space-y-3">
          {videos.map((item, index) => (
            <div
              key={item.awemeId || index}
              className="flex items-center justify-between p-4 rounded-xl bg-glass-2 hover:bg-glass-3 transition-colors duration-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-accent">
                    {index + 1}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary line-clamp-2">
                    {item.title || `视频 ${index + 1}`}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.durationFormat && (
                      <span className="text-xs text-muted">
                        {item.durationFormat}
                      </span>
                    )}
                    {item.like ? (
                      <span className="text-xs text-muted">
                        {item.like >= 10000
                          ? `${(item.like / 10000).toFixed(1)}w`
                          : item.like}{" "}
                        赞
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <MixVideoDownloadButton url={item.url} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 合集单个视频的下载按钮：检测 ftyp 混淆，混淆时回退代理下载 */
function MixVideoDownloadButton({ url }: { url: string }) {
  const { url: resolvedUrl, checking } = useDouyinVideoUrl(url);
  return (
    <a
      href={checking ? undefined : resolvedUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={checking}
      className={`inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#ff6600] to-[#ff9933] hover:from-[#e65c00] hover:to-[#ff8800] text-white rounded-lg text-sm font-medium transition-all duration-300 hover:shadow-lg hover:shadow-[#ff6600]/25 hover:-translate-y-0.5 flex-shrink-0 ${
        checking ? "opacity-60 pointer-events-none" : ""
      }`}>
      {checking ? (
        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      )}
      {checking ? "检测中…" : "下载"}
    </a>
  );
}