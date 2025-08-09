"use client";
import React from "react";
import Image from "next/image";
import { ApiResponse, XhsData } from "@/types/api";

interface XhsVideoProps {
  data: ApiResponse;
}

export default function XhsVideo({ data }: XhsVideoProps) {
  if (!data.data) {
    return null;
  }

  const xhsData = data.data as XhsData;

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        {xhsData.avatar && (
          <Image
            src={xhsData.avatar}
            alt={xhsData.author}
            width={48}
            height={48}
            className="rounded-full"
            unoptimized
          />
        )}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {xhsData.title}
          </h2>
          {xhsData.author && (
            <p className="text-gray-600 dark:text-gray-300 text-left">
              {xhsData.author}
            </p>
          )}
        </div>
      </div>

      {xhsData.desc && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <p className="text-gray-700 dark:text-gray-300 text-sm">
            {xhsData.desc}
          </p>
        </div>
      )}

      {/* 视频内容 */}
      {xhsData.url && xhsData.type !== "image" && (
        <a
          href={`/api/proxy?url=${encodeURIComponent(
            xhsData.url
          )}&filename=${encodeURIComponent(xhsData.title || "xhs")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block relative w-full aspect-video bg-black rounded-lg mb-4 overflow-hidden group cursor-pointer"
          style={{ maxWidth: 800 }}>
          <Image
            src={xhsData.cover}
            alt={xhsData.title || "视频封面"}
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

      {/* 图片内容 */}
      {xhsData.type === "image" && xhsData.images && (
        <div className="grid gap-4" style={{ maxWidth: 800 }}>
          {xhsData.images.length === 1 ? (
            <div className="relative w-full aspect-square rounded-lg overflow-hidden">
              <Image
                src={xhsData.images[0]}
                alt={xhsData.title || "图片"}
                fill
                sizes="(max-width: 800px) 100vw, 800px"
                className="object-cover"
                priority
                unoptimized
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
                  className={`relative aspect-square rounded-lg overflow-hidden ${
                    xhsData.images!.length === 4 && index >= 2
                      ? "col-span-1"
                      : ""
                  }`}>
                  <Image
                    src={imageUrl}
                    alt={`${xhsData.title || "图片"} ${index + 1}`}
                    fill
                    sizes="(max-width: 800px) 50vw, 400px"
                    className="object-cover hover:scale-105 transition-transform duration-300"
                    unoptimized
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
