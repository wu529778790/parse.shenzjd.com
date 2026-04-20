/**
 * 统一平台配置
 * 参考: https://github.com/wujunwei928/parse-video
 */

// 平台常量
export const PLATFORMS = {
  DOUYIN: "douyin",
  KUAISHOU: "kuaishou",
  XHS: "redbook",
  PIPIXIA: "pipixia",
  HUOSHAN: "huoshan",
  WEISHI: "weishi",
  XIGUA: "xigua",
  ZUIYOU: "zuiyou",
  LISHI_PIN: "lishipin",
  PIPI_GX: "pipigx",
  HUYA: "huya",
  BILIBILI: "bilibili",
  WEIBO: "weibo",
  LVZHOU: "lvzhou",
  MEIPAI: "meipai",
  DOUPAI: "doupai",
  QUANMIN_KGE: "quanminkge",
  SIXROOM: "sixroom",
  XINPIANCHANG: "xinpianchang",
  HAOKAN: "haokan",
  ACFUN: "acfun",
  TWITTER: "twitter",
  QUANMIN: "quanmin", // 度小视
};

// 平台信息映射
export const PLATFORM_INFO = {
  [PLATFORMS.DOUYIN]: {
    name: "抖音",
    nameEn: "Douyin",
    domains: ["douyin.com", "iesdouyin.com"],
    shortDomains: ["v.douyin.com"],
    supportsIdParse: true,
  },
  [PLATFORMS.KUAISHOU]: {
    name: "快手",
    nameEn: "Kuaishou",
    domains: ["kuaishou.com", "kuaishoup.com"],
    shortDomains: ["v.kuaishou.com"],
    supportsIdParse: false,
  },
  [PLATFORMS.XHS]: {
    name: "小红书",
    nameEn: "Xiaohongshu",
    domains: ["xiaohongshu.com", "xhslink.com"],
    shortDomains: ["xhslink.com"],
    supportsIdParse: false,
  },
  [PLATFORMS.PIPIXIA]: {
    name: "皮皮虾",
    nameEn: "Pipixia",
    domains: ["pipix.com"],
    shortDomains: [],
    supportsIdParse: true,
  },
  [PLATFORMS.HUOSHAN]: {
    name: "火山小视频",
    nameEn: "Huoshan",
    domains: ["huoshan.com"],
    shortDomains: ["share.huoshan.com"],
    supportsIdParse: true,
  },
  [PLATFORMS.WEISHI]: {
    name: "微视",
    nameEn: "Weishi",
    domains: ["weishi.qq.com"],
    shortDomains: ["isee.weishi.qq.com"],
    supportsIdParse: true,
  },
  [PLATFORMS.XIGUA]: {
    name: "西瓜视频",
    nameEn: "Xigua",
    domains: ["ixigua.com"],
    shortDomains: ["v.ixigua.com"],
    supportsIdParse: true,
  },
  [PLATFORMS.ZUIYOU]: {
    name: "最右",
    nameEn: "Zuiyou",
    domains: ["izuiyou.com", "xiaochuankeji.com"],
    shortDomains: ["share.xiaochuankeji.cn"],
    supportsIdParse: false,
  },
  [PLATFORMS.LISHI_PIN]: {
    name: "梨视频",
    nameEn: "Lishipin",
    domains: ["pearvideo.com"],
    shortDomains: [],
    supportsIdParse: true,
  },
  [PLATFORMS.PIPI_GX]: {
    name: "皮皮搞笑",
    nameEn: "Pipigaoxiao",
    domains: ["pipigx.com"],
    shortDomains: ["h5.pipigx.com"],
    supportsIdParse: true,
  },
  [PLATFORMS.HUYA]: {
    name: "虎牙直播",
    nameEn: "Huya",
    domains: ["huya.com"],
    shortDomains: ["v.huya.com"],
    supportsIdParse: true,
  },
  [PLATFORMS.BILIBILI]: {
    name: "哔哩哔哩",
    nameEn: "Bilibili",
    domains: ["bilibili.com", "b23.tv"],
    shortDomains: ["b23.tv"],
    supportsIdParse: false,
  },
  [PLATFORMS.WEIBO]: {
    name: "微博",
    nameEn: "Weibo",
    domains: ["weibo.com", "m.weibo.com"],
    shortDomains: [],
    supportsIdParse: true,
  },
  [PLATFORMS.LVZHOU]: {
    name: "绿洲",
    nameEn: "Lvzhou",
    domains: ["weibo.cn"],
    shortDomains: [],
    supportsIdParse: true,
  },
  [PLATFORMS.MEIPAI]: {
    name: "美拍",
    nameEn: "Meipai",
    domains: ["meipai.com"],
    shortDomains: [],
    supportsIdParse: true,
  },
  [PLATFORMS.DOUPAI]: {
    name: "逗拍",
    nameEn: "Doupai",
    domains: ["doupai.cc"],
    shortDomains: [],
    supportsIdParse: true,
  },
  [PLATFORMS.QUANMIN_KGE]: {
    name: "全民K歌",
    nameEn: "Quanminkge",
    domains: ["kg.qq.com", "quanmin.kg.qq.com"],
    shortDomains: [],
    supportsIdParse: true,
  },
  [PLATFORMS.SIXROOM]: {
    name: "六间房",
    nameEn: "Sixroom",
    domains: ["6.cn"],
    shortDomains: [],
    supportsIdParse: true,
  },
  [PLATFORMS.XINPIANCHANG]: {
    name: "新片场",
    nameEn: "Xinpianchang",
    domains: ["xinpianchang.com"],
    shortDomains: [],
    supportsIdParse: false,
  },
  [PLATFORMS.HAOKAN]: {
    name: "好看视频",
    nameEn: "Haokan",
    domains: ["haokan.baidu.com", "haokan.hao123.com"],
    shortDomains: [],
    supportsIdParse: true,
  },
  [PLATFORMS.ACFUN]: {
    name: "AcFun",
    nameEn: "Acfun",
    domains: ["acfun.cn"],
    shortDomains: [],
    supportsIdParse: true,
  },
  [PLATFORMS.TWITTER]: {
    name: "Twitter/X",
    nameEn: "Twitter",
    domains: ["twitter.com", "x.com", "t.co"],
    shortDomains: ["t.co"],
    supportsIdParse: true,
  },
  [PLATFORMS.QUANMIN]: {
    name: "度小视",
    nameEn: "Quanmin",
    domains: ["quanmin.baidu.com", "xspshare.baidu.com"],
    shortDomains: ["xspshare.baidu.com"],
    supportsIdParse: true,
  },
};

