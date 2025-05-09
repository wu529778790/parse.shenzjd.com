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
  data?: VideoItem[] | DouyinData;
  user?: User;
  platform?: "bilibili" | "douyin" | "kuaishou" | "weibo" | "xhs";
}

export interface DouyinData {
  author: string;
  avatar: string;
  cover: string;
  like: number;
  music: { author: string; title: string };
  time: number;
  title: string;
  uid: string;
  url: string;
}
