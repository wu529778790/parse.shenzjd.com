<?php
/**
*@Author: JH-Ahua
*@CreateTime: 2025/5/8 下午11:49
*@email: admin@bugpk.com
*@blog: www.jiuhunwl.cn
*@Api: api.bugpk.com
*@tip: 小红书短视频去水印解析
*/
header('Content-type: application/json');

// 定义统一的输出函数
function output($code, $msg, $data = []) {
    return json_encode([
        'code' => $code,
        'msg' => $msg,
        'data' => $data
    ], 480);
}

function xhs($url) {
    // 构造请求数据
    $header = [
        'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0'
    ];

    // 发送请求获取视频信息
    $response = curl($url, $header);
    if (!$response) {
        return output(400, '请求失败');
    }

    // 优化正则表达式
    $pattern = '/<script>\s*window.__INITIAL_STATE__\s*=\s*({[\s\S]*?})<\/script>/is';
    if (preg_match($pattern, $response, $matches)) {
        $jsonData = $matches[1];
        // 将 undefined 替换为 null
        $jsonData = str_replace('undefined', 'null', $jsonData);

        // 尝试将匹配到的字符串解析为 JSON
        $decoded = json_decode($jsonData, true);
        if ($decoded) {
            $videourl = $decoded['noteData']['data']['noteData']['video']['media']['stream']['h265'][0]['masterUrl'] ?? '';
            if ($videourl) {
                $data = [
                    'author' => $decoded['noteData']['data']['noteData']['user']['nickName'] ?? '',
                    'authorID' => $decoded['noteData']['data']['noteData']['user']['userId'] ?? '',
                    'title' => $decoded['noteData']['data']['noteData']['title'] ?? '',
                    'desc' => $decoded['noteData']['data']['noteData']['desc'] ?? '',
                    'avatar' => $decoded['noteData']['data']['noteData']['user']['avatar'] ?? '',
                    'cover' => $decoded['noteData']['data']['noteData']['imageList'][0]['url'] ?? '',
                    'url' => $videourl
                ];
                return output(200, '解析成功', $data);
            } else {
                return output(404, '解析失败，未获取到视频链接');
            }
        } else {
            return output(400, '匹配到的内容不是有效的 JSON 数据');
        }
    } else {
        return output(400, '未找到 JSON 数据');
    }
}

function curl($url, $header = null, $data = null) {
    $con = curl_init((string)$url);
    curl_setopt($con, CURLOPT_HEADER, false);
    curl_setopt($con, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($con, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($con, CURLOPT_FOLLOWLOCATION, 1);
    curl_setopt($con, CURLOPT_AUTOREFERER, 1);
    if ($header) {
        curl_setopt($con, CURLOPT_HTTPHEADER, $header);
    }
    if ($data) {
        curl_setopt($con, CURLOPT_POST, true);
        curl_setopt($con, CURLOPT_POSTFIELDS, $data);
    }
    curl_setopt($con, CURLOPT_TIMEOUT, 5000);
    $result = curl_exec($con);
    if ($result === false) {
        // 处理 curl 错误
        $error = curl_error($con);
        curl_close($con);
        trigger_error("cURL error: $error", E_USER_WARNING);
        return false;
    }
    curl_close($con);
    return $result;
}

// 获取请求参数
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $url = $_GET['url']?? null;
} else {
    $url = $_POST['url']?? null;
}
if (empty($url)) {
    echo output(201, 'url 为空');
} else {
    echo xhs($url);
}
?>
