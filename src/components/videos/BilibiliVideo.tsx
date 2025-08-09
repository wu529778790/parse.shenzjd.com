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
      {data.imgurl &&
        data.data &&
        Array.isArray(data.data) &&
        data.data.length > 0 && (
          <a
            href={(data.data as VideoItem[])[0].video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative inline-block group cursor-pointer">
            <Image
              src={data.imgurl}
              alt={data.title || ""}
              width={640}
              height={360}
              className="rounded-lg mb-6 transition-transform duration-300 group-hover:scale-105"
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
      {data.data && Array.isArray(data.data) && data.data.length > 0 && (
        <div className="space-y-4">
          {(data.data as VideoItem[]).map((item, index) => (
            <div
              key={index}
              className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <a
                href={`/api/proxy?url=${encodeURIComponent(
                  item.video_url
                )}&filename=${encodeURIComponent(
                  (data.title || "bilibili") + `-${index + 1}`
                )}`}
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
