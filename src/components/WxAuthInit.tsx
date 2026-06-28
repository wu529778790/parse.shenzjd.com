"use client";

import { useEffect } from "react";
import "wx-auth-sdk/dist/style.css";

// 模块级缓存，避免重复加载
let wxAuthPromise: Promise<typeof import("wx-auth-sdk")> | null = null;

function loadWxAuth() {
  if (!wxAuthPromise) {
    wxAuthPromise = import("wx-auth-sdk");
  }
  return wxAuthPromise;
}

const PARSE_COUNT_KEY = "parse_count";
export const FREE_PARSES = 1; // 免费解析次数

/**
 * 获取已解析次数
 */
export function getParseCount(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(PARSE_COUNT_KEY) || "0", 10);
}

/**
 * 增加解析次数
 */
export function incrementParseCount(): void {
  const count = getParseCount() + 1;
  localStorage.setItem(PARSE_COUNT_KEY, String(count));
}

/**
 * 检查解析授权：免费次数内直接放行，超出后需要认证
 * @returns true=允许解析, false=需要认证/认证失败
 */
export async function checkParseAuth(): Promise<boolean> {
  // 暂时禁用微信公众号认证（图片问题修复中）
  // TODO: 恢复认证逻辑
  return true;

  const count = getParseCount();

  // 免费次数内，直接放行
  if (count < FREE_PARSES) {
    return true;
  }

  // 已有 wxauth-openid cookie，说明之前认证过，检查是否仍然有效
  const cookies = document.cookie.split(";");
  const hasCookie = cookies.some((c) =>
    c.trim().startsWith("wxauth-openid=")
  );

  if (hasCookie) {
    try {
      const { WxAuth } = await loadWxAuth();
      // 还没初始化过则初始化
      if (!(window as unknown as Record<string, unknown>).WxAuth) {
        WxAuth.init();
      }
      const openid = cookies
        .find((c) => c.trim().startsWith("wxauth-openid="))
        ?.split("=")[1];
      const res = await fetch(
        `/api/auth/check?openid=${openid}&siteId=${encodeURIComponent("parse.shenzjd.com")}`
      );
      const data = await res.json();
      if (data.authenticated) return true;
    } catch {
      // 检查失败，继续走认证流程
    }
  }

  // 需要认证：加载 SDK 并弹窗
  try {
    const { WxAuth } = await loadWxAuth();
    WxAuth.init();
    const ok = await WxAuth.requireAuth();
    return ok;
  } catch {
    return false;
  }
}

/**
 * 页面加载时不弹窗，仅预加载 CSS
 * 实际认证在 checkParseAuth 中按需触发
 */
export default function WxAuthInit() {
  useEffect(() => {
    // 预加载 SDK（不初始化，不弹窗）
    loadWxAuth().catch(() => {
      // 静默失败
    });
  }, []);

  return null;
}
