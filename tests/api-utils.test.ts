// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isValidUrl,
  sanitizeUrl,
  createResponse,
  successResponse,
  errorResponse,
  serverErrorResponse,
  parseErrorResponse,
  logger,
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

    it("successResponse should create success response", () => {
      const response = successResponse({ video: "url" });
      expect(response).toEqual({
        code: 200,
        msg: "解析成功",
        data: { video: "url" },
      });
    });

    it("successResponse should accept custom message", () => {
      const response = successResponse({ video: "url" }, "自定义成功消息");
      expect(response).toEqual({
        code: 200,
        msg: "自定义成功消息",
        data: { video: "url" },
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
});
