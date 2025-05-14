<?php
/**
*@Author: JH-Ahua
*@CreateTime: 2025/5/8 下午11:49
*@email: admin@bugpk.com
*@blog: www.jiuhunwl.cn
*@Api: api.bugpk.com
*@tip: 快手短视频去水印解析
*/
header('content-type:application/json; charset=utf-8');
// 格式化响应数据的函数
function formatResponse($code = 200, $msg = '解析成功', $data = [])
{
    return [
        'code' => $code,
        'msg' => $msg,
        'data' => $data
    ];
}


// 获取网页内容并解析 JSON 数据的函数
function kuaishou($url)
{
    // 定义请求头
    $headers = [
        'Cookie: 必填,
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0'
    ];
    $newurl = getRedirectedUrl($url);
    $response = '';
    $shortVideoPattern = '/short-video\/([^?]+)/';
    $photoPattern = '/photo\/([^?]+)/';

    if (preg_match($shortVideoPattern, $newurl, $matches)) {
        $id = $matches[1];
        $response = curl($url, $headers);
        while ($response === null) {
            $response = curl($url, $headers);
        }
    } elseif (preg_match($photoPattern, $newurl, $matches)) {
        $id = $matches[1];
        $response = curl("https://www.kuaishou.com/short-video/{$id}", $headers);
        while ($response === null) {
            $response = curl("https://www.kuaishou.com/short-video/{$id}", $headers);
        }
    }
    if ($response) {
        $apolloStatePattern = '/window\.__APOLLO_STATE__\s*=\s*(.*?)\<\/script>/s';
        if (preg_match($apolloStatePattern, $response, $matches)) {
            $functionPattern = '/function\s*\([^)]*\)\s*{[^}]*}/';
            $cleanedApolloState = preg_replace($functionPattern, ':', $matches[1]);
            $cleanedApolloState = preg_replace('/,\s*(?=}|])/', '', $cleanedApolloState);
            $charChainToRemove = ';(:());';
            $cleanedApolloState = str_replace($charChainToRemove, '', $cleanedApolloState);
            $cleanedApolloState = json_decode($cleanedApolloState, true);
            $videoInfo = $cleanedApolloState['defaultClient'] ?? null;
            if ($videoInfo) {
                $key = "VisionVideoDetailPhoto:{$id}";
                $json = $videoInfo[$key] ?? null;
                if ($json) {
                    $video_url = $json['photoUrl'];
                }
            }
        }
        if ($video_url) {
            $arr = array(
                'code' => 200,
                'msg' => '解析成功',
                'data' => array(
                    'title' => $json['caption'],
                    'cover' => $json['coverUrl'],
                    'url' => $video_url,
                )
            );
            return $arr;
        }
    }
}

function getRedirectedUrl($url)
{
    $ch = curl_init();
    // 设置请求的 URL
    curl_setopt($ch, CURLOPT_URL, $url);
    // 不返回响应体
    curl_setopt($ch, CURLOPT_NOBODY, true);
    // 跟随重定向
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    // 返回最终 URL
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    // 禁用 SSL 验证
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

    // 执行请求
    $result = curl_exec($ch);
    if ($result === false) {
        $error = curl_error($ch);
        curl_close($ch);
        trigger_error("cURL 执行出错: $error", E_USER_WARNING);
        return null;
    }

    // 获取重定向后的 URL
    $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    // 关闭 cURL 会话
    curl_close($ch);
    return $finalUrl;
}

function curl($url, $header = null, $data = null)
{
    $con = curl_init((string)$url);
    curl_setopt($con, CURLOPT_HEADER, false);
    curl_setopt($con, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($con, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($con, CURLOPT_FOLLOWLOCATION, 1);
    curl_setopt($con, CURLOPT_AUTOREFERER, 1);
    if (isset($header)) {
        curl_setopt($con, CURLOPT_HTTPHEADER, $header);
    }
    if (isset($data)) {
        curl_setopt($con, CURLOPT_POST, true);
        curl_setopt($con, CURLOPT_POSTFIELDS, $data);
    }
    curl_setopt($con, CURLOPT_TIMEOUT, 5000);
    $result = curl_exec($con);
    return $result;
}

// 获取 URL 参数
$url = $_GET['url'] ?? '';
if (empty($url)) {
    echo json_encode(formatResponse(201, '链接不能为空！'), 480);
} else {
    $jsonData = kuaishou($url);
    if (isset($jsonData)) {
        echo json_encode(formatResponse(200, '解析成功', $jsonData), 480);
    } else {
        echo json_encode(formatResponse(404, '链接错误'), 480);
    }
}
