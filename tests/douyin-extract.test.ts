// @ts-nocheck
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  tryParseEmbedded,
  hasValidData,
  parseVideoData,
  parseLiveData,
  extractFilterReason,
  isChallengeHtml,
  extractIdFromUrl,
  extractTtwid,
  isUserProfileUrl,
  parseMixDetail,
  parseMixAwemeList,
  fixDouyinFtyp,
} from "@/lib/douyin-extract";

// 页面快照：tests/snapshots/*.html
// 平台改版后，用新页面 HTML 替换快照文件，跑本测试即可定位提取逻辑失效点。
const snapshot = (name) =>
  readFileSync(path.join(process.cwd(), "tests/snapshots", name), "utf-8");

describe("douyin-extract：页面快照回归", () => {
  const videoHtml = snapshot("douyin-share-video.html");
  const noteHtml = snapshot("douyin-share-note.html");
  const filteredHtml = snapshot("douyin-share-filtered.html");

  it("标准视频分享页：解析出 _ROUTER_DATA 且数据有效", () => {
    const parsed = tryParseEmbedded(videoHtml);
    expect(parsed).not.toBeNull();
    expect(hasValidData(parsed)).toBe(true);
  });

  it("标准视频分享页：提取 title/author/url/audioUrl/duration", () => {
    const parsed = tryParseEmbedded(videoHtml);
    const result = parseVideoData(parsed);
    expect(result.code).toBe(200);
    expect(result.data).toMatchObject({
      title: "测试视频：快照回归",
      author: "快照作者",
      uid: "snapshot-author",
      // playwm → play（无水印）
      url: "https://v26-web.douyinvod.com/snapshot/play/video.mp4",
      type: "video",
      duration: 15000,
      like: 888,
      audioUrl: "https://sf6-cdn-tos.douyinstatic.com/music.mp3",
    });
  });

  it("图文笔记分享页：识别为 image 并提取图集", () => {
    const parsed = tryParseEmbedded(noteHtml);
    expect(hasValidData(parsed)).toBe(true);
    const result = parseVideoData(parsed);
    expect(result.code).toBe(200);
    expect(result.data.type).toBe("image");
    expect(result.data.images).toHaveLength(2);
    expect(result.data.cover).toBe("https://p3.douyinpic.com/img1.jpg");
    expect(result.data.url).toBeUndefined();
  });

  it("被过滤页（SYSTEM_ITEM_NOT_EXIST）：数据无效但能提取原因", () => {
    const parsed = tryParseEmbedded(filteredHtml);
    expect(hasValidData(parsed)).toBe(false);
    expect(extractFilterReason(parsed)).toBe("SYSTEM_ITEM_NOT_EXIST");
    expect(parseVideoData(parsed)).toBeNull();
  });

  it("RENDER_DATA（URL 编码）格式也能解析", () => {
    const payload = JSON.stringify({
      loaderData: {
        "video_(id)/page": {
          videoInfoRes: { item_list: [{ desc: "render-data-ok" }] },
        },
      },
    });
    const html = `<script id="RENDER_DATA">${encodeURIComponent(payload)}</script>`;
    const parsed = tryParseEmbedded(html);
    expect(
      parsed.loaderData["video_(id)/page"].videoInfoRes.item_list[0].desc
    ).toBe("render-data-ok");
  });

  it("argus 反爬页：无数据块且识别为 challenge", () => {
    const html = `<html><head><script src="/argus-csp-token"></script><script>var _$jsvmprt;</script></head></html>`;
    expect(tryParseEmbedded(html)).toBeNull();
    expect(isChallengeHtml(html)).toBe(true);
  });

  it("正常页面不被误判为反爬", () => {
    expect(isChallengeHtml(videoHtml)).toBe(false);
  });

  it("从 URL 提取视频/图文 ID", () => {
    expect(
      extractIdFromUrl("https://www.iesdouyin.com/share/video/1234567890123456789")
    ).toEqual({ id: "1234567890123456789", type: "video" });
    expect(
      extractIdFromUrl("https://www.iesdouyin.com/share/note/2345678901234567890")
    ).toEqual({ id: "2345678901234567890", type: "note" });
    expect(extractIdFromUrl("https://v.douyin.com/abc/")).toBeNull();
  });

  it("从跳转域名 target 参数提取 ID（wtturl.cn 等）", () => {
    // 跳转服务失效时，target 参数里的完整抖音链接兜底可提取
    expect(
      extractIdFromUrl(
        "https://link.wtturl.cn/?target=https%3A%2F%2Fwww.iesdouyin.com%2Fshare%2Fvideo%2F6891626572860706051"
      )
    ).toEqual({ id: "6891626572860706051", type: "video" });
    // 无 target 参数的普通链接不受影响
    expect(extractIdFromUrl("https://link.wtturl.cn/")).toBeNull();
  });

  it("识别用户主页分享链接（/share/user/ 与 sec_uid）", () => {
    // 线上案例：v.douyin.com/pcLEV_tYdLs 短链实际跳转到 /share/user/
    expect(
      isUserProfileUrl(
        "https://www.iesdouyin.com/share/user/MS4wLjABAAAAGsprZr-1bBuiEe_5eHTFoZbPsxiCKGY0Ewd_klNeaWg?with_sec_did=1&from_ssr=1"
      )
    ).toBe(true);
    expect(
      isUserProfileUrl(
        "https://www.douyin.com/user/MS4wLjABAAAAGsprZr-1bBuiEe_5eHTFoZbPsxiCKGY0Ewd_klNeaWg?sec_uid=MS4wLjABAAAA"
      )
    ).toBe(true);
    // 视频 / 图文分享链接不能被误判
    expect(
      isUserProfileUrl("https://www.iesdouyin.com/share/video/7389625411234567890")
    ).toBe(false);
    expect(
      isUserProfileUrl("https://www.iesdouyin.com/share/note/7389625411234567890")
    ).toBe(false);
  });

  it("从响应头提取 ttwid", () => {
    const res = new Response(null, {
      headers: {
        "set-cookie": "ttwid=abc123; Path=/; Max-Age=31536000",
      },
    });
    expect(extractTtwid(res)).toBe("ttwid=abc123");
    expect(extractTtwid(new Response(null))).toBe("");
  });

  it("识别合集（mix）链接并返回 mix 类型", () => {
    expect(
      extractIdFromUrl(
        "https://www.iesdouyin.com/share/mix/detail/7624080335004764170/"
      )
    ).toEqual({ id: "7624080335004764170", type: "mix" });
    expect(
      extractIdFromUrl("https://www.douyin.com/mix/detail/7624080335004764170")
    ).toEqual({ id: "7624080335004764170", type: "mix" });
    // 普通视频链接不能被误判为 mix
    expect(
      extractIdFromUrl("https://www.iesdouyin.com/share/video/7624080335004764170")
    ).toEqual({ id: "7624080335004764170", type: "video" });
  });

  it("解析 mix/detail 合集信息", () => {
    const detail = {
      mix_info: {
        mix_id: "7624080335004764170",
        mix_name: "测试合集",
        cover_url: { url_list: ["https://p3.douyinpic.com/cover.jpg"] },
        author: {
          nickname: "测试作者",
          uid: "123",
          avatar_medium: { url_list: ["https://p3.douyinpic.com/avatar.jpg"] },
        },
        statis: { updated_to_episode: 119 },
      },
    };
    expect(parseMixDetail(detail)).toEqual({
      mixName: "测试合集",
      cover: "https://p3.douyinpic.com/cover.jpg",
      author: "测试作者",
      authorId: "123",
      avatar: "https://p3.douyinpic.com/avatar.jpg",
      totalEpisodes: 119,
    });
    expect(parseMixDetail({})).toBeNull();
  });

  it("parseMixAwemeList 提取视频列表（含直链/封面/时长）", () => {
    const list = [
      {
        aweme_id: "7623721388263722286",
        desc: "测试视频标题",
        video: {
          duration: 175679,
          cover: { url_list: ["https://p3.douyinpic.com/cover1.jpg"] },
          play_addr: {
            uri: "v0200fg10000d76cguvog65uc11nnpi0",
            url_list: [
              "https://v5.douyinvod.com/playwm/video.mp4",
              "https://v5.douyinvod.com/play/video.mp4",
            ],
          },
        },
        statistics: { digg_count: 962 },
      },
      {
        aweme_id: "7621497256272743731",
        desc: "第二个视频",
        video: {
          duration: 0,
          cover: { url_list: [] },
          play_addr: { uri: "v0200fg10000d76cguvoabc" },
        },
      },
    ];
    const videos = parseMixAwemeList(list);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({
      title: "测试视频标题",
      // playwm → play（无水印）
      url: "https://v5.douyinvod.com/play/video.mp4",
      cover: "https://p3.douyinpic.com/cover1.jpg",
      duration: 176,
      durationFormat: "02:56",
      awemeId: "7623721388263722286",
      like: 962,
    });
    // 无 url_list 时用 uri 兜底直链
    expect(videos[1].url).toContain("v0200fg10000d76cguvoabc");
    expect(videos[1].duration).toBeUndefined();
    expect(parseMixAwemeList(null)).toEqual([]);
  });

  it("fixDouyinFtyp 修复抖音 MP4 的 ftyp 头混淆", () => {
    // 正常 MP4 头：ftyp size = 0x00000020
    const normal = Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]);
    // 混淆后：ftyp size 首字节 00→01（0x01000020）
    const obfuscated = Buffer.from(normal);
    obfuscated[0] = 0x01;

    // 混淆数据被修复
    const fixed = fixDouyinFtyp(obfuscated);
    expect(fixed[0]).toBe(0x00);
    expect(fixed[0]).not.toBe(obfuscated[0]);
    // 修复后与正常头一致
    expect(fixed.subarray(0, 8)).toEqual(normal.subarray(0, 8));

    // 正常数据不被误改
    expect(fixDouyinFtyp(normal)).toBe(normal);

    // 非 ftyp 数据（如 mdat）不被误改
    const mdat = Buffer.from([0x01, 0x00, 0x00, 0x20, 0x6d, 0x64, 0x61, 0x74]);
    expect(fixDouyinFtyp(mdat)).toBe(mdat);

    // 过短数据原样返回
    const short = Buffer.from([0x01, 0x00, 0x00]);
    expect(fixDouyinFtyp(short)).toBe(short);
  });

  it("识别直播链接（webcast reflow）并返回 live 类型", () => {
    expect(
      extractIdFromUrl(
        "https://webcast.amemv.com/douyin/webcast/reflow/7680142541999688502"
      )
    ).toEqual({ id: "7680142541999688502", type: "live" });
    // 带查询参数也能识别
    expect(
      extractIdFromUrl(
        "https://webcast.amemv.com/douyin/webcast/reflow/7680142541999688502?u_code=abc&did=xyz"
      )
    ).toEqual({ id: "7680142541999688502", type: "live" });
    // 直播间完整链接 live.douyin.com/{room_id}（room_id 为 12 位，不满足 15 位兜底）
    expect(
      extractIdFromUrl(
        "https://live.douyin.com/870887192950?enter_from_merge=link_share&enter_method=copy_link_share"
      )
    ).toEqual({ id: "870887192950", type: "live" });
    // 普通视频链接不能被误判为 live
    expect(
      extractIdFromUrl("https://www.iesdouyin.com/share/video/7680142541999688502")
    ).toEqual({ id: "7680142541999688502", type: "video" });
  });

  it("直播 reflow 页面：解析出直播信息与流地址", () => {
    const liveHtml = snapshot("douyin-live-reflow.html");
    const result = parseLiveData(liveHtml);
    expect(result).not.toBeNull();
    expect(result.code).toBe(200);
    expect(result.data).toMatchObject({
      type: "live",
      title: "总台央视新闻频道正在播出",
      author: "央视网",
      roomId: "7678365587243813675",
      // 直播中（抖音 room status：2=直播中）
      liveStatus: 2,
    });
    // 主直播流（HLS 优先）
    expect(result.data.url).toContain("pull-hls");
    // 多清晰度 FLV 流
    expect(result.data.liveQualities.length).toBeGreaterThan(0);
    expect(result.data.liveQualities[0].name).toBeTruthy();
    expect(result.data.liveQualities[0].url).toContain("pull-flv");
    // 封面与头像
    expect(result.data.cover).toContain("douyinpic.com");
    expect(result.data.avatar).toContain("douyinpic.com");
  });

  it("直播 reflow 页面：无有效数据时返回 null", () => {
    expect(parseLiveData("<html><body>no data</body></html>")).toBeNull();
    expect(parseLiveData("")).toBeNull();
  });
});
