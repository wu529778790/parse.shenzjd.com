# API 文档

短视频解析服务 API 文档

## 基础信息

- **Base URL**: `https://parse.shenzjd.com` 或本地 `http://localhost:3000`
- **响应格式**: JSON
- **跨域支持**: 所有接口均支持 CORS

## 通用响应格式

### 成功响应
```json
{
  "code": 200,
  "msg": "解析成功",
  "data": { ... },
  "platform": "douyin"
}
```

### 统一响应模型

所有平台的**成功响应**（`code` 恒为 `200`）在出口统一归一化，`data` 遵循同一套字段契约，前端与调用方只需消费以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 标题 |
| `desc` | string | 描述 |
| `author` | string | 作者昵称 |
| `authorId` | string | 作者 ID |
| `avatar` | string | 作者头像 |
| `cover` | string | 封面图 |
| `url` | string | 主媒体直链（视频/音乐/单图） |
| `audioUrl` | string | 音频直链（背景音乐/原声） |
| `images` | string[] | 图集（图文内容） |
| `type` | string | 内容类型：`video` / `image` |
| `duration` | number | 视频时长（毫秒） |
| `videos` | array | 多分P/多清晰度列表（bilibili） |
| `name` / `lyrics` / `core` / `copyright` | string | 音乐类扩展字段（汽水音乐） |

> 兼容说明：归一化**保留**各平台原始字段（如快手的 `photoUrl`、`caption` 等），同时新增上述统一字段，外部旧调用方不受影响。
>
> 历史变更：此前 bilibili 成功返回 `code: 1`、字段散落在顶层（`title`/`imgurl`/`user`）且 `data` 为分P数组——现已统一为 `code: 200` + 顶层字段移入 `data` + 分P 列表放入 `data.videos`。

### 错误响应
```json
{
  "code": 400,
  "msg": "错误描述信息"
}
```

### 状态码说明

| 状态码 | 含义 |
|--------|------|
| 200 | 解析成功 |
| 400 | 请求参数错误或解析失败 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

---

## API 接口

### 1. 抖音视频解析

**接口**: `GET /api/douyin`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 抖音视频链接 |

**支持的链接格式**:
- `https://v.douyin.com/xxx/`
- `https://www.iesdouyin.com/share/video/xxx/`
- `https://www.douyin.com/video/xxx`

**示例请求**:
```
GET /api/douyin?url=https://v.douyin.com/kB9dI20w7vk/
```

**响应示例**:
```json
{
  "code": 200,
  "msg": "解析成功",
  "platform": "douyin",
  "data": {
    "author": "作者昵称",
    "uid": "用户ID",
    "avatar": "头像URL",
    "like": 12345,
    "time": 1703980800,
    "title": "视频标题",
    "cover": "封面URL",
    "url": "视频播放地址",
    "music": {
      "author": "音乐作者",
      "avatar": "音乐封面"
    }
  }
}
```

---

### 2. 哔哩哔哩视频解析

**接口**: `GET /api/bilibili`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 哔哩哔哩视频链接 |

**支持的链接格式**:
- `https://b23.tv/xxx`
- `https://www.bilibili.com/video/BVxxx`
- `https://m.bilibili.com/video/BVxxx`

**示例请求**:
```
GET /api/bilibili?url=https://b23.tv/abcDEFg
```

**响应示例**:
```json
{
  "code": 200,
  "msg": "解析成功！",
  "platform": "bilibili",
  "data": {
    "title": "视频标题",
    "desc": "视频描述",
    "cover": "封面URL",
    "author": "UP主名称",
    "avatar": "UP主头像",
    "videos": [
      {
        "title": "P1",
        "url": "视频播放地址",
        "duration": 180,
        "durationFormat": "00:02:59",
        "accept": ["高清 1080P+", "高清 720P"]
      }
    ]
  }
}
```

> 注：已统一为 `code: 200`；分P 列表在 `data.videos`，作者信息在 `data.author` / `data.avatar`。

---

### 3. 快手视频解析

**接口**: `GET /api/kuaishou`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 快手视频链接 |

**支持的链接格式**:
- `https://v.kuaishou.com/xxx`
- `https://www.kuaishou.com/short-video/xxx`
- `https://www.kuaishou.com/photo/xxx`

**示例请求**:
```
GET /api/kuaishou?url=https://v.kuaishou.com/abcdEF
```

**响应示例**:
```json
{
  "code": 200,
  "msg": "解析成功",
  "platform": "kuaishou",
  "data": {
    "url": "视频播放地址",
    "title": "视频标题",
    "cover": "封面URL",
    "author": "作者名称"
  }
}
```

> 注：已统一为 `url` / `title` / `cover` / `author` 字段契约（原始 `photoUrl` / `caption` / `coverUrl` / `authorName` 字段仍保留）。

---

### 4. 微博视频解析

**接口**: `GET /api/weibo`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 微博视频链接 |

**支持的链接格式**:
- `https://weibo.com/tv/show/xxx`
- `https://video.weibo.com/show?fid=xxx`

**示例请求**:
```
GET /api/weibo?url=https://weibo.com/tv/show/1034:4912345678901234
```

**响应示例**:
```json
{
  "code": 200,
  "msg": "解析成功",
  "data": {
    "author": "作者名称",
    "avatar": "头像URL",
    "time": "发布时间",
    "title": "视频标题",
    "cover": "封面URL",
    "url": "视频播放地址"
  }
}
```