// 从 URL 识别平台
export function identifyPlatform(url) {
  const hostname = new URL(url).hostname.toLowerCase();

  for (const [platform, info] of Object.entries(PLATFORM_INFO)) {
    // 检查主域名
    if (info.domains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
      return platform;
    }
    // 检查短域名
    if (info.shortDomains?.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
      return platform;
    }
  }

  return null;
}

// 获取平台信息
export function getPlatformInfo(platform) {
  return PLATFORM_INFO[platform] || null;
}

// 获取平台名称
export function getPlatformName(platform) {
  return PLATFORM_INFO[platform]?.name || platform;
}

// 获取所有支持 ID 解析的平台
export function getPlatformsSupportingIdParse() {
  return Object.entries(PLATFORM_INFO)
    .filter(([, info]) => info.supportsIdParse)
    .map(([platform]) => platform);
}

// 平台域名列表（用于 URL 验证）
export const ALL_DOMAINS = [
  // 主域名
  "douyin.com",
  "iesdouyin.com",
  "kuaishou.com",
  "xiaohongshu.com",
  "pipix.com",
  "huoshan.com",
  "weishi.qq.com",
  "ixigua.com",
  "izuiyou.com",
  "xiaochuankeji.com",
  "pearvideo.com",
  "pipigx.com",
  "huya.com",
  "bilibili.com",
  "weibo.com",
  "m.weibo.com",
  "weibo.cn",
  "meipai.com",
  "doupai.cc",
  "kg.qq.com",
  "quanmin.kg.qq.com",
  "6.cn",
  "xinpianchang.com",
  "haokan.baidu.com",
  "haokan.hao123.com",
  "acfun.cn",
  "twitter.com",
  "x.com",
  "t.co",
  "quanmin.baidu.com",
  "xspshare.baidu.com",
  // 短链接域名
  "v.douyin.com",
  "v.kuaishou.com",
  "xhslink.com",
  "v.ixigua.com",
  "share.xiaochuankeji.cn",
  "share.huoshan.com",
  "isee.weishi.qq.com",
  "h5.pipigx.com",
  "v.huya.com",
  "b23.tv",
];
