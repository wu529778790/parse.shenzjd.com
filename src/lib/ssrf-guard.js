/**
 * 内网/非法目标判定（防 SSRF），供所有「按用户给的 URL 去 fetch」的路由复用。
 *
 * 背景（2026-11-27 线上事故）：/api/image 与 /api/video-proxy 都是无登录态的
 * 服务器侧代理，video-proxy 一早就有这道守卫，image 只校验了协议 —— 当天
 * 01:38–06:59 被两个 IP 用 /api/image?url=http://172.17.0.x:port/... 扫了整个
 * docker 内网（522 次请求、242 次 200），读到 panhub 搜索接口、wx-auth 与各站点
 * 首页/JS。守卫只留一份实现，任何新增的代理路由都直接 import 它。
 *
 * 判定方式：字面量直判（IP/CIDR/特殊主机名）+ 域名 DNS 复查。
 * 注：校验与 fetch 各自解析一次 DNS 存在 TOCTOU 窗口，属尽力而为的防护；
 * 调用方还应对重定向逐跳复查（fetch 默认跟随跳转会绕过入口校验）。
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { logger } from "@/lib/api-utils";

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".home.arpa",
];

function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function inCidr(n, base, bits) {
  const size = 2 ** (32 - bits);
  return n >= base && n < base + size;
}

export function isPrivateIPv4(ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // 解析不出来按不安全处理
  return (
    inCidr(n, ipv4ToInt("0.0.0.0"), 8) || // 本网络
    inCidr(n, ipv4ToInt("10.0.0.0"), 8) ||
    inCidr(n, ipv4ToInt("100.64.0.0"), 10) || // CGNAT
    inCidr(n, ipv4ToInt("127.0.0.0"), 8) ||
    inCidr(n, ipv4ToInt("169.254.0.0"), 16) || // 链路本地（云元数据）
    inCidr(n, ipv4ToInt("172.16.0.0"), 12) ||
    inCidr(n, ipv4ToInt("192.0.0.0"), 24) ||
    inCidr(n, ipv4ToInt("192.0.2.0"), 24) ||
    inCidr(n, ipv4ToInt("192.168.0.0"), 16) ||
    inCidr(n, ipv4ToInt("198.18.0.0"), 15) ||
    inCidr(n, ipv4ToInt("198.51.100.0"), 24) ||
    inCidr(n, ipv4ToInt("203.0.113.0"), 24) ||
    inCidr(n, ipv4ToInt("224.0.0.0"), 4) || // 组播
    inCidr(n, ipv4ToInt("240.0.0.0"), 4) // 保留 + 广播
  );
}

export function isPrivateIPv6(ip) {
  const addr = ip.toLowerCase().split("%")[0];
  if (addr === "::1" || addr === "::") return true;
  // IPv4-mapped：::ffff:127.0.0.1 与 ::ffff:7f00:1 两种写法
  const mappedDotted = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) return isPrivateIPv4(mappedDotted[1]);
  const mappedHex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true; // fc00::/7 唯一本地
  if (/^fe[89ab][0-9a-f]:/.test(addr)) return true; // fe80::/10 链路本地
  if (/^ff[0-9a-f]{2}:/.test(addr)) return true; // ff00::/8 组播
  return false;
}

async function resolvesToPrivateAddress(hostname, label) {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length) return true;
    return records.some((r) =>
      r.family === 6 ? isPrivateIPv6(r.address) : isPrivateIPv4(r.address)
    );
  } catch (e) {
    // 解析失败不拦：紧接着的 fetch 用同一个解析器，同样会失败，不存在绕过收益。
    logger.warn(
      `${label} 目标域名解析失败（交给 fetch 兜底）: host=${hostname} err=${e.code || e.message}`
    );
    return false;
  }
}

/**
 * 目标主机是否不安全（内网 / 环回 / 链路本地 / 特殊主机名）。
 * 注意：`127.1`、`2130706433`、`0x7f.0.0.1` 这类非标准数字写法 isIP() 判不出，
 * 会走 DNS 复查分支，由 getaddrinfo 解析成 127.0.0.1 后再拦下。
 *
 * @param {string} hostname URL.hostname（IPv6 可带方括号）
 * @param {string} [label] 日志前缀，便于归因是哪个路由拦的
 * @returns {Promise<boolean>}
 */
export async function isUnsafeTarget(hostname, label = "ssrf-guard") {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return true;
  }
  const family = isIP(host);
  if (family === 4) return isPrivateIPv4(host);
  if (family === 6) return isPrivateIPv6(host);
  return resolvesToPrivateAddress(host, label);
}
