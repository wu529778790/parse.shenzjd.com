"use client";
import React from "react";
import Image from "next/image";
import { ApiResponse, WeiboData } from "@/types/api";

interface WeiboVideoProps {
  data: ApiResponse;
}

export default function WeiboVideo({ data }: WeiboVideoProps) {
  if (!data.data) {
    return null;
  }

  const weiboData = data.data as WeiboData;

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        {weiboData.avatar && (
          <Image
            src={weiboData.avatar}
            alt={weiboData.author}
            width={48}
            height={48}
            className="rounded-full"
            unoptimized
          />
        )}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {weiboData.title}
          </h2>
          {weiboData.author && (
            <p className="text-gray-600 dark:text-gray-300 text-left">
              {weiboData.author}
            </p>
          )}
          {weiboData.time && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-left">
              {weiboData.time}
            </p>
          )}
        </div>
      </div>
      {weiboData.url && (
        <a
          href={`/api/proxy?url=${encodeURIComponent(
            weiboData.url
          )}&filename=${encodeURIComponent(weiboData.title || "weibo")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block relative w-full aspect-video bg-black rounded-lg mb-4 overflow-hidden group cursor-pointer"
          style={{ maxWidth: 800 }}>
          <Image
            src={weiboData.cover}
            alt={weiboData.title || "视频封面"}
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
    </>
  );
}
