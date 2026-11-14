// @ts-nocheck
/**
 * 快手直链跳过无用重定向测试（kuaishouCore.parse 的候选选择）：
 * - URL 已含 photoId（/short-video/、/fw/photo/）时不再请求 www.kuaishou.com
 *   （数据中心出口反爬、重定向常吃满 10s 超时，2026-11-14 线上慢解析根因），
 *   直接请求 m.gifshow.com/fw/photo/<id>
 * - v.kuaishou.com 短链仍需重定向展开后解析
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseKuaishou } from "@/lib/kuaishouCore";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const GIFSHOW_PAGE = `<html><script>var d={"photoId":"abc123","mainMvUrls":[{"cdn":"kwaicdn","url":"https:\\/\\/v.kwaicdn.com\\/x.mp4"}],"webpCoverUrls":[{"url":"https:\\/\\/p.a.kwimgs.com\\/c.jpg"}],"caption":"测试视频","name":"测试作者"}</script></html>`;

function gifshowResponse() {
  return new Response(GIFSHOW_PAGE, { status: 200 });
}

function redirectResponse(url) {
  const resp = new Response(null, { status: 302 });
  Object.defineProperty(resp, "url", { value: url });
  return resp;
}

describe("kuaishou 直链跳过重定向", () => {
  it("/short-video/ 直链不再请求 www.kuaishou.com，直取 gifshow 分享页", async () => {
    const fetchMock = vi.fn().mockResolvedValue(gifshowResponse());
    global.fetch = fetchMock;

    const result = await parseKuaishou(
      "https://www.kuaishou.com/short-video/abc123?cc=share_wxms"
    );

    expect(result.code).toBe(200);
    expect(result.data.photoUrl).toBe("https://v.kwaicdn.com/x.mp4");
    expect(result.data.caption).toBe("测试视频");
    // 只有 gifshow 页这一次请求，无任何 www.kuaishou.com 重定向探测
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://m.gifshow.com/fw/photo/abc123"
    );
  });

  it("v.kuaishou.com 短链仍走重定向展开", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        redirectResponse("https://m.gifshow.com/fw/photo/xyz789")
      )
      .mockResolvedValue(gifshowResponse());
    global.fetch = fetchMock;

    const result = await parseKuaishou("https://v.kuaishou.com/nvNyNrk2");

    expect(result.code).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("https://v.kuaishou.com/nvNyNrk2");
    expect(fetchMock.mock.calls[1][0]).toContain("fw/photo/xyz789");
  });
});
