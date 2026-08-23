"use client";
import React from "react";
import { ApiResponse, ParseData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";

interface PipigxVideoProps {
  data: ApiResponse;
}

export default function PipigxVideo({ data }: PipigxVideoProps) {
  if (!data.data) {
    return null;
  }

  const pipigxData = data.data as ParseData;

  return (
    <>
      {pipigxData.title && (
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {pipigxData.title}
          </h2>
        </div>
      )}
      {pipigxData.url && (
        <VideoPosterCard
          url={pipigxData.url}
          cover={pipigxData.cover}
          alt={pipigxData.title || "视频封面"}
          accent="blue"
        />
      )}
    </>
  );
}
