# parse 统一接口（/api/parse）聚合记录

> 目的：以后所有平台的解析都会统一走 parse 统一接口（`/api/parse`）聚合。本文件逐平台记录
> 「测试链接 + 返回参数」，作为 parse 统一接口聚合改造的依据。**每修复/新增一个平台，就往这里追加一条。**

---

## 一、parse 统一接口现状（聚合逻辑）

### 1. 入口与流程

`GET /api/parse?url=<分享链接>`（或 `?source=<平台>&id=<ID>`）

```
请求 → identifyPlatform(识别平台) → getPlatformParser(动态加载平台解析器)
     → parser(input) 原样返回各平台结果
     → 补充 platform 字段 + 直链有效性验证
     → normalizeResult(出口归一化) → 返回
```

### 2. 目前聚合了多少东西？

**结论：parse 统一接口目前「基本原样返回」各平台解析器的结果，只做了两件事：**

| 处理 | 说明 | 位置 |
|------|------|------|
| 补充 `platform` 字段 | 结果无 `platform` 时补上平台 key | `parse/route.js` |
| 直链有效性验证 | 主直链明确 404/410 时置空 `url` | `parse/route.js` |
| 出口归一化 | 统一 `code=200` + `data` 统一字段（保留原始字段，新增统一字段） | `lib/normalize-result.ts` |

**没有做**：跨平台字段的深度聚合、字段裁剪、类型统一（如 `duration` 单位、`time` 格式等）。

### 3. 出口归一化（normalizeResult）做了什么

`lib/normalize-result.ts` 在出口层把各平台原始返回映射为统一字段，**保留原始字段**，新增统一字段：

| 统一字段 | 各平台原始字段（按优先级取第一个非空） |
|----------|----------------------------------------|
| `title` | `title` / `caption` / `name` / `videoTitle` |
| `desc` | `desc` / `description` |
| `author` | `author` / `authorName` / `actorNick` |
| `authorId` | `authorId` / `authorID` / `uid` |
| `cover` | `cover` / `coverUrl` / `imgurl` / `poster` / `videoCover` / `thumbnail` |
| `url` | `url` / `photoUrl` / `video` / `videoUrl` / `playUrl` / `mp4Url` |

> 例：抖音原始返回 `uid`，归一化后新增 `authorId`（值相同），`uid` 仍保留。

### 4. 统一响应模型（前端消费契约）

```json
{
  "code": 200,
  "msg": "解析成功",
  "platform": "douyin",
  "data": {
    "title": "标题",
    "desc": "描述",
    "author": "作者昵称",
    "authorId": "作者ID",
    "avatar": "作者头像",
    "cover": "封面图",
    "url": "主媒体直链（视频/音乐/单图）",
    "audioUrl": "音频直链",
    "images": ["图集（图文内容）"],
    "type": "video | image",
    "duration": "视频时长（毫秒）",
    "videos": "多分P/多清晰度列表（bilibili/合集）"
  }
}
```

---

## 二、平台记录

### 抖音（douyin）

**接口**：`GET /api/douyin?url=<链接>`（parse 统一入口：`GET /api/parse?url=<链接>`）

**支持的内容类型**：视频（video）、图文（image）、合集（mix）、直播（live）

#### 案例 1：图文（note）—— 宋钱来

- **测试链接**：`https://v.douyin.com/RdT8EVMUD8Q/`
- **类型**：`image`（图文）
- **返回参数**（`/api/douyin` 实测）：

```json
{
  "code": 200,
  "msg": "解析成功",
  "data": {
    "author": "宋钱来",
    "uid": "1801881115d",
    "avatar": "https://p11.douyinpic.com/aweme/100x100/aweme-avatar/...",
    "like": 345,
    "time": 1787960755,
    "title": "#AI职场风写真 #抖音ai创作全新升级",
    "cover": "https://p26-sign.douyinpic.com/tos-cn-i-0813/...",
    "type": "image",
    "images": [
      "https://p26-sign.douyinpic.com/tos-cn-i-0813/..."
    ],
    "duration": 0,
    "music": {
      "author": "财神送财祝你们发大财",
      "avatar": "https://p3.douyinpic.com/aweme/720x720/ies-music/..."
    },
    "authorId": "1801881115d"
  }
}
```

> 注：`authorId` 是出口归一化从 `uid` 映射新增的；`url` 字段为空（图文无视频，不返回背景音乐地址）。

