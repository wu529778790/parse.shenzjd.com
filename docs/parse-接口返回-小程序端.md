# `/api/parse` 统一解析接口 —— 返回内容说明（小程序端）

> 本文档面向**微信小程序**开发，说明统一解析接口 `/api/parse` 的返回内容，
> 供小程序按返回字段做对应展示。**所有平台都走这一个接口**，由服务端自动识别平台并转发。

---

## 一、接口定位：聚合，不做业务逻辑

`/api/parse` 是一个**聚合接口**，只做两件事：

1. **识别平台**：根据分享链接的域名判断属于哪个平台（抖音 / 小红书 / B站 / 微博 / 汽水音乐 / X 等）。
2. **转发**：把链接交给对应平台的解析器，**原样返回**该平台的解析结果。

它**不做**跨平台的字段裁剪、类型统一、业务加工。各平台返回的字段可能不同，小程序需要**根据 `data.type` 字段**区分内容类型，再读取对应字段。

```
请求 /api/parse?url=<分享链接>
  → 识别平台（identifyPlatform）
  → 转发到对应平台解析器（getPlatformParser）
  → 补充 platform 字段 + 直链有效性验证
  → 出口归一化（normalizeResult，统一 code=200，保留原始字段）
  → 返回
```

---

## 二、调用方式

```
GET /api/parse?url=<分享链接>
```

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | string | 是 | 任意平台的分享链接（短链 / 长链均可） |

**示例**：

```
GET /api/parse?url=https://v.douyin.com/xxx/
GET /api/parse?url=https://xhslink.cn/o/xxx
GET /api/parse?url=https://b23.tv/xxx
GET /api/parse?url=https://qishui.douyin.com/s/xxx
```

---

## 三、统一响应模型

所有平台的成功响应（`code === 200`）都遵循以下外层结构：

```json
{
  "code": 200,
  "msg": "解析成功",
  "platform": "douyin",
  "data": { ... }
}
```

| 外层字段 | 类型 | 说明 |
|----------|------|------|
| `code` | number | 恒为 `200` 表示成功；`400` 参数/解析失败；`429` 限流；`500` 服务器错误 |
| `msg` | string | 提示信息 |
| `platform` | string | 平台 key（`douyin` / `redbook` / `bilibili` / `weibo` / `qsmusic` / `twitter` 等） |
| `data` | object | 解析结果，**字段因平台和内容类型而异** |

> **关键**：`data` 里的字段不是固定的，不同平台、不同内容类型返回不同字段。小程序必须**先看 `data.type`**，再决定读哪些字段。

---

## 四、`data` 字段详解（按内容类型）

`data.type` 是核心判断字段，取值有：`video`（视频）、`image`（图文）、`music`（音乐）、`text`（纯文字）。

### 1. 视频类型（`type === "video"`）

抖音、B站、微博、X、小红书视频等。

