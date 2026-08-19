"use client";
import React from "react";
import Image from "next/image";
import { ApiResponse, GenericParsedData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";

interface GenericParsedVideoProps {
  data: ApiResponse;
}

export default function GenericParsedVideo({ data }: GenericParsedVideoProps) {
  if (!data.data) {
    return null;
  }

  const d = data.data as GenericParsedData;
  // 视频/图片一律直链 + 窗口展示（不再直接 <video> 播放、不再走 /api/proxy）
  const videoUrl = d.url || "";
  const images = d.images?.filter(Boolean) || [];

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
        />
      )}

      {!videoUrl && d.cover && (
        <div className="glass-card overflow-hidden">
          <Image
            src={d.cover}
            alt=""
            width={800}
            height={450}
            className="w-full h-auto object-contain max-h-[70vh]"
            unoptimized
          />
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {images.map((src, i) => (
            <a
              key={`${src}-${i}`}
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-square rounded-lg overflow-hidden border border-border-subtle">
              <Image
                src={src}
                alt=""
                fill
                className="object-cover"
                unoptimized
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