#### 案例 2：图文（note）—— 王腾Thomas

- **测试链接**：`https://v.douyin.com/upsI7BKbus0/`
- **解析类型**：`image`（图文）
- **返回结果**（实测）：

```json
{
  "code": 200,
  "msg": "解析成功",
  "data": {
    "author": "王腾Thomas",
    "uid": "likesqdegg",
    "avatar": "https://p3.douyinpic.com/aweme/100x100/aweme-avatar/...",
    "type": "image",
    "time": 1788252200,
    "title": "今日宜休，宜启新程！ ...",
    "cover": "https://p3-sign.douyinpic.com/tos-cn-i-0813/...",
    "images": [
      "https://p3-sign.douyinpic.com/tos-cn-i-0813/..."
    ],
    "duration": 0,
    "music": {
      "author": "The",
      "avatar": "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/..."
    },
    "authorId": "likesqdegg"
  }
}
```

#### 案例 3：普通视频（video）—— 28未退休-

- **测试链接**：`https://v.douyin.com/Q91DiwQRPwM/`
- **类型**：`video`（普通视频）
- **返回参数**（`/api/douyin` 实测）：

```json
{
  "code": 200,
  "msg": "解析成功",
  "data": {
    "author": "28未退休-",
    "uid": "67062301578",
    "avatar": "https://p11.douyinpic.com/aweme/100x100/aweme-avatar/...",
    "like": 24180,
    "time": 1788171984,
    "title": "啊这个这个这个…… #加油华为加油china #遥遥领先",
    "cover": "https://p3-sign.douyinpic.com/tos-cn-p-0015/...",
    "type": "video",
    "url": "https://aweme.snssdk.com/aweme/v1/play/?video_id=v0200fg10000daald17og65t8kndlc9g&ratio=720p&line=0",
    "duration": 6268,
    "music": {
      "author": "＂＂",
      "avatar": "https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/..."
    },
    "authorId": "67062301578"
  }
}
```

> 注：普通视频返回 `url` 直链（`aweme.snssdk.com/aweme/v1/play/?video_id=...`，无水印）与 `duration`（毫秒）；无 `images` 字段。

#### 抖音返回字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `author` | string | 作者昵称 |
| `uid` | string | 作者唯一 ID（原始字段） |
| `authorId` | string | 归一化新增，值同 `uid` |
| `avatar` | string | 作者头像 |
| `like` | number | 点赞数 |
| `time` | number | 发布时间（Unix 秒） |
| `title` | string | 标题/描述 |
| `cover` | string | 封面图（图文取第一张图） |
| `type` | string | `video` / `image` |
| `url` | string | 视频直链（仅视频类型；图文为空） |
| `images` | string[] | 图集（仅图文类型） |
| `duration` | number | 视频时长（毫秒；图文为 0） |
| `music` | object | 背景音乐信息（`author` / `avatar`） |

#### 抖音其他内容类型（待补充）

- [x] 视频（video）—— 见案例 3
- [ ] 合集（mix，返回 `data.videos` 列表）
- [ ] 直播（live，返回 `data.liveQualities`）

---

## 三、待补充平台

> 每修复一个平台，按上面的格式追加一条记录（测试链接 + 实测返回 + 字段说明）。

- [ ] 哔哩哔哩（bilibili）
- [ ] 快手（kuaishou）
- [ ] 小红书（redbook / xhs）
- [ ] 微博（weibo）
- [ ] 汽水音乐（qsmusic）
- [ ] 皮皮虾（pipixia / ppxia）
- [ ] 皮皮搞笑（pipigx）
- [ ] 火山（huoshan）
- [ ] 微视（weishi）
- [ ] 西瓜视频（xigua）
- [ ] 最右（zuiyou）
- [ ] 度小视（quanmin）
- [ ] 梨视频（lishipin）
- [ ] 虎牙（huya）
- [ ] AcFun（acfun）
- [ ] 美拍（meipai）
- [ ] 逗拍（doupai）
- [ ] 全民K歌（quanminkge）
- [ ] 六间房（sixroom）
- [ ] 新片场（xinpianchang）
- [ ] 好看视频（haokan）
- [ ] X / Twitter（twitter）
- [ ] TikTok（tiktok）
- [ ] 汽水音乐（qsmusic）