"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { ApiResponse } from "@/types/api";
import { extractUrlFromText as extractUrl, detectPlatform } from "@/utils/share";

interface VideoParserFormProps {
  onResult: (data: ApiResponse | null, errorMsg: string) => void;
  setLoading: (loading: boolean) => void;
  loading: boolean;
}

// Platform configuration with colors and icons
const PLATFORMS = {
  douyin: {
    name: "抖音",
    emoji: "🎵",
    color: "#fe2c55",
    gradient: "from-[#fe2c55] to-[#ff6b8a]",
  },
  bilibili: {
    name: "哔哩哔哩",
    emoji: "🅱️",
    color: "#00aeec",
    gradient: "from-[#00aeec] to-[#4dc9ff]",
  },
  kuaishou: {
    name: "快手",
    emoji: "⚡",
    color: "#ff6600",
    gradient: "from-[#ff6600] to-[#ff9933]",
  },
  weibo: {
    name: "微博",
    emoji: "📱",
    color: "#e6162d",
    gradient: "from-[#e6162d] to-[#ff4d6a]",
  },
  xhs: {
    name: "小红书",
    emoji: "📝",
    color: "#ff2442",
    gradient: "from-[#ff2442] to-[#ff5c7c]",
  },
} as const;

export default function VideoParserForm({
  onResult,
  setLoading,
  loading,
}: VideoParserFormProps) {
  const [input, setInput] = useState("");
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<keyof typeof PLATFORMS>("douyin");
  const [isFocused, setIsFocused] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<keyof typeof PLATFORMS | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Parse function with cache and retry support
  const parseVideo = useCallback(async (url: string, platform: string, retryCount = 0) => {
    if (!url || loading) return;

    const cacheKey = `${platform}:${url}`;
    const cachedResult = sessionStorage.getItem(cacheKey);

    // Check cache
    if (cachedResult) {
      try {
        const parsed: { data: ApiResponse; timestamp: number } = JSON.parse(cachedResult);
        if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
          onResult(parsed.data, "");
          return;
        }
      } catch {
        // 缓存解析失败，忽略错误继续执行
      }
    }

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

        // Cache successful result
        sessionStorage.setItem(cacheKey, JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      } else {
        onResult(null, data.msg || "解析失败");
      }
    } catch {
      // Retry once on failure
      if (retryCount < 1) {
        setTimeout(() => parseVideo(url, platform, retryCount + 1), 1000);
        return;
      }
      onResult(null, "请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [loading, onResult, setLoading]);

  // Debounced parse function
  const debouncedParse = useCallback(
    (url: string, platform: string) => {
      const timeoutId = setTimeout(() => parseVideo(url, platform), 500);
      return () => clearTimeout(timeoutId);
    },
    [parseVideo]
  );

  // Process input and detect platform
  const processInputText = useCallback(
    (text: string) => {
      const extractedUrl = extractUrl(text);
      if (extractedUrl) {
        setUrl(extractedUrl);
        const detected = detectPlatform(text);
        const platformKey = detected as keyof typeof PLATFORMS;
        setDetectedPlatform(platformKey);
        setPlatform(platformKey);
        debouncedParse(extractedUrl, detected);
      } else {
        setDetectedPlatform(null);
      }
    },
    [debouncedParse]
  );

  // Check for valid video URL
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

  // Auto-read clipboard on mount
  const hasAutoReadRef = useRef(false);
  useEffect(() => {
    if (hasAutoReadRef.current) return;
    hasAutoReadRef.current = true;

    const autoReadClipboard = async () => {
      try {
        // 检查clipboard API是否可用
        if (typeof navigator === 'undefined' || 
            !navigator.clipboard || 
            typeof navigator.clipboard.readText !== 'function') {
          return;
        }
        
        const text = await navigator.clipboard.readText();
        if (text && text.trim() && hasValidVideoUrl(text)) {
          setInput(text);
          processInputText(text);
        }
      } catch {
        // 静默失败，不显示错误（权限问题或非安全上下文）
        // 用户仍可手动粘贴
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

  const handlePaste = async () => {
    try {
      // 检查clipboard API是否可用
      if (typeof navigator === 'undefined' || 
          !navigator.clipboard || 
          typeof navigator.clipboard.readText !== 'function') {
        onResult(null, "您的浏览器不支持自动粘贴，请手动粘贴（Ctrl+V）");
        return;
      }
      
      const text = await navigator.clipboard.readText();
      setInput(text);
      processInputText(text);
    } catch {
      onResult(null, "粘贴失败：请检查浏览器权限或使用手动粘贴（Ctrl+V）");
    }
  };

  const handleClear = () => {
    setInput("");
    setUrl("");
    setDetectedPlatform(null);
    onResult(null, "");
    textareaRef.current?.focus();
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

  // Update CSS variable for platform accent
  useEffect(() => {
    if (detectedPlatform && PLATFORMS[detectedPlatform]) {
      document.documentElement.style.setProperty('--accent', PLATFORMS[detectedPlatform].color);
    }
  }, [detectedPlatform]);

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Input Card */}
        <div className={`glass-card iridescent-border p-1 transition-all duration-500 ${isFocused ? 'shadow-2xl shadow-indigo-500/10' : ''}`}>
          <div className="bg-glass-1 rounded-xl p-4 sm:p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <label className="flex items-center gap-2 text-sm font-medium text-primary">
                <svg
                  className="w-4 h-4 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                视频链接或分享文本
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePaste}
                  className="paste-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-accent bg-accent/10 hover:bg-accent/20 transition-all duration-200">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  粘贴
                </button>

                {input && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-muted hover:text-primary bg-glass-2 hover:bg-glass-3 transition-all duration-200">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    清空
                  </button>
                )}
              </div>
            </div>

            {/* Textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="粘贴包含视频链接的文本，或点击粘贴按钮..."
                className="input-glow w-full px-4 py-3 rounded-xl border border-border-subtle bg-glass-2 text-primary placeholder-muted/50 focus:border-accent/50 focus:bg-glass-3 transition-all duration-300 min-h-[120px] resize-none"
              />
            </div>
          </div>
        </div>

        {/* Platform & Submit Row */}
        <div className="glass-card iridescent-border p-1">
          <div className="bg-glass-1 rounded-xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Platform Selector */}
              <div className="flex-1">
                <select
                  value={platform}
                  onChange={(e) =>
                    setPlatform(e.target.value as keyof typeof PLATFORMS)
                  }
                  className="input-glow w-full px-4 py-3.5 rounded-xl border border-border-subtle bg-glass-2 text-primary focus:border-accent/50 focus:bg-glass-3 transition-all duration-300 appearance-none cursor-pointer">
                  {Object.entries(PLATFORMS).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.emoji} {config.name}
                    </option>
                  ))}
                </select>

                {/* Custom Arrow */}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none hidden">
                  <svg
                    className="w-5 h-5 text-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex-1 sm:flex-[1.2]">
                <button
                  ref={buttonRef}
                  type="submit"
                  disabled={loading || !url}
                  className="magnetic-btn group relative w-full px-6 py-3.5 rounded-xl font-semibold text-white overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/25 hover:-translate-y-0.5 disabled:translate-y-0">
                  {/* Dynamic Gradient Background */}
                  <div className={`absolute inset-0 bg-gradient-to-r ${detectedPlatform && PLATFORMS[detectedPlatform] ? PLATFORMS[detectedPlatform].gradient : 'from-indigo-500 to-purple-600'} transition-all duration-500`} />

                  {/* Shimmer Effect */}
                  <div className="absolute inset-0 shimmer opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* Button Content */}
                  <div className="relative flex items-center justify-center gap-2">
                    {loading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>解析中...</span>
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5 transition-transform group-hover:scale-110"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        <span>开始解析</span>
                      </>
                    )}
                  </div>

                  {/* Ripple Effect Container */}
                  <span className="absolute inset-0 rounded-xl" />
                </button>
              </div>
            </div>

            {/* Helper Text */}
            <p className="mt-3 text-xs text-muted text-center">
              支持自动检测平台 · 粘贴后自动解析
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
