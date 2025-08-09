export interface VideoItem {
  title: string;
  duration: number;
  durationFormat: string;
  accept: string[];
  video_url: string;
}

export interface User {
  name: string;
  user_img: string;
}

export interface ApiResponse {
  code: number;
  msg: string;
  title?: string;
  imgurl?: string;
  desc?: string;
  data?:
    | VideoItem[]
    | DouyinData
    | KuaishouData
    | WeiboData
    | XhsData
    | QsMusicData
    | PipigxData
    | PpxiaData;
  user?: User;
  platform?:
    | "bilibili"
    | "douyin"
    | "kuaishou"
    | "weibo"
    | "xhs"
    | "qsmusic"
    | "pipigx"
    | "ppxia";
}

export interface DouyinData {
  author: string;
  avatar: string;
  cover: string;
  like: number;
  music: { author: string; avatar: string };
  time: number;
  title: string;
  uid: string;
  url: string;
}

// 快手数据类型
export interface KuaishouData {
  photoUrl: string;
  caption: string;
  coverUrl: string;
  source?: string;
  authorName?: string;
}

// 微博数据类型
export interface WeiboData {
  author: string;
  avatar: string;
  time: string;
  title: string;
  cover: string;
  url: string;
}

// 小红书数据类型
export interface XhsData {
  author: string;
  authorID: string;
  title: string;
  desc: string;
  avatar: string;
  cover: string;
  url?: string; // 视频URL，对于图片内容可能为空
  images?: string[]; // 图片URL数组
  type?: "video" | "image"; // 内容类型
}

// QQ音乐数据类型
export interface QsMusicData {
  name: string;
  url: string;
  cover: string;
  lyrics: string;
  core: string;
  copyright: string;
}

// 皮皮虾数据类型（pipigx）
export interface PipigxData {
  title: string;
  cover: string;
  video: string;
}

// 皮皮虾数据类型（ppxia）
export interface PpxiaData {
  author: string;
  avatar: string;
  title: string;
  cover: string;
  url: string;
}
