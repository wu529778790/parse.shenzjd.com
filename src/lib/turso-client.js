/**
 * 极简 Turso (libsql) HTTP 客户端。
 *
 * 为什么自实现而不直接用 @libsql/client：
 * - Next.js standalone tracing 按 node 条件裁剪依赖，只保留 node.js 链路，
 *   CF 构建（opennext esbuild 按 workerd 条件打包）需要 web 链路文件
 *   （web.js、@libsql/isomorphic-ws 等），两者不一致导致 "Could not resolve"；
 * - 本项目仅使用 execute({ sql, args }) / batch([...]) 两个操作，
 *   HTTP pipeline 协议足够，自实现后 Node/Docker 与 CF Workers 行为一致，
 *   且零第三方依赖。
 *
 * 协议参考 Turso HTTP API（libsql 的 /v2/pipeline）。
 */

/**
 * 创建客户端。url 形如 libsql://xxx.turso.io，token 为 Turso 认证 JWT。
 * 返回 { execute, batch }：
 * - execute(input)  → { rows }（rows 为列名 → 值的对象数组，与 @libsql/client 对齐）
 * - batch(inputs)   → 一次 HTTP 请求按序执行多条语句（analytics 攒批刷写用）
 */
export function createTursoClient({ url, authToken }) {
  if (!url || !authToken) {
    throw new Error("Turso client 需要 url 与 authToken");
  }
  const httpUrl = url.replace(/^libsql:\/\//i, "https://");

  function toRequest(input) {
    const stmt =
      typeof input === "string"
        ? { sql: input }
        : { sql: input.sql, args: (input.args || []).map(toValue) };
    return { type: "execute", stmt };
  }

  async function pipeline(requests) {
    const res = await fetch(`${httpUrl}/v2/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new Error(`Turso HTTP ${res.status}: ${detail}`);
    }
    const json = await res.json();
    return json?.results || [];
  }

  function rowsOf(result) {
    const cols = result?.cols || [];
    const rawRows = result?.rows || [];
    return rawRows.map((r) => {
      const obj = {};
      cols.forEach((c, i) => {
        obj[c.name] = r[i]?.value;
      });
      return obj;
    });
  }

  return {
    async execute(input) {
      const results = await pipeline([toRequest(input)]);
      const first = results[0];
      if (first?.type === "error") {
        throw new Error(`Turso 执行错误: ${first.error?.message || "unknown"}`);
      }
      const result = first?.response?.result;
      return { rows: rowsOf(result) };
    },

    async batch(inputs) {
      if (!Array.isArray(inputs) || inputs.length === 0) return [];
      const results = await pipeline(inputs.map(toRequest));
      const firstError = results.find((r) => r?.type === "error");
      if (firstError) {
        throw new Error(
          `Turso 批量执行错误: ${firstError.error?.message || "unknown"}`
        );
      }
      return results;
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
