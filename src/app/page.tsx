"use client";
import { useState } from "react";
import Image from "next/image";

interface VideoItem {
  title: string;
  duration: number;
  durationFormat: string;
  accept: string[];
  video_url: string;
}

interface User {
  name: string;
  user_img: string;
}

interface ApiResponse {
  code: number;
  msg: string;
  title?: string;
  imgurl?: string;
  desc?: string;
  data?: VideoItem[];
  user?: User;
}

interface DouyinData {
  author: string;
  avatar: string;
  cover: string;
  like: number;
  music: { author: string; title: string };
  time: number;
  title: string;
  uid: string;
  url: string;
}

// 提取URL的函数
function extractUrl(text: string): string | null {
  // 匹配常见的URL模式
  const urlPatterns = [
    /(https?:\/\/[^\s]+)/, // 基本URL
    /(https?:\/\/[^\s]+)\s*复制此链接/, // 抖音格式
    /(https?:\/\/[^\s]+)\s*打开[^\s]+搜索/, // 通用格式
  ];

  for (const pattern of urlPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [platform, setPlatform] = useState<
    "bilibili" | "douyin" | "kuaishou" | "weibo" | "xhs"
  >("bilibili");

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInput(text);

    // 自动检测平台
    if (text.includes("douyin.com")) {
      setPlatform("douyin");
    } else if (text.includes("kuaishou.com")) {
      setPlatform("kuaishou");
    } else if (text.includes("weibo.com")) {
      setPlatform("weibo");
    } else if (text.includes("xiaohongshu.com")) {
      setPlatform("xhs");
    } else if (text.includes("bilibili.com")) {
      setPlatform("bilibili");
    }

    // 提取URL
    const extractedUrl = extractUrl(text);
    if (extractedUrl) {
      setUrl(extractedUrl);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) {
      setError("请粘贴包含视频链接的文本");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        `/api/${platform}?url=${encodeURIComponent(url)}`
      );
      const data: ApiResponse = await response.json();
      if (data.code === 1) {
        setResult(data);
      } else {
        setError(data.msg || "解析失败");
      }
    } catch {
      setError("请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">
            视频解析工具
          </h1>

          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mb-12">
            <div className="flex flex-col gap-4">
              <textarea
                value={input}
                onChange={handleInputChange}
                placeholder="请粘贴包含视频链接的文本..."
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px]"
              />
              <div className="flex gap-4">
                <select
                  value={platform}
                  onChange={(e) =>
                    setPlatform(
                      e.target.value as
                        | "bilibili"
                        | "douyin"
                        | "kuaishou"
                        | "weibo"
                        | "xhs"
                    )
                  }
                  className="px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="bilibili">哔哩哔哩</option>
                  <option value="douyin">抖音</option>
                  <option value="kuaishou">快手</option>
                  <option value="weibo">微博</option>
                  <option value="xhs">小红书</option>
                </select>
                <button
                  type="submit"
                  disabled={loading || !url}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? "解析中..." : "开始解析"}
                </button>
              </div>
            </div>
          </form>

          {error && (
            <div className="max-w-2xl mx-auto p-4 mb-8 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 rounded-lg">
              {error}
            </div>
          )}

          {result && result.code === 1 && (
            <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
              <div className="p-6">
                {/* 哔哩哔哩渲染 */}
                {platform === "bilibili" && (
                  <>
                    <div className="flex items-center gap-4 mb-6">
                      {result.user?.user_img && (
                        <Image
                          src={result.user.user_img}
                          alt={result.user.name}
                          width={48}
                          height={48}
                          className="rounded-full"
                        />
                      )}
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                          {result.title}
                        </h2>
                        {result.user?.name && (
                          <p className="text-gray-600 dark:text-gray-300">
                            {result.user.name}
                          </p>
                        )}
                      </div>
                    </div>
                    {result.imgurl && (
                      <Image
                        src={result.imgurl}
                        alt={result.title || ""}
                        width={640}
                        height={360}
                        className="rounded-lg mb-6"
                      />
                    )}
                    {result.desc && (
                      <p className="text-gray-600 dark:text-gray-300 mb-6">
                        {result.desc}
                      </p>
                    )}
                    {result.data && result.data.length > 0 && (
                      <div className="space-y-4">
                        {result.data.map((item, index) => (
                          <div
                            key={index}
                            className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                              {item.title}
                            </h3>
                            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                              {item.durationFormat && (
                                <span>时长: {item.durationFormat}</span>
                              )}
                              {item.accept && item.accept.length > 0 && (
                                <span>清晰度: {item.accept.join(", ")}</span>
                              )}
                            </div>
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
                )}
                {/* 抖音渲染 */}
                {platform === "douyin" &&
                  result.data &&
                  (() => {
                    const data = result.data as unknown as DouyinData;
                    return (
                      <>
                        <div className="flex items-center gap-4 mb-6">
                          {data.avatar && (
                            <Image
                              src={data.avatar}
                              alt={data.author}
                              width={48}
                              height={48}
                              className="rounded-full"
                            />
                          )}
                          <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                              {data.title}
                            </h2>
                            {data.author && (
                              <p className="text-gray-600 dark:text-gray-300">
                                {data.author}
                              </p>
                            )}
                          </div>
                        </div>
                        {data.cover && (
                          <Image
                            src={data.cover}
                            alt={data.title || ""}
                            width={640}
                            height={360}
                            className="rounded-lg mb-6"
                          />
                        )}
                        {data.music && (
                          <p className="text-gray-600 dark:text-gray-300 mb-2">
                            配乐：
                            {data.music.author ? `${data.music.author} - ` : ""}
                            {data.music.title || ""}
                          </p>
                        )}
                        <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-300 mb-4">
                          <span>点赞：{data.like}</span>
                          <span>UID：{data.uid}</span>
                        </div>
                        {data.url && (
                          <a
                            href={data.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            打开原视频
                          </a>
                        )}
                      </>
                    );
                  })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
