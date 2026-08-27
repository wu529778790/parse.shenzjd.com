"use client";
import React, { useState } from "react";
import Image from "next/image";
import { ApiResponse, ParseData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";
import { downloadAllImages } from "@/utils/downloadImages";

interface XhsVideoProps {
  data: ApiResponse;
}

export default function XhsVideo({ data }: XhsVideoProps) {
  const [imageLoading, setImageLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  if (!data.data) {
    return null;
  }

  const xhsData = data.data as ParseData;

  const isImageType = xhsData.type === "image";
  const images = xhsData.images?.filter(Boolean) || [];

  const handleDownloadAll = async () => {
    if (downloading || images.length === 0) return;
    setDownloading(true);
    try {
      await downloadAllImages(images, `xhs-${xhsData.author || "笔记"}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5" style={{ touchAction: 'pan-y' }}>
      {/* Author Header */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          {xhsData.avatar && (
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#ff2442] to-[#ff5c7c] blur-sm opacity-50" />
              <Image
                src={xhsData.avatar}
                alt={xhsData.author || ""}
                width={56}
                height={56}
                className="relative rounded-full border-2 border-glass-3"
                unoptimized
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {xhsData.title && (
              <h2 className="text-lg font-semibold text-primary line-clamp-2 mb-1">
                {xhsData.title}
              </h2>
            )}
            {xhsData.author && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-secondary">作者</span>
                <span className="text-sm font-medium text-accent">{xhsData.author}</span>
              </div>
            )}
          </div>

          {/* XHS Logo */}
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff2442] to-[#ff5c7c] flex items-center justify-center">
              <span className="text-white text-xs font-bold">小红书</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {xhsData.desc && (
        <div className="glass-card p-4">
          <p className="text-sm text-muted leading-relaxed">{xhsData.desc}</p>
        </div>
      )}

      {/* Video：封面 + 播放/下载（小红书已走代理，内嵌当前页面播放/下载，体验更好） */}
      {!isImageType && xhsData.url && (
        <VideoPosterCard
          url={xhsData.url}
          cover={xhsData.cover}
          alt={xhsData.title || "视频封面"}
          accent="pink"
          tall
          inline
        />
      )}

      {/* Image Gallery：单图大图展示，多图网格（2/3/4 张自适应列数），点击打开原图 */}
      {isImageType && images.length > 0 && (
        <div className="glass-card p-3">
          {images.length === 1 ? (
            <a
              href={images[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="relative block aspect-square rounded-xl overflow-hidden bg-black">
              {imageLoading && (
                <div className="absolute inset-0 bg-glass-2 animate-pulse" />
              )}
              <Image
                src={images[0]}
                alt={xhsData.title || "图片"}
                fill
                sizes="(max-width: 800px) 100vw, 800px"
                className="object-cover transition-transform duration-500 hover:scale-105"
                priority
                unoptimized
                onLoad={() => setImageLoading(false)}
              />
            </a>
          ) : (
            <div
              className={`grid gap-2 ${
                images.length === 2
                  ? "grid-cols-2"
                  : images.length === 3
                  ? "grid-cols-3"
                  : images.length === 4
                  ? "grid-cols-2"
                  : "grid-cols-3"
              }`}>
              {images.map((imageUrl, index) => (
                <a
                  key={index}
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`relative aspect-square rounded-xl overflow-hidden group block bg-black ${
                    images.length === 4 && index >= 2 ? "col-span-1" : ""
                  }`}>
                  <Image
                    src={imageUrl}
                    alt={`${xhsData.title || "图片"} ${index + 1}`}
                    fill
                    sizes="(max-width: 800px) 50vw, 400px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
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
            className="mt-3 inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-xl bg-gradient-to-r from-[#ff2442] to-[#ff5c7c] hover:from-[#e61f3a] hover:to-[#ff4d6a] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
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
    </div>
  );
}
