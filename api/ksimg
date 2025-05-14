<?php
/**
*@Author: JH-Ahua
*@CreateTime: 2025/5/9 上午12:18
*@email: admin@bugpk.com
*@blog: www.jiuhunwl.cn
*@Api: api.bugpk.com
*@tip: 快手图文解析
*/
header('Content-type: application/json');

/**
 * 从快手链接中提取图片信息
 *
 * @param string $url 快手链接
 * @return array 包含图片信息的数组
 */
function kuaishou($url)
{
    $headers = [
        'Cookie: 写自己的cookie',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0'
    ];
    $redirectUrl = get_headers($url, 1)['Location']?? '';
    if (empty($redirectUrl)) {
        return [];
    }

    $pageContent = curl($redirectUrl,$headers);
    if ($pageContent === false) {
        return [];
    }

    $apolloStatePattern = '/window\.INIT_STATE\s*=\s*(.*?)\<\/script>/s';
    if (preg_match($apolloStatePattern, $pageContent, $matches)) {
        $jsonString = stripslashes($matches[1]);
        $data = json_decode($jsonString, true);
        $filteredData = filterData($data);

        $firstValue = !empty($filteredData)? json_encode(reset($filteredData)) : '{}';
        $imgjson = json_decode($firstValue, true);
        $imageList = $imgjson['photo']['ext_params']['atlas']['list']?? [];
        $music = 'http://txmov2.a.kwimgs.com'.$imgjson['photo']['ext_params']['atlas']['music'];
        $images = [];
        foreach ($imageList as $imagePath) {
            $images[] = 'http://tx2.a.yximgs.com/' . $imagePath;
        }

        if (!empty($imageList)) {
            return [
                'code' => 200,
                'msg' => 'success',
                'count' => count($imageList),
                'music' => $music,
                'images' => $images
            ];
        }
    }

    return [];
}

/**
 * 过滤数据，只保留以 'tusjoh' 开头且包含 'fid' 的键值对
 *
 * @param array $data 要过滤的数据
 * @return array 过滤后的数据
 */
function filterData($data)
{
    $filteredData = [];
    foreach ($data as $key => $value) {
        if (strpos($key, 'tusjoh') === 0 && isset($value['fid'])) {
            $filteredData[$key] = $value;
        }
    }
    return $filteredData;
}

/**
 * 使用 curl 发起 HTTP 请求
 *
 * @param string $url 请求的 URL
 * @param array|null $header 请求头
 * @param array|null $data 请求数据
 * @return string|false 请求结果或 false（请求失败）
 */
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

    if ($result === false) {
        // 记录错误信息
        error_log('Curl error: '. curl_error($con));
    }

    curl_close($con);
    return $result;
}

$url = $_GET['url']?? '';
if (empty($url)) {
    echo json_encode(['code' => 201, 'msg' => 'url为空'], 480);
} else {
    $response = kuaishou($url);
    if (empty($response)) {
        echo json_encode(['code' => 404, 'msg' => '获取失败'], 480);
    } else {
        echo json_encode($response, 480);
    }
}
