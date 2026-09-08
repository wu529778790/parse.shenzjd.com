# bilibili-relay 云函数部署指南（事件函数版）

B站请求中继：海外服务器（新加坡）的 B站请求经本云函数（国内出口）转发，
绕过 B站对海外数据中心 IP 的 -412 风控。

## 一、部署云函数（腾讯云控制台）

1. **创建函数**：函数服务（SCF）→ 新建 → 自定义创建：
   - 函数类型：**事件函数**
   - 运行环境：**Node.js 18.15**（依赖内置 fetch，不能用 16 及以下）
   - 提交方法：本地上传 zip / 或在线编辑直接粘贴 `index.js` 内容
   - 函数入口保持默认 `index.handler`
   - 地域：**广州/上海/北京**（必须国内区）
   - 高级配置：内存 128MB，执行超时时间 **30 秒**
   - 环境变量：`RELAY_TOKEN=<随机串>`（与主站 `BILIBILI_RELAY_TOKEN` 一致）

2. **创建触发器**：函数详情 → 触发管理 → 创建触发器：
   - 触发方式：**API 网关触发器**
   - 请求方法：**ANY**（或 POST）
   - 发布环境：发布
   - **集成响应：必须勾选开启**（否则响应会被网关再包一层 JSON，主站解析不了）

3. **拿到 URL**：触发器创建后复制「访问路径」
   （形如 `https://service-xxxx-xxxx.gz.apigw.tencentcs.com/release/xxx`）。

4. **验证**（本机 curl，token 换成自己的）：
   ```bash
   curl -s -X POST "https://<网关路径>" \
     -H "Content-Type: application/json" \
     -H "X-Relay-Token: <RELAY_TOKEN>" \
     -d '{"url":"https://api.bilibili.com/x/web-interface/nav"}' | head -c 200
   ```
   返回 `{"status":200,...,"body":"..."}` 即成功；返回 error 检查 token / 集成响应是否开启。

## 二、主站配置

服务器 `/opt/1panel/.../parse.shenzjd.com/index/.env` 增加两行：

```
BILIBILI_RELAY_URL=https://<网关访问路径>
BILIBILI_RELAY_TOKEN=<与云函数 RELAY_TOKEN 一致>
```

重启容器后生效。主站优先级：`BILIBILI_RELAY_URL`（中继）> `BILIBILI_PROXY`（HTTP 代理）> 直连。

## 三、注意

- 中继仅放行 B站系域名（bilibili.com / b23.tv / hdslb.com / biliapi.net / bilivideo.com），
  不会沦为开放代理；RELAY_TOKEN 请保持随机、勿泄露。
- 云函数有免费额度（180万 GB·s/月），本中继流量极小，不会超。
- API 网关触发器每月有免费调用额度，超出后费用极低（百万次级别才几块钱）。
- 云函数出口 IP 段若未来被 B站风控，换地域重新部署即可（代码零改动）。
