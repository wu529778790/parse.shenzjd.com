# 短视频解析API

这是一个基于Node.js的短视频解析API服务，支持多个平台的视频解析。

## 支持的平台

- 抖音 (douyin)
- 快手 (kuaishou)
- 微博 (weibo)
- 哔哩哔哩 (bilibili)
- 皮皮虾 (pipigx)
- 小红书 (xhs)
- QQ音乐 (qsmusic)
- 皮皮虾 (ppxia)

## 安装

1. 确保已安装Node.js (推荐v14.0.0或更高版本)
2. 克隆项目到本地
3. 进入项目目录
4. 安装依赖：

```bash
npm install
```

## 配置

某些API可能需要配置cookie才能正常工作：

- 微博API: 设置环境变量 `WEIBO_COOKIE`
- 哔哩哔哩API: 设置环境变量 `BILIBILI_COOKIE`

## 运行

```bash
npm start
```

服务器将在 <http://localhost:3000> 上运行。

## API使用说明

所有API都接受GET请求，需要提供`url`参数。

### 抖音视频解析

```
GET /api/douyin?url=视频链接
```

### 快手视频解析

```
GET /api/kuaishou?url=视频链接
```

### 微博视频解析

```
GET /api/weibo?url=视频链接
```

### 哔哩哔哩视频解析

```
GET /api/bilibili?url=视频链接
```

### 皮皮虾视频解析

```
GET /api/pipigx?url=视频链接
```

### 小红书视频解析

```
GET /api/xhs?url=视频链接
```

### QQ音乐解析

```
GET /api/qsmusic?url=音乐链接&type=json
```

### 皮皮虾视频解析

```
GET /api/ppxia?url=视频链接
```

## 响应格式

所有API都返回JSON格式的响应，基本格式如下：

```json
{
    "code": 200,
    "msg": "解析成功",
    "data": {
        // 具体数据字段
    }
}
```

## 错误处理

- code: 200 - 成功
- code: 201 - 参数错误
- code: 404 - 解析失败
- code: 500 - 服务器错误

## 注意事项

1. 请确保遵守各平台的使用条款和API使用规范
2. 建议在生产环境中使用HTTPS
3. 可能需要定期更新cookie以保持API的正常工作
4. 建议添加适当的请求频率限制以防止滥用

## 许可证

MIT License
