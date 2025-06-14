"use client";
import Image from "next/image";
import { ApiResponse, VideoItem } from "@/types/api";

interface BilibiliVideoProps {
  data: ApiResponse;
}

export default function BilibiliVideo({ data }: BilibiliVideoProps) {
  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        {data.user?.user_img && (
          <Image
            src={data.user.user_img}
            alt={data.user.name}
            width={48}
            height={48}
            className="rounded-full"
          />
        )}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {data.title}
          </h2>
          {data.user?.name && (
            <p className="text-gray-600 dark:text-gray-300 text-left">
              {data.user.name}
            </p>
          )}
        </div>
      </div>
      {data.imgurl && (
        <Image
          src={data.imgurl}
          alt={data.title || ""}
          width={640}
          height={360}
          className="rounded-lg mb-6"
        />
      )}
      {data.data && Array.isArray(data.data) && data.data.length > 0 && (
        <div className="space-y-4">
          {(data.data as VideoItem[]).map((item, index) => (
            <div
              key={index}
              className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <a
                href={item.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                下载视频
              </a>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
