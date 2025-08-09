// @ts-nocheck
import { describe, it, expect } from "vitest";
import { extractUrl, detectPlatform, hasValidVideoUrl } from "@/utils/share";

type Platform =
  | "douyin"
  | "kuaishou"
  | "weibo"
  | "xhs"
  | "bilibili"
  | "qsmusic";

interface ShareParseCase {
  name: string;
  input: string;
  expectPlatform: Platform;
  expectUrl: string | null;
}

const cases: ShareParseCase[] = [
  {
    name: "douyin-短链-带花字和时间",
    input:
      "5.35 去抖音看看【潮汕阿婷在花都的作品】潮汕人做生意厉害的口诀，再穷不打工再饿不要饭# 潮... https://v.douyin.com/kB9dI20w7vk/ m@d.AT Zm:/ 01/05",
    expectPlatform: "douyin",
    expectUrl: "https://v.douyin.com/kB9dI20w7vk/",
  },
  {
    name: "douyin-标准分享-iesdouyin",
    input:
      "复制此链接，打开抖音搜索，直接观看：https://www.iesdouyin.com/share/video/737373737373/",
    expectPlatform: "douyin",
    expectUrl: "https://www.iesdouyin.com/share/video/737373737373/",
  },
  {
    name: "douyin-直链-play接口",
    input:
      "直链（可能 302）：https://aweme.snssdk.com/aweme/v1/play/?video_id=v0300fg10000d0e6n7fog65p2cc1qbpg&ratio=720p&line=0",
    expectPlatform: "douyin",
    expectUrl:
      "https://aweme.snssdk.com/aweme/v1/play/?video_id=v0300fg10000d0e6n7fog65p2cc1qbpg&ratio=720p&line=0",
  },
  {
    name: "douyin-无协议短链",
    input: "v.douyin.com/kB9dI20w7vk/ 复制此链接",
    expectPlatform: "douyin",
    expectUrl: "v.douyin.com/kB9dI20w7vk/",
  },
  {
    name: "douyin-末尾中文标点",
    input: "看看这个：https://v.douyin.com/abc123/，真的不错！",
    expectPlatform: "douyin",
    expectUrl: "https://v.douyin.com/abc123/",
  },
  // 快手
  {
    name: "kuaishou-短链",
    input: "快手看看：https://v.kuaishou.com/abcdEF 开黑走起！",
    expectPlatform: "kuaishou",
    expectUrl: "https://v.kuaishou.com/abcdEF",
  },
  {
    name: "kuaishou-标准视频页",
    input: "https://www.kuaishou.com/short-video/3x7m8nbnxyg2s3q",
    expectPlatform: "kuaishou",
    expectUrl: "https://www.kuaishou.com/short-video/3x7m8nbnxyg2s3q",
  },
  // 微博
  {
    name: "weibo-视频页-tv-show",
    input:
      "微博视频：https://weibo.com/tv/show/1034:4912345678901234 这个观点很赞",
    expectPlatform: "weibo",
    expectUrl: "https://weibo.com/tv/show/1034:4912345678901234",
  },
  {
    name: "weibo-video域名",
    input:
      "https://video.weibo.com/show?fid=1034:4912345678901234&from=old_pc_videoshow",
    expectPlatform: "weibo",
    expectUrl:
      "https://video.weibo.com/show?fid=1034:4912345678901234&from=old_pc_videoshow",
  },
  // 小红书
  {
    name: "xhs-短链-xhslink",
    input: "小红书笔记：http://xhslink.com/A1B2C3，复制到小红书打开",
    expectPlatform: "xhs",
    expectUrl: "http://xhslink.com/A1B2C3",
  },
  {
    name: "xhs-标准笔记页",
    input:
      "https://www.xiaohongshu.com/explore/66f8f8f8f8f8f8f8f8f8f8f8?xhsshare=WeixinSession",
    expectPlatform: "xhs",
    expectUrl:
      "https://www.xiaohongshu.com/explore/66f8f8f8f8f8f8f8f8f8f8f8?xhsshare=WeixinSession",
  },
  // B站
  {
    name: "bilibili-短链-b23",
    input: "B站视频：https://b23.tv/abcDEFg 分享给你！",
    expectPlatform: "bilibili",
    expectUrl: "https://b23.tv/abcDEFg",
  },
  {
    name: "bilibili-BV号",
    input:
      "https://www.bilibili.com/video/BV1xx411c7mD/?spm_id_from=333.1007.tianma.1-1-1.click",
    expectPlatform: "bilibili",
    expectUrl:
      "https://www.bilibili.com/video/BV1xx411c7mD/?spm_id_from=333.1007.tianma.1-1-1.click",
  },
  {
    name: "bilibili-番剧-ep",
    input: "https://www.bilibili.com/bangumi/play/ep123456?from_spmid=666.25",
    expectPlatform: "bilibili",
    expectUrl:
      "https://www.bilibili.com/bangumi/play/ep123456?from_spmid=666.25",
  },
  // 汽水音乐
  {
    name: "qsmusic-标准分享",
    input:
      "这首歌好听：https://music.douyin.com/qishui/share/track?track_id=7031234567890123456",
    expectPlatform: "qsmusic",
    expectUrl:
      "https://music.douyin.com/qishui/share/track?track_id=7031234567890123456",
  },
  // 复杂/边界
  {
    name: "混合-多链接-优先第一个",
    input:
      "先看这个B站：https://b23.tv/xyz 然后这个抖音：https://v.douyin.com/xyz123/",
    expectPlatform: "bilibili",
    expectUrl: "https://b23.tv/xyz",
  },
  {
    name: "混合-带复制此链接提示",
    input: "复制此链接 https://v.douyin.com/xyz123/ 打开抖音搜索",
    expectPlatform: "douyin",
    expectUrl: "https://v.douyin.com/xyz123/",
  },
  {
    name: "混合-中文标点与换行",
    input:
      "看看：\nhttps://www.kuaishou.com/short-video/9x9x9x9x9x9，\n再看： https://weibo.com/tv/show/1034:4xxxxxxxxxxxxxxx。",
    expectPlatform: "kuaishou",
    expectUrl: "https://www.kuaishou.com/short-video/9x9x9x9x9x9",
  },
  {
    name: "无效-不包含支持平台域名",
    input: "这是一个普通文本，没有任何视频链接。",
    expectPlatform: "douyin",
    expectUrl: null,
  },
  {
    name: "同域多URL-取第一个",
    input: "https://v.douyin.com/abc111/ 再一个：https://v.douyin.com/abc222/",
    expectPlatform: "douyin",
    expectUrl: "https://v.douyin.com/abc111/",
  },
  {
    name: "URL后带英文标点",
    input: "https://b23.tv/abcdefg, 超好看！",
    expectPlatform: "bilibili",
    expectUrl: "https://b23.tv/abcdefg",
  },
];

describe("share utils", () => {
  it.each(cases)("%s", (c: ShareParseCase) => {
    // 平台检测
    expect(detectPlatform(c.input)).toBe(c.expectPlatform);
    // URL 提取
    const url = extractUrl(c.input);
    if (c.expectUrl === null) {
      expect(url).toBeNull();
    } else {
      expect(url).toBe(c.expectUrl);
    }
    // 是否包含有效域名
    expect(hasValidVideoUrl(c.input)).toBe(
      c.expectUrl !== null && c.expectUrl !== ""
    );
  });
});
