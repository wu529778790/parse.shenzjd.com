/**
 * B 站视频直链识别（同构模块：前端 videoProxy 与服务端 video-proxy/结果缓存共用，
 * 零依赖，可进客户端 bundle）。
 *
 * 为什么不能只看域名：B 站 playurl 现在会在正式 CDN（*.bilivideo.com）与
 * mcdn/PCDN 调度节点之间轮换，后者是任意第三方域名（2026-11-01 实测出现
 * *.edge.mountaintoys.cn:4483），无法枚举。但所有 playurlv3 直链都带
 * upsig/uparams 签名参数，用它做兜底特征。
 */
export function isBilibiliVideoUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (
      host === "bilivideo.com" ||
      host.endsWith(".bilivideo.com") ||
      host === "bilivideo.cn" ||
      host.endsWith(".bilivideo.cn") ||
      // B 站的 Akamai 海外节点统一 upos- 前缀（upos-hz-mirrorakam 等）；
      // akamaized.net 是 Akamai 共享域，不能整域放行
      (host.startsWith("upos-") && host.endsWith(".akamaized.net"))
    ) {
      return true;
    }
    return u.searchParams.has("upsig") && u.searchParams.has("uparams");
  } catch {
    return false;
  }
}
