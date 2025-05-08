const express = require("express");
const douyinRouter = require("./douyin");
const kuaishouRouter = require("./kuaishou");
const weiboRouter = require("./weibo");
const bilibiliRouter = require("./bilibili");
const pipigxRouter = require("./pipigx");
const xhsRouter = require("./xhs");
const qsmusicRouter = require("./qsmusic");
const ppxiaRouter = require("./ppxia");

const app = express();
const port = process.env.PORT || 3000;

// 设置CORS头
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// 路由
app.use("/api/douyin", douyinRouter);
app.use("/api/kuaishou", kuaishouRouter);
app.use("/api/weibo", weiboRouter);
app.use("/api/bilibili", bilibiliRouter);
app.use("/api/pipigx", pipigxRouter);
app.use("/api/xhs", xhsRouter);
app.use("/api/qsmusic", qsmusicRouter);
app.use("/api/ppxia", ppxiaRouter);

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    code: 500,
    msg: "服务器内部错误",
  });
});

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});
