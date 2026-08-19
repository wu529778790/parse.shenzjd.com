"use client";
import React from "react";
import { ApiResponse, PipigxData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";

interface PipigxVideoProps {
  data: ApiResponse;
}

export default function PipigxVideo({ data }: PipigxVideoProps) {
  if (!data.data) {
    return null;
  }

  const pipigxData = data.data as PipigxData;

  return (
    <>
      {pipigxData.title && (
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {pipigxData.title}
          </h2>
        </div>
      )}
      {pipigxData.video && (
        <VideoPosterCard
          url={pipigxData.video}
          cover={pipigxData.cover}
          alt={pipigxData.title || "视频封面"}
          accent="blue"
        />
      )}
    </>
  );
}
