"use client";

import { useEffect } from "react";
import "wx-auth-sdk/dist/style.css";

export default function WxAuthInit() {
  useEffect(() => {
    const initWxAuth = async () => {
      try {
        const { WxAuth } = await import("wx-auth-sdk");

        WxAuth.init({
          apiBase: "https://wx-auth.shenzjd.com",
          siteId: "parse.shenzjd.com",
          onVerified: (user: { openid?: string }) => {
            console.log("[ParseShort] 微信认证成功", user);
          },
        });
      } catch (err) {
        console.error("[ParseShort] WxAuth 初始化失败:", err);
      }
    };

    initWxAuth();
  }, []);

  return null;
}
