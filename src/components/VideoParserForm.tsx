"use client";
import { useState } from "react";
import { ApiResponse } from "@/types/api";

interface VideoParserFormProps {
  onResult: (data: ApiResponse | null, errorMsg: string) => void;
  setLoading: (loading: boolean) => void;
  loading: boolean;
}

// 提取URL的函数
function extractUrl(text: string): string | null {
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

export default function VideoParserForm({
  onResult,
  setLoading,
  loading,
}: VideoParserFormProps) {
  const [input, setInput] = useState("");
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<
    "bilibili" | "douyin" | "kuaishou" | "weibo" | "xhs"
  >("bilibili");

  // 自动解析函数
  const autoParseVideo = async (url: string, platform: string) => {
    if (loading) return; // 如果正在加载中，不重复解析

    setLoading(true);
    onResult(null, "");

    try {
      const response = await fetch(
        `/api/${platform}?url=${encodeURIComponent(url)}`
      );
      const data: ApiResponse = await response.json();
      if (data.code === 1 || data.code === 200) {
        data.platform = platform as
          | "bilibili"
          | "douyin"
          | "kuaishou"
          | "weibo"
          | "xhs";
        onResult(data, "");
      } else {
        onResult(null, data.msg || "解析失败");
      }
    } catch {
      onResult(null, "请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

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

      // 如果检测到抖音链接，自动开始解析
      if (text.includes("douyin.com")) {
        // 使用 setTimeout 确保状态更新完成后再执行
        setTimeout(() => {
          autoParseVideo(extractedUrl, "douyin");
        }, 100);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) {
      onResult(null, "请粘贴包含视频链接的文本");
      return;
    }

    setLoading(true);
    onResult(null, "");

    try {
      const response = await fetch(
        `/api/${platform}?url=${encodeURIComponent(url)}`
      );
      const data: ApiResponse = await response.json();
      if (data.code === 1 || data.code === 200) {
        data.platform = platform;
        onResult(data, "");
      } else {
        onResult(null, data.msg || "解析失败");
      }
    } catch {
      onResult(null, "请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
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
  );
}
