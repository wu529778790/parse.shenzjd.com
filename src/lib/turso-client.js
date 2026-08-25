/**
 * 极简 Turso (libsql) HTTP 客户端。
 *
 * 为什么自实现而不直接用 @libsql/client：
 * - Next.js standalone tracing 按 node 条件裁剪依赖，只保留 node.js 链路，
 *   CF 构建（opennext esbuild 按 workerd 条件打包）需要 web 链路文件
 *   （web.js、@libsql/isomorphic-ws 等），两者不一致导致 "Could not resolve"；
 * - 本项目仅使用 execute({ sql, args }) 一个操作，HTTP pipeline 协议足够，
 *   自实现后 Node/Docker 与 CF Workers 行为一致，且零第三方依赖。
 *
 * 协议参考 Turso HTTP API（libsql 的 /v2/pipeline）。
 */

/**
 * 创建客户端。url 形如 libsql://xxx.turso.io，token 为 Turso 认证 JWT。
 * 返回 { execute }，execute 返回 { rows }（rows 为数组的数组），
 * 与 @libsql/client 的 execute 返回形状对齐（本模块只用 rows）。
 */
export function createTursoClient({ url, authToken }) {
  if (!url || !authToken) {
    throw new Error("Turso client 需要 url 与 authToken");
  }
  const httpUrl = url.replace(/^libsql:\/\//i, "https://");

  return {
    async execute(input) {
      const stmt =
        typeof input === "string"
          ? { sql: input }
          : { sql: input.sql, args: (input.args || []).map(toValue) };
      const res = await fetch(`${httpUrl}/v2/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [{ type: "execute", stmt }],
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200);
        throw new Error(`Turso HTTP ${res.status}: ${detail}`);
      }
      const json = await res.json();
      const first = json?.results?.[0];
      if (first?.type === "error") {
        throw new Error(`Turso 执行错误: ${first.error?.message || "unknown"}`);
      }
      // 把 Value 枚举行组装为 { 列名: 值 } 对象（与 @libsql/client execute 返回形状对齐）
      const result = first?.response?.result;
      const cols = result?.cols || [];
      const rawRows = result?.rows || [];
      const rows = rawRows.map((r) => {
        const obj = {};
        cols.forEach((c, i) => {
          obj[c.name] = r[i]?.value;
        });
        return obj;
      });
      return { rows };
    },
  };
}

/**
 * 把 JS 值转换为 Turso HTTP pipeline 的 Value 枚举（internally tagged enum）。
 * 位置参数数组中每个元素必须是 { type, value } 结构。
 */
function toValue(arg) {
  if (arg === null || arg === undefined) return { type: "null", value: null };
  if (typeof arg === "string") return { type: "text", value: arg };
  if (typeof arg === "number") {
    return Number.isInteger(arg)
      ? { type: "integer", value: String(arg) }
      : { type: "real", value: String(arg) };
  }
  if (typeof arg === "boolean") return { type: "boolean", value: arg };
  return { type: "text", value: String(arg) };
}
