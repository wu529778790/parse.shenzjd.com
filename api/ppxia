<?php
/**
*@Author: JH-Ahua
*@CreateTime: 2025/5/8 下午11:49
*@email: admin@bugpk.com
*@blog: www.jiuhunwl.cn
*@Api: api.bugpk.com
*@tip: 皮皮虾去水印解析
*/
// 设置响应头为 JSON 格式
header('content-type:application/json; charset=utf-8');

// 定义常量
const MAX_REDIRECTS = 10;
const CURL_TIMEOUT = 5000;

// 初始化 CURL 选项
function initCurlOptions($ch, $url, $header = null, $data = null) {
    curl_setopt($ch, CURLOPT_URL, (string)$url);
    curl_setopt($ch, CURLOPT_HEADER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);
    curl_setopt($ch, CURLOPT_AUTOREFERER, 1);
    curl_setopt($ch, CURLOPT_MAXREDIRS, MAX_REDIRECTS);
    curl_setopt($ch, CURLOPT_TIMEOUT, CURL_TIMEOUT);

    if (isset($header)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $header);
    }

    if (isset($data)) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
    }

    return $ch;
}

// 获取重定向后的 URL
function getRedirectUrl($url) {
    $ch = curl_init();
    $ch = initCurlOptions($ch, $url);
    curl_setopt($ch, CURLOPT_NOBODY, true);

    $result = curl_exec($ch);
    if ($result === false) {
        $error = curl_error($ch);
        curl_close($ch);
        throw new Exception("Curl error while getting redirect URL: $error");
    }

    $redirectUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);
    return $redirectUrl;
}

// 执行 CURL 请求
function curl($url, $header = null, $data = null) {
    $ch = curl_init();
    $ch = initCurlOptions($ch, $url, $header, $data);

    $result = curl_exec($ch);
    if ($result === false) {
        $error = curl_error($ch);
        curl_close($ch);
        throw new Exception("Curl error while making request: $error");
    }

    curl_close($ch);
    return $result;
}

function pipixia($url) {
    try {
        $url = getRedirectUrl($url);
        preg_match('/item\/(.*)\?/', $url, $id);
        if (!isset($id[1])) {
            return ['code' => 404, 'msg' => '无法从 URL 中提取视频 ID'];
        }

        $apiUrl = "https://h5.pipix.com/bds/cell/cell_h5_comment/?count=5&aid=1319&app_name=super&cell_id={$id[1]}";
        $response = curl($apiUrl);
        $arr = json_decode($response, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            return ['code' => 404, 'msg' => 'JSON 解析失败'];
        }

        if (is_array($arr) && isset($arr['data']['cell_comments'][1]['comment_info']['item'])) {
            $video_url = $arr['data']['cell_comments'][1]['comment_info']['item']['video']['video_high']['url_list'][0]['url'];
            $result = [
                'code' => 200,
                'msg' => '解析成功',
                'data' => [
                    'author' => $arr['data']['cell_comments'][1]['comment_info']['item']['author']['name'],
                    'avatar' => $arr['data']['cell_comments'][1]['comment_info']['item']['author']['avatar']['download_list'][0]['url'],
                    'title' => $arr['data']['cell_comments'][1]['comment_info']['item']['content'],
                    'cover' => $arr['data']['cell_comments'][1]['comment_info']['item']['cover']['download_list'][0]['url'],
                    'url' => $video_url
                ]
            ];
            return $result;
        } else {
            return ['code' => 404, 'msg' => '解析失败，未找到所需数据'];
        }
    } catch (Exception $e) {
        return ['code' => 404, 'msg' => '解析过程中出现错误: ' . $e->getMessage()];
    }
}

// 主程序
$result = [];
$url = isset($_GET['url']) ? $_GET['url'] : '';
if (empty($url)) {
    $result = ['code' => 201, 'msg' => '链接不能为空！'];
} else {
    $info = pipixia($url);
    $result = $info;
}

echo json_encode($result, 480);
?>
