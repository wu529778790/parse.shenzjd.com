<?php
// API 说明页面
?><!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>ParseShort API 说明</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8f9fa; color: #222; margin: 0; padding: 0; }
        .container { max-width: 700px; margin: 40px auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 32px; }
        h1 { color: #0078d7; }
        table { width: 100%; border-collapse: collapse; margin-top: 24px; }
        th, td { border: 1px solid #e0e0e0; padding: 10px 8px; text-align: left; }
        th { background: #f0f4f8; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
        .tip { color: #888; font-size: 14px; margin-top: 16px; }
    </style>
</head>
<body>
<div class="container">
    <h1>ParseShort API 说明</h1>
    <p>本项目提供多种短视频/内容平台的解析API，所有接口均为GET请求，参数通过URL传递。</p>
    <table>
        <tr>
            <th>API名称</th>
            <th>用途</th>
            <th>示例</th>
        </tr>
        <tr><td>douyin.php</td><td>抖音视频去水印解析</td><td><code>/douyin.php?url=抖音分享链接</code></td></tr>
        <tr><td>xhs.php</td><td>小红书内容解析</td><td><code>/xhs.php?url=小红书分享链接</code></td></tr>
        <tr><td>ppxia.php</td><td>皮皮虾视频解析</td><td><code>/ppxia.php?url=皮皮虾分享链接</code></td></tr>
        <tr><td>qsmusic.php</td><td>QQ音乐解析</td><td><code>/qsmusic.php?url=QQ音乐分享链接</code></td></tr>
        <tr><td>weibo.php</td><td>微博内容解析</td><td><code>/weibo.php?url=微博分享链接</code></td></tr>
        <tr><td>ksimg.php</td><td>快手图片解析</td><td><code>/ksimg.php?url=快手图片链接</code></td></tr>
        <tr><td>kuaishou.php</td><td>快手视频解析</td><td><code>/kuaishou.php?url=快手视频链接</code></td></tr>
        <tr><td>pipigx.php</td><td>皮皮搞笑视频解析</td><td><code>/pipigx.php?url=皮皮搞笑分享链接</code></td></tr>
        <tr><td>bilibili.php</td><td>B站视频解析</td><td><code>/bilibili.php?url=B站视频链接</code></td></tr>
    </table>
    <div class="tip">
        <p>请将对应平台的分享链接替换到 <code>url=</code> 参数后面。</p>
        <p>所有接口均返回JSON格式数据。</p>
        <p>如需自定义端口或部署方式，请参考 <code>README.md</code>。</p>
    </div>
</div>
</body>
</html>