---

### 5. 小红书内容解析

**接口**: `GET /api/xhs`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 小红书内容链接 |

**支持的链接格式**:
- `https://www.xiaohongshu.com/explore/xxx`
- `http://xhslink.com/xxx`

**示例请求**:
```
GET /api/xhs?url=https://www.xiaohongshu.com/explore/66f8f8f8f8f8f8f8f8f8f8f8
```

**响应示例 (视频)**:
```json
{
  "code": 200,
  "msg": "解析成功",
  "data": {
    "author": "作者昵称",
    "authorID": "用户ID",
    "title": "内容标题",
    "desc": "内容描述",
    "avatar": "头像URL",
    "cover": "封面URL",
    "url": "视频播放地址",
    "type": "video"
  }
}
```

**响应示例 (图片)**:
```json
{
  "code": 200,
  "msg": "解析成功",
  "data": {
    "author": "作者昵称",
    "authorID": "用户ID",
    "title": "内容标题",
    "desc": "内容描述",
    "avatar": "头像URL",
    "cover": "封面URL",
    "images": ["图片1URL", "图片2URL"],
    "type": "image"
  }
}
```

---

### 6. 汽水音乐解析

**接口**: `GET /api/qsmusic`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 汽水音乐链接 |

**示例请求**:
```
GET /api/qsmusic?url=https://music.douyin.com/qishui/share/track?track_id=xxx
```

---

### 7. 皮皮虾视频解析

**接口**: `GET /api/pipigx`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 皮皮虾视频链接 |

---

### 8. 皮皮虾视频解析

**接口**: `GET /api/ppxia`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 皮皮虾视频链接 |

---

### 9. 健康检查

**接口**: `GET /api/health`

**说明**: 用于监控服务状态

**示例请求**:
```
GET /api/health
```

**响应示例**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "responseTime": 5
}
```

---

## 10. 解析行为统计

**接口**: `GET /api/stats`

**鉴权**: 需携带 `Authorization: Bearer <STATS_API_KEY>`；未配置 `STATS_API_KEY` 时返回 `403`。

**说明**: 返回所有解析记录（**成功与失败**）的分析结果——平台分布（含失败数）、近 14 天每日解析量、总量/成功/失败/独立访客（IP 匿名哈希）/独立链接数。数据由 `createApiHandler` 在每次解析结束（成功或失败）时异步写入 Turso（`parse_events` 表，`status` 区分 `success`/`failed`，`reason` 记录失败原因）。

**响应示例**:
```json
{
  "code": 200,
  "msg": "ok",
  "data": {
    "totals": { "total": 120, "success": 100, "failed": 20, "users": 34, "unique_links": 88 },
    "byPlatform": [
      { "platform": "douyin", "total": 50, "success": 45, "failed": 5 }
    ],
    "byDay": [
      { "day": "2024-01-01", "total": 10, "success": 8, "failed": 2 }
    ]
  }
}
```

> 提示：`failed` 数高的平台说明当前解析成功率偏低或存在未支持的内容类型，可针对性优化（查看失败 `reason` 需直接查询数据库 `parse_events` 表）。

---

## 限制说明

### 速率限制
- 每个 IP 每分钟最多 **60** 次请求（单次解析会触发多次上游请求，故阈值较高）
- 超出限制返回 `429` 状态码

### 缓存机制
- 成功解析的结果会被缓存 **5 分钟**
- 相同链接在缓存期内直接返回缓存结果

### 环境变量配置

如需完整功能，需配置以下环境变量：

```env
# 抖音
DOUYIN_COOKIE=your_cookie
DOUYIN_USER_AGENT=your_user_agent

# 哔哩哔哩
BILIBILI_COOKIE=your_cookie
BILIBILI_USER_AGENT=your_user_agent

# 微博
WEIBO_COOKIE=your_cookie

# 解析行为统计（Turso/libsql；未配置时记录功能自动禁用）
TURSO_DB_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_token
STATS_API_KEY=your_stats_key
```

> Cloudflare Workers 部署时：`BILIBILI_USER_AGENT` 已写入 `wrangler.toml` 的 `[vars]`；Cookie 类敏感值在 CI 中由 GitHub Secrets 自动 `wrangler secret put` 注入，无需手动配置。

---

## 错误处理

### 常见错误

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| url为空 | 未传入 url 参数 | 检查请求参数 |
| 无效的URL格式 | URL 格式错误 | 检查链接是否完整 |
| 请求过于频繁 | 超出速率限制 | 等待后重试 |
| 解析失败 | 平台接口变化或内容不可用 | 检查链接是否有效 |
| 服务器错误 | 服务器内部异常 | 稍后重试或联系管理员 |

---

## 使用示例

### JavaScript/TypeScript

```javascript
// 抖音解析示例
const response = await fetch('/api/douyin?url=' + encodeURIComponent('https://v.douyin.com/xxx/'));
const data = await response.json();

if (data.code === 200) {
  console.log('视频地址:', data.data.url);
} else {
  console.error('解析失败:', data.msg);
}
```

### cURL

```bash
# 抖音解析
curl "https://parse.shenzjd.com/api/douyin?url=https://v.douyin.com/xxx/"

# 健康检查
curl "https://parse.shenzjd.com/api/health"
```
