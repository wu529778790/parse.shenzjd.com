/**
 * 模拟 resty NoRedirectPolicy：取 3xx 的 Location（火山 / 西瓜等短链）
 */
export async function getRedirectLocation(url, headers = {}) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers,
  });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (loc) {
      return new URL(loc, url).href;
    }
  }
  return null;
}
