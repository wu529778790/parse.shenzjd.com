// @ts-nocheck
/**
 * 输入 URL 协议头补全（2026-11-24）。
 *
 * 线上 72h 内 25 次「Invalid URL (input: "www.acfun.cn/v/...")」——用户直接
 * 粘贴不带 scheme 的链接，`new URL()` 抛错后只看到「无效的URL格式」。
 * 规则要窄：已有协议不动、裸 IPv4 不补（防内网试探）、非域名原样交回校验。
 */
import { describe, expect, it } from "vitest";
import { normalizeInputUrl } from "@/lib/api-utils";

describe("normalizeInputUrl", () => {
  it("缺协议头的域名 + 路径补 https://", () => {
    expect(normalizeInputUrl("www.acfun.cn/v/ac16803480")).toBe(
      "https://www.acfun.cn/v/ac16803480"
    );
    expect(normalizeInputUrl("v.douyin.com/iAbCdEf/")).toBe(
      "https://v.douyin.com/iAbCdEf/"
    );
    expect(normalizeInputUrl("www.acfun.cn:2087/1035.html")).toBe(
      "https://www.acfun.cn:2087/1035.html"
    );
  });

  it("只有域名（无路径）也补全", () => {
    expect(normalizeInputUrl("example.com")).toBe("https://example.com");
  });

  it("已有协议一律原样返回（不覆盖用户给的 http）", () => {
    expect(normalizeInputUrl("http://www.acfun.cn/v/ac1")).toBe(
      "http://www.acfun.cn/v/ac1"
    );
    expect(normalizeInputUrl("https://b23.tv/abc")).toBe("https://b23.tv/abc");
  });

  it("裸 IPv4 不补全（不给内网试探顺手开门）", () => {
    expect(normalizeInputUrl("127.0.0.1:8080/admin")).toBe(
      "127.0.0.1:8080/admin"
    );
    expect(normalizeInputUrl("192.168.1.1/secret")).toBe("192.168.1.1/secret");
  });

  it("分享文案 / 空值 / 异常输入原样返回，交给 isValidUrl 报错", () => {
    const shareText = "4.66 复制打开抖音，看看【某某的作品】 K@W.Zm usE:/";
    expect(normalizeInputUrl(shareText)).toBe(shareText);
    expect(normalizeInputUrl("")).toBe("");
    expect(normalizeInputUrl(null)).toBe("");
    expect(normalizeInputUrl("  www.acfun.cn/v/ac1  ")).toBe(
      "https://www.acfun.cn/v/ac1"
    );
  });
});
