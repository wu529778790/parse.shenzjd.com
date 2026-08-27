"use client";
import React from "react";
import Image from "next/image";
import { ApiResponse, ParseData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";

interface GenericParsedVideoProps {
  data: ApiResponse;
}

export default function GenericParsedVideo({ data }: GenericParsedVideoProps) {
  if (!data.data) {
    return null;
  }

  const d = data.data as ParseData;
  // 视频/图片一律直链 + 窗口展示（不再直接 <video> 播放、不再走 /api/proxy）
  // type=image 时 url 指向图片直链，不能再按视频卡片渲染（避免封面比例错位 + 伪播放按钮）
  const images = d.images?.filter(Boolean) || [];
  const isImage = d.type === "image" || (!d.url && images.length > 0);
  const isText = d.type === "text" || (!d.url && images.length === 0);
  const videoUrl = isImage || isText ? "" : d.url || "";

  return (
    <div className="space-y-5" style={{ touchAction: "pan-y" }}>
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          {d.avatar && (
            <Image
              src={d.avatar}
              alt={d.author || ""}
              width={56}
              height={56}
              className="rounded-full border-2 border-glass-3"
              unoptimized
            />
          )}
          <div className="flex-1 min-w-0">
            {d.title && (
              <h2 className="text-lg font-semibold text-primary line-clamp-3 mb-1">
                {d.title}
              </h2>
            )}
            {d.author && (
              <p className="text-sm text-muted">{d.author}</p>
            )}
          </div>
        </div>
      </div>

      {videoUrl && (
        <VideoPosterCard
          url={videoUrl}
          cover={d.cover}
          alt={d.title || "视频封面"}
          accent="neutral"
          tall
          audioUrl={d.audioUrl}
        />
      )}

      {/* 图片/图集：不重复渲染 cover（cover 已是 images[0]），避免第一张图显示两次 */}
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
                alt=""
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
                    alt=""
                    fill
                    className="object-contain p-1 transition-transform duration-300 group-hover:scale-105"
                    unoptimized
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 纯文字内容（无媒体）：展示提示而非空白 */}
      {isText && (
        <div className="glass-card p-6 text-center">
          <p className="text-sm text-muted leading-relaxed">
            该内容仅包含文字，无可下载的视频或图片
          </p>
        </div>
      )}
    </div>
  );
}
