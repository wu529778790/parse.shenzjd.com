// floating-unlock 验票守卫单元测试
// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getUnlockCredentials,
  verifyUnlockTicket,
  enforceFloatingUnlock,
  isUnlockGateEnabled,
} from "@/lib/floating-unlock-verify";

const originalFetch = global.fetch;

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://127.0.0.1/api/parse?url=https://v.douyin.com/abc/", {
    headers,
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("floating-unlock 验票守卫", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("getUnlockCredentials", () => {
    it("双票据头齐全时返回 ticket/grant（含空白自动 trim）", () => {
      const creds = getUnlockCredentials(
        makeRequest({
          "x-unlock-ticket": "  ticket-1  ",
          "x-unlock-grant": " grant-1 ",
        })
      );
      expect(creds).toEqual({ ticket: "ticket-1", grant: "grant-1" });
    });

    it("任一票据头缺失 / 为空时返回 null", () => {
      expect(getUnlockCredentials(makeRequest())).toBeNull();
      expect(
        getUnlockCredentials(
          makeRequest({ "x-unlock-ticket": "ticket-1" })
        )
      ).toBeNull();
      expect(
        getUnlockCredentials(
          makeRequest({
            "x-unlock-ticket": "",
            "x-unlock-grant": "grant-1",
          })
        )
      ).toBeNull();
    });
  });

  describe("verifyUnlockTicket", () => {
    it("valid:true 时通过，请求格式正确（POST verify、body 为 ticket/grant、no-store）", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ valid: true }));
      global.fetch = fetchMock;

      const verdict = await verifyUnlockTicket({
        ticket: "ticket-1",
        grant: "grant-1",
      });
      expect(verdict).toEqual({ valid: true });

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/api/auth/mp-reward/verify");
      expect(init.method).toBe("POST");
      expect(init.cache).toBe("no-store");
      expect(init.headers["content-type"]).toBe("application/json");
      expect(JSON.parse(init.body)).toEqual({
        ticket: "ticket-1",
        grant: "grant-1",
      });
    });

    it("valid:false 时拒绝并保留 wx-auth 的 code（如 already_consumed）", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ valid: false, code: "already_consumed" })
        );
      const verdict = await verifyUnlockTicket({
        ticket: "t1",
        grant: "g1",
      });
      expect(verdict).toEqual({ valid: false, reason: "already_consumed" });
    });

    it("响应非 JSON 时按验票失败处理（fail closed）", async () => {
      global.fetch = vi.fn().mockResolvedValue(new Response("<html>"));
      const verdict = await verifyUnlockTicket({ ticket: "t", grant: "g" });
      expect(verdict.valid).toBe(false);
      expect(verdict.reason).toBe("verify-bad-json");
    });

    it("verify 返回非 2xx 时失败且不透传状态码作为放行依据", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(jsonResponse({ valid: true }, 500));
      const verdict = await verifyUnlockTicket({ ticket: "t", grant: "g" });
      expect(verdict.valid).toBe(false);
      expect(verdict.reason).toBe("verify-http-500");
    });

    it("wx-auth 网络异常时按不可达处理（fail closed，不误放行）", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
      const verdict = await verifyUnlockTicket({ ticket: "t", grant: "g" });
      expect(verdict).toEqual({ valid: false, reason: "verify-unreachable" });
    });
  });

  describe("enforceFloatingUnlock / checkFloatingUnlock", () => {
    it("无票据头直接 403，且不发起验票请求", async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      const gate = await enforceFloatingUnlock(makeRequest());
      expect(gate.pass).toBe(false);
      expect(gate.reason).toBe("missing");
      expect(fetchMock).not.toHaveBeenCalled();

      const res = gate.response;
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe(403);
      expect(json.msg).toContain("解锁");
    });

    it("验票 valid:true 时放行", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(jsonResponse({ valid: true }));
      const gate = await enforceFloatingUnlock(
        makeRequest({
          "x-unlock-ticket": "ticket-ok",
          "x-unlock-grant": "grant-ok",
        })
      );
      expect(gate.pass).toBe(true);
    });

    it("验票不通过（invalid_grant）返回 403 提示重新看广告", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ valid: false, code: "invalid_grant" })
        );
      const gate = await enforceFloatingUnlock(
        makeRequest({ "x-unlock-ticket": "t", "x-unlock-grant": "g" })
      );
      expect(gate.pass).toBe(false);
      expect(gate.reason).toBe("rejected");
      expect(gate.response.status).toBe(403);
      const json = await gate.response.json();
      expect(json.msg).toContain("失效");
    });

    it("验票服务不可达时 fail closed 返回 403", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("boom"));
      const gate = await enforceFloatingUnlock(
        makeRequest({ "x-unlock-ticket": "t", "x-unlock-grant": "g" })
      );
      expect(gate.pass).toBe(false);
      expect(gate.reason).toBe("unreachable");
      expect(gate.response.status).toBe(403);
      const json = await gate.response.json();
      expect(json.msg).toContain("稍后重试");
    });

    it("拒绝响应可透传业务侧响应头（如 CORS）", async () => {
      global.fetch = vi.fn();
      const gate = await enforceFloatingUnlock(makeRequest(), {
        "access-control-allow-origin": "*",
      });
      expect(gate.response.headers.get("access-control-allow-origin")).toBe(
        "*"
      );
    });
  });

  describe("isUnlockGateEnabled", () => {
    const ORIGINAL = process.env.FLOATING_UNLOCK_GATE;

    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.FLOATING_UNLOCK_GATE;
      else process.env.FLOATING_UNLOCK_GATE = ORIGINAL;
    });

    it("默认开启（配置文件 enableGate=true，无环境变量）", () => {
      delete process.env.FLOATING_UNLOCK_GATE;
      expect(isUnlockGateEnabled()).toBe(true);
    });

    it("环境变量 FLOATING_UNLOCK_GATE=1 强制开启", () => {
      process.env.FLOATING_UNLOCK_GATE = "1";
      expect(isUnlockGateEnabled()).toBe(true);
    });

    it("环境变量 FLOATING_UNLOCK_GATE=0 强制关闭（快速回退）", () => {
      process.env.FLOATING_UNLOCK_GATE = "0";
      expect(isUnlockGateEnabled()).toBe(false);
    });
  });
});
