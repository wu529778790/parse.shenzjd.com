// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isValidUrl,
  sanitizeUrl,
  createResponse,
  errorResponse,
  serverErrorResponse,
  parseErrorResponse,
  logger,
  isBlockedIP,
} from "@/lib/api-utils";

describe("api-utils", () => {
  describe("isValidUrl", () => {
    it("should return true for valid HTTP URLs", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("http://example.com")).toBe(true);
    });

    it("should return false for invalid URLs", () => {
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("")).toBe(false);
      expect(isValidUrl("ftp://")).toBe(false);
    });
  });

  describe("sanitizeUrl", () => {
    it("should return sanitized URL for valid external URLs", () => {
      expect(sanitizeUrl("https://example.com/path")).toBe("https://example.com/path");
      expect(sanitizeUrl("https://www.douyin.com/video/123")).toBe("https://www.douyin.com/video/123");
    });

    it("should block localhost URLs", () => {
      expect(sanitizeUrl("http://localhost:3000")).toBeNull();
      expect(sanitizeUrl("http://127.0.0.1:8080")).toBeNull();
    });

    it("should block private IP addresses", () => {
      expect(sanitizeUrl("http://10.0.0.1")).toBeNull();
      expect(sanitizeUrl("http://172.16.0.1")).toBeNull();
      expect(sanitizeUrl("http://192.168.1.1")).toBeNull();
    });

    it("should block 169.254.0.0/16 (link-local / cloud metadata)", () => {
      expect(sanitizeUrl("http://169.254.169.254/latest/meta-data/")).toBeNull();
      expect(sanitizeUrl("http://169.254.1.1/")).toBeNull();
    });

    it("should block 0.0.0.0", () => {
      expect(sanitizeUrl("http://0.0.0.0/")).toBeNull();
    });

    it("should block IPv6 private addresses", () => {
      expect(sanitizeUrl("http://[::1]/")).toBeNull();
      expect(sanitizeUrl("http://[fc00::1]/")).toBeNull();
      expect(sanitizeUrl("http://[fd00::1]/")).toBeNull();
      expect(sanitizeUrl("http://[fe80::1]/")).toBeNull();
    });

    it("should block IPv4-mapped IPv6 addresses", () => {
      expect(sanitizeUrl("http://[::ffff:127.0.0.1]/")).toBeNull();
      expect(sanitizeUrl("http://[::ffff:192.168.1.1]/")).toBeNull();
    });

    it("should block non-http/https schemes", () => {
      expect(sanitizeUrl("ftp://example.com/file")).toBeNull();
      expect(sanitizeUrl("gopher://example.com")).toBeNull();
      expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
    });

    it("should return null for invalid URLs", () => {
      expect(sanitizeUrl("not-a-url")).toBeNull();
      expect(sanitizeUrl("")).toBeNull();
    });
  });

  describe("response helpers", () => {
    it("createResponse should create response object", () => {
      const response = createResponse(200, "success", { key: "value" });
      expect(response).toEqual({
        code: 200,
        msg: "success",
        data: { key: "value" },
      });
    });

    it("errorResponse should create error response", () => {
      const response = errorResponse("错误消息", 400);
      expect(response).toEqual({
        code: 400,
        msg: "错误消息",
      });
    });

    it("errorResponse should default to code 400", () => {
      const response = errorResponse("错误消息");
      expect(response).toEqual({
        code: 400,
        msg: "错误消息",
      });
    });

    it("serverErrorResponse should return fixed message without leaking error details", () => {
      const error = new Error("internal detail with /etc/passwd path");
      const response = serverErrorResponse(error);
      // 对外只返回固定文案，不透传 error.message（避免泄漏内部实现）
      expect(response).toEqual({
        code: 500,
        msg: "服务器内部错误",
      });
      expect(response.msg).not.toContain("internal detail");
    });

    it("parseErrorResponse should create parse error response", () => {
      const response = parseErrorResponse();
      expect(response).toEqual({
        code: 400,
        msg: "解析失败",
      });
    });

    it("parseErrorResponse should accept custom message", () => {
      const response = parseErrorResponse("视频不存在");
      expect(response).toEqual({
        code: 400,
        msg: "视频不存在",
      });
    });
  });

  describe("logger", () => {
    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "info").mockImplementation(() => {});
    });

    it("should have log, warn, error, info methods", () => {
      expect(typeof logger.log).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.info).toBe("function");
    });

    it("error should always log", () => {
      logger.error("test error");
      expect(console.error).toHaveBeenCalledWith("test error");
    });
  });

  describe("isBlockedIP", () => {
    it("should block exact IPv4 (120.42.187.174)", () => {
      expect(isBlockedIP("120.42.187.174")).toBe(true);
    });

    it("should block exact IPv6 (2409:8a34:...)", () => {
      expect(isBlockedIP("2409:8a34:4e86:73d0:80b2:7e98:30b9:743")).toBe(true);
    });

    it("should block IPv6 /64 prefix (2409:8d34:26:674c: any suffix)", () => {
      expect(isBlockedIP("2409:8d34:26:674c:d4dc:1916:b32c:ef6")).toBe(true);
      expect(isBlockedIP("2409:8d34:26:674c:1234:5678:9abc:def0")).toBe(true);
    });

    it("should block IPv6 /64 prefix (240e:465:5d60:e459:)", () => {
      expect(isBlockedIP("240e:465:5d60:e459:b437:b795:5bcb:fad")).toBe(true);
    });

    it("should block when IP appears as first element of x-forwarded-for chain", () => {
      expect(isBlockedIP("120.42.187.174, 104.22.72.33")).toBe(true);
    });

    it("should allow regular IPs", () => {
      expect(isBlockedIP("203.0.113.42")).toBe(false);
      expect(isBlockedIP("8.8.8.8")).toBe(false);
      expect(isBlockedIP("240e:465:5d60:abcd:1234:5678:9abc:def0")).toBe(false);
    });

    it("should be case-insensitive for IPv6", () => {
      expect(isBlockedIP("240E:465:5D60:E459:B437:B795:159C:FAD")).toBe(true);
    });

    it("should return false for empty/undefined", () => {
      expect(isBlockedIP("")).toBe(false);
      expect(isBlockedIP(undefined)).toBe(false);
      expect(isBlockedIP(null)).toBe(false);
    });
  });
});
