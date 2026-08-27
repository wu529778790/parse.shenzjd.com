"use client";
import React, { useState } from "react";
import Image from "next/image";
import { ApiResponse, ParseData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";
import { downloadAllImages } from "@/utils/downloadImages";

interface WeiboVideoProps {
  data: ApiResponse;
}

export default function WeiboVideo({ data }: WeiboVideoProps) {
  const [downloading, setDownloading] = useState(false);

  if (!data.data) {
    return null;
  }

  const weiboData = data.data as ParseData;
  const images = weiboData.images?.filter(Boolean) || [];
  const isImage = weiboData.type === "image" || (!weiboData.url && images.length > 0);
  const isText = weiboData.type === "text" || (!weiboData.url && images.length === 0);

  const handleDownloadAll = async () => {
    if (downloading || images.length === 0) return;
    setDownloading(true);
    try {
      await downloadAllImages(images, `weibo-${weiboData.author || "图片"}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5" style={{ touchAction: 'pan-y' }}>
      {/* Author Header */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          {weiboData.avatar && (
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#e6162d] to-[#ff4d6a] blur-sm opacity-50" />
              <Image
                src={weiboData.avatar}
                alt={weiboData.author || ""}
                width={56}
                height={56}
                className="relative rounded-full border-2 border-glass-3"
                unoptimized
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {weiboData.title && (
              <h2 className="text-lg font-semibold text-primary line-clamp-2 mb-1">
                {weiboData.title}
              </h2>
            )}
            {weiboData.author && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-secondary">@</span>
                <span className="text-sm font-medium text-accent">{weiboData.author}</span>
              </div>
            )}
            {weiboData.time && (
              <p className="text-xs text-muted mt-1">{weiboData.time}</p>
            )}
          </div>

          {/* Weibo Logo */}
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e6162d] to-[#ff4d6a] flex items-center justify-center">
              <span className="text-white text-xs font-bold">微博</span>
            </div>
          </div>
        </div>
      </div>

      {/* 视频：封面 + 播放/下载（直链新窗口） */}
      {weiboData.url && !isImage && (
        <VideoPosterCard
          url={weiboData.url}
          cover={weiboData.cover}
          alt={weiboData.title || "视频封面"}
          accent="red"
        />
      )}

      {/* 图片/图集：按原图比例展示，点击打开原图直链（可长按/右键保存） */}
      {isImage && images.length > 0 && (
        <div className="space-y-3">
          {images.length === 1 ? (
            <a
              href={images[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl overflow-hidden border border-border-subtle bg-black">
              <Image
                src={images[0]}
                alt={weiboData.title || "微博图片"}
                width={800}
                height={800}
                className="w-full h-auto object-contain max-h-[70vh]"
                unoptimized
              />
            </a>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {images.map((src, i) => (
                <a
                  key={`${src}-${i}`}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-square rounded-lg overflow-hidden border border-border-subtle bg-black group">
                  <Image
                    src={src}
                    alt={`${weiboData.title || "微博图片"}-${i + 1}`}
                    fill
                    className="object-contain p-1 transition-transform duration-300 group-hover:scale-105"
                    unoptimized
                  />
                </a>
              ))}
            </div>
          )}

          {/* 一键下载全部图片 */}
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloading}
            className="group inline-flex w-full items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#e6162d] to-[#ff4d6a] hover:from-[#c91227] hover:to-[#e6162d] text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-[#e6162d]/25 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed">
            {downloading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                正在下载...
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
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

      {/* 纯文字微博：无媒体可下载，展示提示而非报错 */}
      {isText && (
        <div className="glass-card p-6 text-center">
          <p className="text-sm text-muted leading-relaxed">
            该微博仅包含文字内容，无可下载的视频或图片
          </p>
        </div>
      )}
    </div>
  );
}
