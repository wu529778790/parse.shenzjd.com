<?php
/**
*@Author: JH-Ahua
*@CreateTime: 2025/5/8 下午11:49
*@email: admin@bugpk.com
*@blog: www.jiuhunwl.cn
*@Api: api.bugpk.com
*@tip: 皮皮搞笑去水印解析
*/
// 设置响应头为 JSON 格式，使用 UTF-8 编码
header("content-type:application/json; charset=utf-8");

/**
 * 格式化响应信息
 * @param int $code 响应状态码
 * @param string $msg 响应消息
 * @param array $data 响应数据
 * @return array 格式化后的响应数组
 */
function formatResponse($code = 200, $msg = '解析成功', $data = [])
{
    return [
        'code' => $code,
        'msg' => $msg,
        'data' => $data
    ];
}

/**
 * 从 URL 中提取 pid 和 mid 参数
 * @param string $url 输入的 URL
 * @return array|false 包含 pid 和 mid 的数组，若提取失败则返回 false
 */
function extractParamsFromUrl($url)
{
    $parsedUrl = parse_url($url);
    if (!isset($parsedUrl['query'])) {
        return false;
    }
    parse_str($parsedUrl['query'], $params);
    $pid = $params['pid'] ?? null;
    $mid = $params['mid'] ?? null;
    if ($pid === null || $mid === null) {
        return false;
    }
    return ['pid' => $pid, 'mid' => $mid];
}

/**
 * 发送 POST 请求到指定 API
 * @param string $apiurl API 的 URL
 * @param array $payload 请求体数据
 * @return array|false 包含响应信息和状态码的数组，若请求失败则返回 false
 */
function sendPostRequest($apiurl, $payload)
{
    $jsonPayload = json_encode($payload);
    $headers = [
        'Content-Type: application/json',
        'Content-Length: '. strlen($jsonPayload)
    ];
    $ch = curl_init($apiurl);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonPayload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if (curl_errno($ch)) {
        $error = curl_error($ch);
        curl_close($ch);
        return ['code' => 500, 'msg' => '请求发生错误: '. $error];
    }
    curl_close($ch);
    return ['code' => $httpCode, 'response' => $response];
}

/**
 * 处理 API 响应
 * @param array $apiResponse 包含 API 响应信息和状态码的数组
 * @return array 格式化后的响应数组
 */
function processApiResponse($apiResponse)
{
    $httpCode = $apiResponse['code'];
    $response = $apiResponse['response'];
    if ($httpCode >= 400) {
        return formatResponse($httpCode, 'HTTP 错误发生: HTTP 状态码 '. $httpCode);
    }
    $decodedResponse = json_decode($response, true);
    if ($decodedResponse === null) {
        return formatResponse(500, '响应内容不是有效的 JSON 数据: '. $response);
    }
    if (!isset($decodedResponse['data']['post'])) {
        return formatResponse(500, '响应中缺少 data.post 字段');
    }
    $json = $decodedResponse['data']['post'];
    $videoData = [];
    if (isset($json['videos']) && is_array($json['videos'])) {
        foreach ($json['videos'] as $video) {
            if (is_array($video)) {
                $videoData[] = $video;
            }
        }
    }
    $arr = [
        'title' => $json['content'],
        'cover' =>  "https://file.ippzone.com/img/frame/id/".($videoData[0]['thumb'] ?? ''),
        'video' => $videoData[0]['url']
    ];
    return formatResponse(200, '解析成功', $arr);
}

// 获取 URL 参数
$url = null;
if (isset($_GET['url'])) {
    $url = $_SERVER['REQUEST_URI'];
} elseif (isset($_POST['url'])) {
    $url = $_POST['url'];
}
if ($url === null) {
    http_response_code(400);
    echo json_encode(formatResponse(400, '未提供 url 参数'), 480);
    exit;
}

// 提取参数
$params = extractParamsFromUrl($url);
if ($params === false) {
    http_response_code(400);
    echo json_encode(formatResponse(400, '提取参数出错'), 480);
    exit;
}

// 构建请求体数据
$apiurl = 'https://h5.pipigx.com/ppapi/share/fetch_content';
$payload = [
    "pid" => (int)$params['pid'],
    "mid" => (int)$params['mid'],
    "type" => "post"
];

// 发送请求
$apiResponse = sendPostRequest($apiurl, $payload);
$finalResponse = processApiResponse($apiResponse);

// 设置 HTTP 状态码并输出响应
http_response_code($finalResponse['code']);
echo json_encode($finalResponse, 480);
?>
