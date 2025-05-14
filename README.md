# ParseShort API Docker 部署说明

本项目的 `api` 目录下包含多个 PHP API 脚本，Docker 部署后可直接通过端口访问各个脚本。

## 构建镜像

```bash
# 在项目根目录下执行
docker build -t parse-short-api .
```

## 运行容器

```bash
docker run -d -p 8080:8080 --name parse-short-api parse-short-api
```

## 访问 API

容器启动后，可通过如下方式访问各个 API 脚本（无需 /api 前缀）：

| API 文件      | 访问地址                          |
|---------------|-----------------------------------|
| xhs.php       | <http://localhost:8080/xhs.php>     |
| ppxia         | <http://localhost:8080/ppxia>       |
| qsmusic       | <http://localhost:8080/qsmusic>     |
| weibo         | <http://localhost:8080/weibo>       |
| ksimg         | <http://localhost:8080/ksimg>       |
| kuaishou      | <http://localhost:8080/kuaishou>    |
| pipigx        | <http://localhost:8080/pipigx>      |
| bilibili      | <http://localhost:8080/bilibili>    |
| douyin        | <http://localhost:8080/douyin>      |

将对应的 API 文件名添加到访问地址后即可访问。

---

如需自定义端口，请修改 Dockerfile 中的 `EXPOSE` 和 `CMD`，或在运行容器时调整 `-p` 参数。
