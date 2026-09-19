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
