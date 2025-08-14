"use client";
import { useState, useEffect, useCallback, useRef } from "react";
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
    "douyin" | "bilibili" | "kuaishou" | "weibo" | "xhs"
  >("douyin");

  // 自动解析函数（稳定引用）
  const autoParseVideo = useCallback(
    async (url: string, platform: string) => {
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
            | "douyin"
            | "bilibili"
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
    },
    [loading, onResult, setLoading]
  );

  // 处理输入内容的函数
  const processInputText = useCallback(
    (text: string) => {
      // 自动检测平台
      if (text.includes("douyin.com")) {
        setPlatform("douyin");
      } else if (text.includes("kuaishou.com")) {
        setPlatform("kuaishou");
      } else if (text.includes("weibo.com")) {
        setPlatform("weibo");
      } else if (
        text.includes("xiaohongshu.com") ||
        text.includes("xhslink.com")
      ) {
        setPlatform("xhs");
      } else if (text.includes("bilibili.com")) {
        setPlatform("bilibili");
      }

      // 提取URL
      const extractedUrl = extractUrl(text);
      if (extractedUrl) {
        setUrl(extractedUrl);

        // 自动检测平台并开始解析
        let detectedPlatform = "douyin"; // 默认平台
        if (text.includes("douyin.com")) {
          detectedPlatform = "douyin";
        } else if (text.includes("kuaishou.com")) {
          detectedPlatform = "kuaishou";
        } else if (text.includes("weibo.com")) {
          detectedPlatform = "weibo";
        } else if (
          text.includes("xiaohongshu.com") ||
          text.includes("xhslink.com")
        ) {
          detectedPlatform = "xhs";
        } else if (text.includes("bilibili.com")) {
          detectedPlatform = "bilibili";
        }

        // 使用 setTimeout 确保状态更新完成后再执行自动解析
        setTimeout(() => {
          autoParseVideo(extractedUrl, detectedPlatform);
        }, 100);
      }
    },
    [autoParseVideo]
  );

  // 检查是否包含有效的视频平台URL
  const hasValidVideoUrl = useCallback((text: string): boolean => {
    const supportedPlatforms = [
      "douyin.com",
      "kuaishou.com",
      "weibo.com",
      "xiaohongshu.com",
      "xhslink.com",
      "bilibili.com",
    ];

    return supportedPlatforms.some((platform) => text.includes(platform));
  }, []);

  // 页面加载时自动读取剪贴板（仅执行一次，避免重复触发解析）
  const hasAutoReadRef = useRef(false);
  useEffect(() => {
    if (hasAutoReadRef.current) return;
    hasAutoReadRef.current = true;

    const autoReadClipboard = async () => {
      try {
        if (!navigator.clipboard || !navigator.clipboard.readText) return;
        const text = await navigator.clipboard.readText();
        if (text && text.trim() && hasValidVideoUrl(text)) {
          setInput(text);
          processInputText(text);
        }
      } catch (error) {
        console.log("自动读取剪贴板失败:", error);
      }
    };

    const timer = setTimeout(autoReadClipboard, 500);
    return () => clearTimeout(timer);
  }, [processInputText, hasValidVideoUrl]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInput(text);
    processInputText(text);
  };

  // 粘贴按钮功能
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
      processInputText(text);
    } catch (error) {
      console.error("粘贴失败:", error);
      onResult(null, "粘贴失败，请手动粘贴或检查浏览器权限");
    }
  };

  // 清空输入
  const handleClear = () => {
    setInput("");
    setUrl("");
    onResult(null, "");
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
    <div className="max-w-3xl mx-auto mb-12">
      {/* 标题区域 */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          视频解析工具
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          支持抖音、快手、B站、
          {/* 微博、 */}
          小红书等平台视频解析
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 输入区域 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              视频链接或分享文本
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePaste}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 transition-colors">
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                粘贴
              </button>
              {input && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md text-gray-600 bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors">
                  <svg
                    className="w-4 h-4 mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  清空
                </button>
              )}
            </div>
          </div>

          <textarea
            value={input}
            onChange={handleInputChange}
            placeholder="请粘贴包含视频链接的文本，或点击粘贴按钮自动读取剪贴板内容..."
            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all min-h-[120px] resize-none"
          />

          {/* {url && (
            <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center">
                <svg
                  className="w-4 h-4 text-green-500 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm text-green-700 dark:text-green-400 font-medium">
                  已检测到链接:{url}
                </span>
              </div>
            </div>
          )} */}
        </div>

        {/* 平台选择和解析按钮 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              {/* <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                选择平台
              </label> */}
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
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                <option value="douyin">🎵 抖音</option>
                <option value="bilibili">🅱️ 哔哩哔哩</option>
                <option value="kuaishou">⚡ 快手</option>
                <option value="weibo">📱 微博</option>
                <option value="xhs">📝 小红书</option>
              </select>
            </div>

            <div className="flex-1">
              {/* <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                开始解析
              </label> */}
              <button
                type="submit"
                disabled={loading || !url}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none">
                {loading ? (
                  <div className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      fill="none"
                      viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    解析中...
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    开始解析
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
