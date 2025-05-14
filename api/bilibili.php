<?php
/**
*@Author: JH-Ahua
*@CreateTime: 2025/5/8 下午11:40
*@email: admin@bugpk.com
*@blog: www.jiuhunwl.cn
*@Api: api.bugpk.com
*@tip: bilibili视频解析
*/
header('Content-type: text/json;charset=utf-8');
$urls = isset($_GET['url']) ? $_GET['url'] : '';
if (empty($urls)){
    exit(json_encode(['code' => 201, 'msg' => '链接不能为空！']));
}
$urls =cleanUrlParameters($urls);
$array = parse_url($urls);
if (empty($array)) {
    exit(json_encode(['code'=>-1, 'msg'=>"视频链接不正确"], 480));
}elseif ($array['host'] == 'b23.tv') {
    $header = get_headers($urls,true);
    $array = parse_url($header['Location']);
    $bvid = $array['path'];
}elseif ($array['host'] == 'www.bilibili.com') {
    $bvid = $array['path'];
}elseif ($array['host'] == 'm.bilibili.com') {
    $bvid = $array['path'];
}else{
    exit(json_encode(['code'=>-1, 'msg'=>"视频链接好像不太对！"], 480));
}
if (strpos($bvid, '/video/') === false) {
    exit(json_encode(['code'=>-1, 'msg'=>"好像不是视频链接"], 480));
}
$bvid = str_replace("/video/", "", $bvid);
//这里填写你的B站cookie(不填解析不到1080P以上) 格式为_uuid=XXXXX
$cookie = '写自己的cookie';
$header = ['Content-type: application/json;charset=UTF-8'];
$useragent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36';
//获取解析需要的cid值和图片以及标题
$json1 = bilibili(
    'https://api.bilibili.com/x/web-interface/view?bvid='.$bvid
    , $header
    , $useragent
    , $cookie
);
$array = json_decode($json1,true);
if($array['code'] == '0'){
    //循环获取
    foreach($array['data']['pages'] as $keys =>$pron){
        //对接上面获取cid值API来取得视频的直链
        $json2 = bilibili(
            "https://api.bilibili.com/x/player/playurl?otype=json&fnver=0&fnval=3&player=3&qn=112&bvid=".$bvid."&cid=".$pron['cid']."&platform=html5&high_quality=1"
            , $header
            , $useragent
            , $cookie
        );
        $array_2 = json_decode($json2,true);
        $bilijson[] = [
            'title' =>  $pron['part']
            ,'duration' => $pron['duration']
            ,'durationFormat' => gmdate('H:i:s', $pron['duration']-1)
            ,'accept' => $array_2['data']['accept_description']
            ,'video_url' =>  'https://upos-sz-mirrorhw.bilivideo.com/'.explode('.bilivideo.com/',$array_2['data']['durl'][0]['url'])[1]
        ];
    }
    $JSON = array(
        'code' => 1
    ,'msg' => '解析成功！'
    ,'title' => $array['data']['title']
    ,'imgurl' => $array['data']['pic']
    ,'desc' => $array['data']['desc']
    ,'data' => $bilijson
    ,'user' => [
            'name' => $array['data']['owner']['name']
            , 'user_img' => $array['data']['owner']['face']
        ]
    );
}else{
    $JSON = ['code'=>0, 'msg'=>"解析失败！"];
}
exit(json_encode($JSON,480));
function bilibili($url, $header, $user_agent, $cookie) {
    $ch = curl_init() ;
    curl_setopt($ch, CURLOPT_URL, $url );
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true) ;
    curl_setopt($ch, CURLOPT_HTTPHEADER,$header);
    curl_setopt($ch, CURLOPT_USERAGENT,$user_agent);
    curl_setopt($ch, CURLOPT_COOKIE, $cookie);
    curl_setopt($ch, CURLOPT_BINARYTRANSFER, true) ;
    $output = curl_exec($ch) ;
    curl_close ($ch);
    return $output;
}
function cleanUrlParameters($url) {
    // Step 1: 分解URL结构
    $parsed = parse_url($url);

    // Step 2: 构建基础组件（自动解码编码字符）
    $scheme   = isset($parsed['scheme']) ? $parsed['scheme'] . '://' : '';
    $host     = $parsed['host'] ?? '';
    $port     = isset($parsed['port']) ? ':' . $parsed['port'] : '';
    $path     = isset($parsed['path']) ? rawurldecode($parsed['path']) : '';
    $fragment = isset($parsed['fragment']) ? '#' . rawurldecode($parsed['fragment']) : '';

    // Step 3: 处理国际化域名（Punycode转中文）
    if (function_exists('idn_to_utf8') && preg_match('/^xn--/', $host)) {
        $host = idn_to_utf8($host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46);
    }

    // Step 4: 移除认证信息（如 user:pass@）
    $host = preg_replace('/^.*@/', '', $host);

    // 去掉路径末尾的斜杠
    $path = rtrim($path, '/');

    // Step 5: 拼接最终URL
    return $scheme . $host . $port . $path . $fragment;
}
?>
