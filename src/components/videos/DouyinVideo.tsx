"use client";
import React, { useState } from "react";
import Image from "next/image";
import { ApiResponse, ParseData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";
import { downloadAllImages } from "@/utils/downloadImages";

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