```json
{
  "type": "video",
  "title": "视频标题",
  "desc": "视频描述",
  "author": "作者昵称",
  "authorId": "作者ID",
  "avatar": "作者头像URL",
  "cover": "封面图URL",
  "url": "视频直链（无水印）",
  "duration": 6268,
  "images": []
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | `"video"` |
| `title` | string | 标题 |
| `desc` | string | 描述（部分平台有） |
| `author` | string | 作者昵称 |
| `authorId` | string | 作者 ID |
| `avatar` | string | 作者头像 |
| `cover` | string | 封面图 |
| `url` | string | **视频直链**（小程序可直接播放） |
| `duration` | number | 视频时长（毫秒） |
| `images` | array | 空数组（视频无图集） |

### 2. 图文类型（`type === "image"`）

小红书图文、微博图文、X 图文等返回：

```json
{
  "type": "image",
  "title": "内容标题",
  "desc": "内容描述",
  "author": "作者昵称",
  "authorId": "作者ID",
  "avatar": "作者头像URL",
  "cover": "第一张图URL",
  "url": "第一张图URL",
  "images": ["图1URL", "图2URL", "图3URL"]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | `"image"` |
| `title` | string | 标题 |
| `desc` | string | 描述 |
| `author` | string | 作者昵称 |
| `authorId` | string | 作者 ID |
| `avatar` | string | 作者头像 |
| `cover` | string | 封面（第一张图） |
| `url` | string | 第一张图 URL |
| `images` | array | **图集（核心字段，小程序轮播展示）** |

> 注意：图文类型**没有** `url` 视频直链，`url` 指向第一张图。小程序应展示 `images` 图集。

### 3. 音乐类型（`type === "music"`）

汽水音乐返回：

```json
{
  "type": "music",
  "name": "歌曲名",
  "title": "歌曲名（归一化映射）",
  "author": "歌手名",
  "cover": "专辑封面URL",
  "url": "音乐直链",
  "lyrics": "[00:00.000]歌词...",
  "core": "汽水音乐"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | `"music"` |
| `name` | string | 歌曲名（原始字段） |
| `title` | string | 歌曲名（归一化映射，值同 `name`） |
| `author` | string | 歌手名 |
| `cover` | string | 专辑封面 |
| `url` | string | **音乐直链（小程序可直接播放）** |
| `lyrics` | string | 歌词（LRC 格式，可选） |
| `core` | string | 平台标识 |

### 4. 纯文字类型（`type === "text"`）

微博、X 等纯文字内容（无视频无图）返回：

```json
{
  "type": "text",
  "title": "文字内容",
  "author": "作者昵称",
  "avatar": "作者头像URL"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | `"text"` |
| `title` | string | 文字内容 |
| `author` | string | 作者昵称 |
| `avatar` | string | 作者头像 |

> 纯文字无可下载媒体，小程序应展示提示而非尝试播放。

### 5. 多分P / 合集类型（`data.videos`）

B站、抖音合集返回 `data.videos` 列表：

```json
{
  "type": "video",
  "title": "合集标题",
  "author": "作者昵称",
  "avatar": "作者头像URL",
  "cover": "合集封面",
  "videos": [
    {
      "title": "第1集标题",
      "url": "视频直链",
      "cover": "视频封面",
      "duration": 176,
      "durationFormat": "02:56"
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `videos` | array | 分P/分集列表，每项含 `title` / `url` / `duration` / `durationFormat` |
| `videos[].url` | string | 该分P 的视频直链 |

> 判断依据：`data.videos` 存在且为数组时，按多分P 处理。

---

## 五、各平台返回字段速查

| 平台 | `platform` | 常见 `type` | 核心字段 |
|------|-----------|------------|---------|
| 抖音 | `douyin` | `video` / `image` | `url`（视频）/ `images`（图文）、`duration`、`music` |
| 小红书 | `redbook` | `video` / `image` | `url`（视频）、`images`（图文）、`cover` |
| B站 | `bilibili` | `video` | `videos[]`（分P）、`url` |
| 微博 | `weibo` | `video` / `image` / `text` | `url`（视频）、`images`（图文） |
| 汽水音乐 | `qsmusic` | `music` | `url`（音频）、`name`、`lyrics` |
| X / Twitter | `twitter` | `video` / `image` / `text` | `url`（视频）、`images`（图文） |
| 快手 | `kuaishou` | `video` | `url`、`cover` |
| 皮皮虾 | `pipixia` | `video` | `url` |
| 火山 | `huoshan` | `video` | `url` |
| 微视 | `weishi` | `video` | `url` |
| 西瓜视频 | `xigua` | `video` | `url` |
| 最右 | `zuiyou` | `video` | `url` |
| 度小视 | `quanmin` | `video` | `url` |
| 梨视频 | `lishipin` | `video` | `url` |
| 虎牙 | `huya` | `video` | `url` |
| AcFun | `acfun` | `video` | `url` |
| 美拍 | `meipai` | `video` | `url` |
| 逗拍 | `doupai` | `video` | `url` |
| 全民K歌 | `quanminkge` | `video` | `url` |
| 六间房 | `sixroom` | `video` | `url` |
| 新片场 | `xinpianchang` | `video` | `url` |
| 好看视频 | `haokan` | `video` | `url` |
| TikTok | `tiktok` | `video` | `url` |

---

## 六、小程序处理建议（伪代码）

```js
// 1. 请求
const res = await wx.request({
  url: 'https://parse.shenzjd.com/api/parse',
  data: { url: shareUrl }
});

// 2. 判断外层
if (res.data.code !== 200) {
  // 失败：展示 res.data.msg
  return;
}

const data = res.data.data;

// 3. 根据 type 处理
switch (data.type) {
  case 'video':
    // 有 videos 数组 → 多分P，展示列表
    if (Array.isArray(data.videos) && data.videos.length > 0) {
      // 展示分P列表，每项 data.videos[i].url
    } else {
      // 单视频：播放 data.url
    }
    break;

  case 'image':
    // 图文：轮播展示 data.images 图集
    break;

  case 'music':
    // 音乐：播放 data.url，展示 data.name / data.cover
    break;

  case 'text':
    // 纯文字：展示 data.title，提示无媒体
    break;

  default:
    // 未知类型，兜底
    break;
}
```

---

## 七、错误响应

```json
{
  "code": 400,
  "msg": "无法识别的视频平台，请确保链接格式正确"
}
```

| 状态码 | 含义 |
|--------|------|
| `200` | 解析成功 |
| `400` | 参数错误 / 无法识别平台 / 解析失败 |
| `429` | 请求过于频繁（限流） |
| `500` | 服务器内部错误 |

---

## 八、注意事项

1. **`data` 字段不固定**：不同平台、不同内容类型返回不同字段，务必先看 `data.type`。
2. **图文没有视频直链**：`type === "image"` 时 `url` 指向第一张图，应展示 `images` 图集。
3. **音乐用 `url` 播放**：`type === "music"` 时 `url` 是音频直链。
4. **多分P 用 `videos`**：`data.videos` 存在时按分集处理。
5. **`platform` 字段**：可用于展示平台标识，但**不要**依赖它判断内容类型，应以 `data.type` 为准。