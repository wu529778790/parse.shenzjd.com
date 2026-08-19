"use client";
import React, { useState } from "react";
import Image from "next/image";
import { ApiResponse, XhsData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";

interface XhsVideoProps {
  data: ApiResponse;
}

export default function XhsVideo({ data }: XhsVideoProps) {
  const [imageLoading, setImageLoading] = useState(true);

  if (!data.data) {
    return null;
  }

  const xhsData = data.data as XhsData;

  const isImageType = xhsData.type === "image";

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
                alt={xhsData.author}
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

      {/* Video：封面 + 播放/下载（直链新窗口） */}
      {!isImageType && xhsData.url && (
        <VideoPosterCard
          url={xhsData.url}
          cover={xhsData.cover}
          alt={xhsData.title || "视频封面"}
          accent="pink"
          tall
        />
      )}

      {/* Image Gallery */}
      {isImageType && xhsData.images && xhsData.images.length > 0 && (
        <div className="glass-card p-3">
          {xhsData.images.length === 1 ? (
            <div className="relative aspect-square rounded-xl overflow-hidden">
              {imageLoading && (
                <div className="absolute inset-0 bg-glass-2 animate-pulse" />
              )}
              <Image
                src={xhsData.images[0]}
                alt={xhsData.title || "图片"}
                fill
                sizes="(max-width: 800px) 100vw, 800px"
                className="object-cover transition-transform duration-500 hover:scale-105"
                priority
                unoptimized
                onLoad={() => setImageLoading(false)}
              />
            </div>
          ) : (
            <div
              className={`grid gap-2 ${
                xhsData.images.length === 2
                  ? "grid-cols-2"
                  : xhsData.images.length === 3
                  ? "grid-cols-3"
                  : xhsData.images.length === 4
                  ? "grid-cols-2"
                  : "grid-cols-3"
              }`}>
              {xhsData.images.map((imageUrl, index) => (
                <div
                  key={index}
                  className={`relative aspect-square rounded-xl overflow-hidden group ${
                    xhsData.images!.length === 4 && index >= 2
                      ? "col-span-1"
                      : ""
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
