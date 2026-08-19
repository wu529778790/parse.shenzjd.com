"use client";
import React from "react";
import Image from "next/image";
import { ApiResponse, PpxiaData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";

interface PpxiaVideoProps {
  data: ApiResponse;
}

export default function PpxiaVideo({ data }: PpxiaVideoProps) {
  if (!data.data) {
    return null;
  }

  const ppxiaData = data.data as PpxiaData;

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        {ppxiaData.avatar && (
          <Image
            src={ppxiaData.avatar}
            alt={ppxiaData.author}
            width={48}
            height={48}
            className="rounded-full"
            unoptimized
          />
        )}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {ppxiaData.title}
          </h2>
          {ppxiaData.author && (
            <p className="text-gray-600 dark:text-gray-300 text-left">
              {ppxiaData.author}
            </p>
          )}
        </div>
      </div>
      {ppxiaData.url && (
        <VideoPosterCard
          url={ppxiaData.url}
          cover={ppxiaData.cover}
          alt={ppxiaData.title || "视频封面"}
          accent="blue"
        />
      )}
    </>
  );
}
