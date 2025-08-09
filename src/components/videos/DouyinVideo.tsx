"use client";
import React from "react";
import Image from "next/image";
import { ApiResponse, DouyinData } from "@/types/api";

interface DouyinVideoProps {
  data: ApiResponse;
}

export default function DouyinVideo({ data }: DouyinVideoProps) {
  if (!data.data) {
    return null;
  }

  const douyinData = data.data as DouyinData;

  return (
    <>
      {douyinData.url && (
        <a
          href={douyinData.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block relative w-full aspect-video bg-black rounded-lg mb-4 overflow-hidden group cursor-pointer"
          style={{ maxWidth: 800 }}>
          <Image
            src={douyinData.cover}
            alt={douyinData.title || "视频封面"}
            fill
            sizes="(max-width: 800px) 100vw, 800px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            priority
            unoptimized
          />
          <div className="absolute inset-0 flex items-center justify-center group-hover:bg-opacity-10 transition-all">
            <svg
              className="w-20 h-20 text-white opacity-70 group-hover:opacity-90 transition-opacity drop-shadow-lg"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                clipRule="evenodd"></path>
            </svg>
          </div>
        </a>
      )}
      {douyinData.url && (
        <div className="mt-2">
          <a
            href={`/api/proxy?url=${encodeURIComponent(
              douyinData.url
            )}&filename=${encodeURIComponent(douyinData.title || "douyin")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            下载视频
          </a>
        </div>
      )}
    </>
  );
}
