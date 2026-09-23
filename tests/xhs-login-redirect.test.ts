// @ts-nocheck
import { afterEach, describe, expect, it, vi } from "vitest";
import xhs from "@/lib/parsers/xhs";

const originalFetch = global.fetch;

const LOGIN_URL =
  "https://www.xiaohongshu.com/login?redirectPath=" +
  encodeURIComponent(
    "https://www.xiaohongshu.com/discovery/item/6aa816c2?xsec_token=abc"
  );

const LOGIN_STATE = JSON.stringify({
  global: {},
  login: { loggedIn: false },
});

const NOTE_STATE = JSON.stringify({
  note: {
    currentNoteId: "6aa816c2",
    noteDetailMap: {
      "6aa816c2": {
        note: {
          title: "测试笔记",
          desc: "内容",
          user: { nickName: "作者", userId: "u1" },
          imageList: [{ urlDefault: "https://sns-webpic.example.com/1.jpg" }],
        },
      },
    },
  },
});

function htmlPage(state: string) {
  return `<html><script>window.__INITIAL_STATE__=${state}</script></html>`;
}

// mock 的 Response 不会像 undici 那样自动填 url，手动补上
//（fetchWithRedirects 的重定向循环依赖 response.url 解析相对跳转）
function pageResponse(url: string, state: string) {
  const resp = new Response(htmlPage(state), { status: 200 });
  Object.defineProperty(resp, "url", { value: url });
  return resp;
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("xhs 请求头", () => {
  it("使用移动端 UA（桌面 UA 会被强制跳登录页）", async () => {
    const seen: RequestInit[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      seen.push(init);
      return pageResponse(url, NOTE_STATE);
    });

    const result = await xhs("https://www.xiaohongshu.com/explore/6aa816c2");
    expect(result.code).toBe(200);

    const ua = String((seen[0]?.headers as Record<string, string>)["User-Agent"]);
    expect(ua).toMatch(/iPhone/);
    expect(ua).not.toMatch(/Windows NT/);
  });

  it("配置 XHS_COOKIE 时两个请求阶段都带上 Cookie", async () => {
    process.env.XHS_COOKIE = "web_session=abc; a1=def";
    const seen: RequestInit[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      seen.push(init);
      if (url.startsWith("https://xhslink.cn/")) {
        const resp = new Response(null, {
          status: 302,
          headers: { location: "https://www.xiaohongshu.com/explore/6aa816c2" },
        });
        Object.defineProperty(resp, "url", { value: url });
        return resp;
      }
      return pageResponse(url, NOTE_STATE);
    });

    try {
      await xhs("https://xhslink.cn/o/G84qDcu5X");
    } finally {
      delete process.env.XHS_COOKIE;
    }

    expect(seen.length).toBeGreaterThan(1);
    for (const init of seen) {
      expect((init.headers as Record<string, string>).Cookie).toBe(
        "web_session=abc; a1=def"
      );
    }
  });

  it("未配置 XHS_COOKIE 时不发 Cookie 头", async () => {
    delete process.env.XHS_COOKIE;
    const seen: RequestInit[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      seen.push(init);
      return pageResponse(url, NOTE_STATE);
    });

    await xhs("https://www.xiaohongshu.com/explore/6aa816c2");
    expect((seen[0]?.headers as Record<string, string>).Cookie).toBeUndefined();
  });
});

describe("xhs 已删除笔记", () => {
  // 真机样本（xhslink.cn/o/3Gyr8qtncG6）已被作者恢复，改用 mock 锁定该分支，
  // 确定性覆盖「重定向带 undertake_note_error → 404 该内容已被删除」
  it("最终 URL 带 undertake_note_error 时返回 404 已删除", async () => {
    const url =
      "https://www.xiaohongshu.com/explore?undertake_note_error=" +
      encodeURIComponent("该内容暂时无法查看");
    global.fetch = vi.fn().mockImplementation(async (u: string) => {
      const resp = new Response("<html></html>", { status: 200 });
      Object.defineProperty(resp, "url", { value: u.startsWith("http") && u.includes("xhslink") ? url : u });
      return resp;
    });

    const result = await xhs("https://xhslink.cn/o/3Gyr8qtncG6");
    expect(result.code).toBe(404);
    expect(result.msg).toBe("该内容已被删除");
  });
});

describe("xhs 登录跳转兜底", () => {
  it("短链被 302 到登录页时，用 redirectPath 重试真实笔记页", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith("https://xhslink.cn/")) {
        const resp = new Response(null, {
          status: 302,
          headers: { location: LOGIN_URL },
        });
        Object.defineProperty(resp, "url", { value: url });
        return resp;
      }
      return pageResponse(url, NOTE_STATE);
    });

    const result = await xhs("https://xhslink.cn/o/G84qDcu5X");
    expect(result.code).toBe(200);
    expect(result.data.title).toBe("测试笔记");
  });

  it("重试后仍是登录页 → 返回明确的 403 需登录提示", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith("https://xhslink.cn/")) {
        const resp = new Response(null, {
          status: 302,
          headers: { location: LOGIN_URL },
        });
        Object.defineProperty(resp, "url", { value: url });
        return resp;
      }
      return pageResponse(LOGIN_URL, LOGIN_STATE);
    });

    const result = await xhs("https://xhslink.cn/o/G84qDcu5X");
    expect(result.code).toBe(403);
    expect(result.msg).toContain("登录");
  });
});
