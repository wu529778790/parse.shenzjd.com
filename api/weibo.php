<?php
/**
*@Author: JH-Ahua
*@CreateTime: 2025/5/8 下午11:49
*@email: admin@bugpk.com
*@blog: www.jiuhunwl.cn
*@Api: api.bugpk.com
*@tip: 微博短视频去水印解析
*/
header('content-type:application/json; charset=utf-8');
function weibo($url)
    {
        if (strpos($url, 'show?fid=') != false) {
            preg_match('/fid=(.*)/', $url, $id);
            $arr = json_decode(weibo_curl($id[1]), true);
        } else {
            preg_match('/\d+\:\d+/', $url, $id);
            $arr = json_decode(weibo_curl($id[0]), true);
        }
        if ($arr) {
            $one = key($arr['data']['Component_Play_Playinfo']['urls']);
            $video_url = $arr['data']['Component_Play_Playinfo']['urls'][$one];
            $arr = [
                'code' => 200,
                'msg' => '解析成功',
                'data' => [
                    'author' => $arr['data']['Component_Play_Playinfo']['author'],
                    'avatar' => $arr['data']['Component_Play_Playinfo']['avatar'],
                    'time' => $arr['data']['Component_Play_Playinfo']['real_date'],
                    'title' => $arr['data']['Component_Play_Playinfo']['title'],
                    'cover' => $arr['data']['Component_Play_Playinfo']['cover_image'],
                    'url' => $video_url
                ]
            ];
            return $arr;
        }
    }

function weibo_curl($id)
    {
        $cookie = "填自己的cookie";
        $post_data = "data={\"Component_Play_Playinfo\":{\"oid\":\"$id\"}}";
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, "https://weibo.com/tv/api/component?page=/tv/show/" . $id);
        curl_setopt($ch, CURLOPT_COOKIE, $cookie);
        curl_setopt($ch, CURLOPT_REFERER, "https://weibo.com/tv/show/" . $id);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($ch, CURLOPT_ENCODING, 'gzip,deflate');
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $post_data);
        $output = curl_exec($ch);
        curl_close($ch);
        return $output;
    }
$result = [];
$url = $_GET['url'];
if (empty($url)){
    $result = ['code' => 201, 'msg' => '链接不能为空！'];
} else {
    $info = weibo($url);
    // 检查 $info 是否为数组
    if (is_array($info) && $info['code'] == 200){
        $result = $info;
    } else{
        $result = ['code' => 404, 'msg' => '解析失败！'];
    }
}
echo json_encode($result, 480);
?>
