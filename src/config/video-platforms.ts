/** 前端下拉与样式（多平台） */
export const VIDEO_PLATFORMS = {
  douyin: {
    name: "抖音",
    emoji: "🎵",
    color: "#fe2c55",
    gradient: "from-[#fe2c55] to-[#ff6b8a]",
  },
  bilibili: {
    name: "哔哩哔哩",
    emoji: "🅱️",
    color: "#00aeec",
    gradient: "from-[#00aeec] to-[#4dc9ff]",
  },
  kuaishou: {
    name: "快手",
    emoji: "⚡",
    color: "#ff6600",
    gradient: "from-[#ff6600] to-[#ff9933]",
  },
  weibo: {
    name: "微博",
    emoji: "📱",
    color: "#e6162d",
    gradient: "from-[#e6162d] to-[#ff4d6a]",
  },
  lvzhou: {
    name: "绿洲",
    emoji: "🌿",
    color: "#31c27c",
    gradient: "from-[#31c27c] to-[#5fd99a]",
  },
  xhs: {
    name: "小红书",
    emoji: "📝",
    color: "#ff2442",
    gradient: "from-[#ff2442] to-[#ff5c7c]",
  },
  qsmusic: {
    name: "汽水音乐",
    emoji: "🎧",
    color: "#00c9b7",
    gradient: "from-[#00c9b7] to-[#00e5d4]",
  },
  pipigx: {
    name: "皮皮搞笑",
    emoji: "🤣",
    color: "#ff9f43",
    gradient: "from-[#ff9f43] to-[#ffc048]",
  },
  ppxia: {
    name: "皮皮虾",
    emoji: "🦐",
    color: "#ff6b6b",
    gradient: "from-[#ff6b6b] to-[#ff8787]",
  },
  huoshan: {
    name: "火山",
    emoji: "🌋",
    color: "#ff4757",
    gradient: "from-[#ff4757] to-[#ff6b81]",
  },
  weishi: {
    name: "微视",
    emoji: "📹",
    color: "#feca57",
    gradient: "from-[#feca57] to-[#ff9ff3]",
  },
  xigua: {
    name: "西瓜视频",
    emoji: "🍉",
    color: "#ff6348",
    gradient: "from-[#ff6348] to-[#ff7f50]",
  },
  zuiyou: {
    name: "最右",
    emoji: "➡️",
    color: "#5f27cd",
    gradient: "from-[#5f27cd] to-[#341f97]",
  },
  quanmin: {
    name: "度小视",
    emoji: "📲",
    color: "#3742fa",
    gradient: "from-[#3742fa] to-[#2f3542]",
  },
  lishipin: {
    name: "梨视频",
    emoji: "🍐",
    color: "#2ed573",
    gradient: "from-[#2ed573] to-[#7bed9f]",
  },
  huya: {
    name: "虎牙",
    emoji: "🐯",
    color: "#ff9f1a",
    gradient: "from-[#ff9f1a] to-[#ffbf69]",
  },
  acfun: {
    name: "AcFun",
    emoji: "🅰️",
    color: "#fd79a8",
    gradient: "from-[#fd79a8] to-[#fdcb6e]",
  },
  meipai: {
    name: "美拍",
    emoji: "💃",
    color: "#e056fd",
    gradient: "from-[#e056fd] to-[#686de0]",
  },
  doupai: {
    name: "逗拍",
    emoji: "🎬",
    color: "#00d2d3",
    gradient: "from-[#00d2d3] to-[#54a0ff]",
  },
  quanminkge: {
    name: "全民K歌",
    emoji: "🎤",
    color: "#fc5c65",
    gradient: "from-[#fc5c65] to-[#fd9644]",
  },
  sixroom: {
    name: "六间房",
    emoji: "6️⃣",
    color: "#a55eea",
    gradient: "from-[#a55eea] to-[#8854d0]",
  },
  xinpianchang: {
    name: "新片场",
    emoji: "🎞️",
    color: "#26de81",
    gradient: "from-[#26de81] to-[#20bf6b]",
  },
  haokan: {
    name: "好看视频",
    emoji: "👀",
    color: "#45aaf2",
    gradient: "from-[#45aaf2] to-[#4b7bec]",
  },
  twitter: {
    name: "X (Twitter)",
    emoji: "𝕏",
    color: "#14171a",
    gradient: "from-[#14171a] to-[#657786]",
  },
} as const;

export type VideoPlatformKey = keyof typeof VIDEO_PLATFORMS;
