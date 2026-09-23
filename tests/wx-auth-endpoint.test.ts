// @ts-nocheck
/**
 * wx-auth 服务端出口测试（lib/wx-auth-endpoint.ts）
 *
 * 覆盖 2026-09-23 线上问题与 panhub 2026-09-21 事故的教训：
 * - 同机部署应优先走内网出口（公网经 Cloudflare 回源偶发 5s 超时 → 401 误拒）
 * - 只配内网出口时必须自动追加公网兜底（内网挂了还有公网这条路）
 * - 已配公网出口时不得替站点追加我们的域名
 * - 内网出口连接失败 → 自动切换备用出口
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WX_AUTH_PUBLIC_BASE,
  resolveWxAuthBaseUrls,
  wxAuthBaseKind,
  wxAuthFetch,
  resetWxAuthBaseHealth,
  noteWxAuthBaseFailure,
  pickWxAuthBaseUrls,
} from "@/lib/wx-auth-endpoint";

const INTERNAL = "http://host.docker.internal:6702";

const originalFetch = global.fetch;
const originalEnv = {
  base: process.env.WXAUTH_API_BASE,
  legacy: process.env.WX_AUTH_API_BASE,
};

beforeEach(() => {
  resetWxAuthBaseHealth();
  // 模拟线上形态：配了内网出口（会自动追加公网兜底）
  process.env.WXAUTH_API_BASE = INTERNAL;
  delete process.env.WX_AUTH_API_BASE;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
  if (originalEnv.base === undefined) delete process.env.WXAUTH_API_BASE;
  else process.env.WXAUTH_API_BASE = originalEnv.base;
  if (originalEnv.legacy === undefined) delete process.env.WX_AUTH_API_BASE;
  else process.env.WX_AUTH_API_BASE = originalEnv.legacy;
});

describe("wxAuthBaseKind", () => {
  it("识别内网出口", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "host.docker.internal",
      "10.0.0.5",
      "192.168.1.9",
      "172.17.0.1",
      "172.31.255.254",
    ]) {
      expect(wxAuthBaseKind(`http://${host}:6702`)).toBe("internal");
    }
  });

  it("识别公网出口", () => {
    expect(wxAuthBaseKind(DEFAULT_WX_AUTH_PUBLIC_BASE)).toBe("public");
    expect(wxAuthBaseKind("http://172.32.0.1:6702")).toBe("public");
    expect(wxAuthBaseKind("http://172.15.0.1:6702")).toBe("public");
    // 配置写坏（不是合法 URL）按 public 记，至少能被日志发现
    expect(wxAuthBaseKind("not-a-url")).toBe("public");
  });
});

describe("resolveWxAuthBaseUrls", () => {
  it("未配置时只走内置公网出口", () => {
    expect(resolveWxAuthBaseUrls("")).toEqual([DEFAULT_WX_AUTH_PUBLIC_BASE]);
  });

  it("只配内网出口时自动追加公网兜底（2026-09-21 事故教训）", () => {
    expect(resolveWxAuthBaseUrls(INTERNAL)).toEqual([
      INTERNAL,
      DEFAULT_WX_AUTH_PUBLIC_BASE,
    ]);
  });

  it("已配公网出口时不再追加（不替 fork 站决定信任谁）", () => {
    expect(
      resolveWxAuthBaseUrls("http://10.0.0.5:6702,https://wx.example.com")
    ).toEqual(["http://10.0.0.5:6702", "https://wx.example.com"]);
  });

  it("支持逗号/分号/空白分隔，去重且去尾斜杠", () => {
    expect(resolveWxAuthBaseUrls(`${INTERNAL}/, ${INTERNAL} `)).toEqual([
      INTERNAL,
      DEFAULT_WX_AUTH_PUBLIC_BASE,
    ]);
  });

  it("兼容 panhub 的 WX_AUTH_API_BASE 变量名", () => {
    delete process.env.WXAUTH_API_BASE;
    process.env.WX_AUTH_API_BASE = INTERNAL;
    expect(resolveWxAuthBaseUrls()).toEqual([
      INTERNAL,
      DEFAULT_WX_AUTH_PUBLIC_BASE,
    ]);
  });
});

describe("出口熔断", () => {
  it("连续失败 3 次后冷却，跳过该出口；全部冷却时仍全试", () => {
    const now = 1_000_000;
    expect(pickWxAuthBaseUrls(now)).toHaveLength(2);

    for (let i = 0; i < 3; i++) noteWxAuthBaseFailure(INTERNAL, now);
    const picked = pickWxAuthBaseUrls(now + 1);
    expect(picked).toEqual([DEFAULT_WX_AUTH_PUBLIC_BASE]);

    // 冷却期内公网出口也挂了 → 不能变成「没有出口可用」
    for (let i = 0; i < 3; i++)
      noteWxAuthBaseFailure(DEFAULT_WX_AUTH_PUBLIC_BASE, now);
    expect(pickWxAuthBaseUrls(now + 1)).toHaveLength(2);

    // 冷却结束自动恢复
    expect(pickWxAuthBaseUrls(now + 61_000)).toHaveLength(2);
  });
});

describe("wxAuthFetch 多出口回退", () => {
  it("内网出口连接失败时切换备用出口并成功返回", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calls.push(String(url));
      if (String(url).startsWith(INTERNAL)) {
        throw new TypeError("fetch failed");
      }
      return new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
      });
    });

    const res = await wxAuthFetch("/api/auth/check?token=t", {
      timeoutMs: 1000,
    });
    expect(res.status).toBe(200);
    expect(calls[0].startsWith(INTERNAL)).toBe(true);
    expect(calls[1].startsWith(DEFAULT_WX_AUTH_PUBLIC_BASE)).toBe(true);
  });

  it("HTTP 非 2xx 不算出口失败（由调用方按语义处理），不换出口", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calls.push(String(url));
      return new Response("nope", { status: 500 });
    });

    const res = await wxAuthFetch("/api/auth/userinfo?token=t", {
      timeoutMs: 1000,
    });
    expect(res.status).toBe(500);
    expect(calls).toHaveLength(1);
  });

  it("所有出口都连不上时抛出错误（由调用方按语义处理）", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(
      wxAuthFetch("/api/auth/check?token=t", { timeoutMs: 1000 })
    ).rejects.toThrow(/fetch failed/);
  });
});
