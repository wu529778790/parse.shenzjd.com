export const runtime = "edge";

function formatResponse(code = 200, msg = "解析成功", data = []) {
  return {
    code,
    msg,
    data,
  };
}

async function kuaishou(url) {
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    };

    console.log("原始URL:", url);

    // 获取重定向后的URL
    const newurl = await getRedirectedUrl(url);
    console.log("重定向后的URL:", newurl);

    let response = "";
    let id = "";

    // 支持多种URL格式
    const patterns = [
      {
        name: "short-video",
        regex: /short-video\/([^?]+)/,
        template: (videoId) =>
          `https://www.kuaishou.com/short-video/${videoId}`,
      },
      {
        name: "photo",
        regex: /photo\/([^?]+)/,
        template: (videoId) =>
          `https://www.kuaishou.com/short-video/${videoId}`,
      },
      { name: "f-format", regex: /\/f\/([^?]+)/, template: () => newurl }, // 使用重定向后的URL
      { name: "profile", regex: /profile\/([^?]+)/, template: () => newurl },
      { name: "video", regex: /video\/([^?]+)/, template: () => newurl },
    ];

    let matchedPattern = null;
    let requestUrl = newurl;

    // 尝试匹配不同的URL格式
    for (const pattern of patterns) {
      const match = url.match(pattern.regex) || newurl.match(pattern.regex);
      if (match) {
        id = match[1];
        requestUrl = pattern.template(id);
        matchedPattern = pattern.name;
        console.log(
          `匹配到${pattern.name}格式，ID: ${id}, 请求URL: ${requestUrl}`
        );
        break;
      }
    }

    if (!matchedPattern) {
      console.log("未匹配到任何已知格式，使用重定向URL");
      requestUrl = newurl;
    }

    // 请求页面内容
    response = await makeRequest(requestUrl, headers);

    if (!response) {
      console.log("第一次请求失败，尝试原始URL");
      response = await makeRequest(url, headers);
    }

    if (response) {
      console.log("获取到页面内容，长度:", response.length);

      // 尝试解析视频信息
      const result = await parseVideoInfo(response, id);

      if (result) {
        return result;
      }

      // 如果解析失败，尝试其他方法
      console.log("标准解析失败，尝试其他方法");

      // 方法1：查找JSON数据
      const jsonMatch = response.match(/"photoUrl":"([^"]+)"/);
      if (jsonMatch) {
        const photoUrl = jsonMatch[1].replace(/\\u002F/g, "/");
        console.log("通过JSON匹配找到视频URL:", photoUrl);

        return formatResponse(200, "解析成功", {
          title: "快手视频",
          cover: "",
          url: photoUrl,
        });
      }

      // 方法2：查找其他视频URL格式
      const videoUrlPatterns = [
        /"playUrl":"([^"]+)"/,
        /"videoUrl":"([^"]+)"/,
        /"mp4Url":"([^"]+)"/,
        /video['"]\s*:\s*['"](https?:\/\/[^'"]+)/,
      ];

      for (const pattern of videoUrlPatterns) {
        const match = response.match(pattern);
        if (match) {
          const videoUrl = match[1].replace(/\\u002F/g, "/").replace(/\\/g, "");
          console.log("通过模式匹配找到视频URL:", videoUrl);

          return formatResponse(200, "解析成功", {
            title: "快手视频",
            cover: "",
            url: videoUrl,
          });
        }
      }
    } else {
      console.log("未获取到页面内容");
    }

    return null;
  } catch (error) {
    console.log("kuaishou函数错误:", error);
    return null;
  }
}

async function parseVideoInfo(response, id) {
  try {
    console.log("=== 开始解析视频信息 ===");

    // 方法1：解析APOLLO_STATE
    const apolloStatePattern =
      /window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?})(?:\s*;|\s*<\/script>)/;
    const matches = response.match(apolloStatePattern);

    if (matches) {
      console.log("找到APOLLO_STATE");
      try {
        let apolloStateStr = matches[1];
        console.log("原始APOLLO_STATE长度:", apolloStateStr.length);

        // 更强大的JSON清理逻辑
        apolloStateStr = cleanJsonString(apolloStateStr);
        console.log("清理后APOLLO_STATE长度:", apolloStateStr.length);

        const apolloState = JSON.parse(apolloStateStr);
        const defaultClient = apolloState.defaultClient || apolloState;

        if (defaultClient) {
          console.log("成功解析APOLLO_STATE，查找视频数据...");

          // 查找视频数据的多种可能key
          const possibleKeys = Object.keys(defaultClient).filter(
            (key) =>
              key.includes("Photo") ||
              key.includes("Video") ||
              key.includes("Detail") ||
              (id && key.includes(id))
          );

          console.log("可能的视频数据keys:", possibleKeys.slice(0, 10)); // 只显示前10个

          for (const key of possibleKeys) {
            const videoData = defaultClient[key];
            if (videoData && typeof videoData === "object") {
              const result = extractVideoDataFromObject(videoData);
              if (result) {
                console.log("从APOLLO_STATE找到视频数据，key:", key);
                return result;
              }
            }
          }

          // 如果没有找到特定key，尝试遍历所有数据
          console.log("在APOLLO_STATE中进行深度搜索...");
          const deepResult = findVideoDataDeep(defaultClient);
          if (deepResult) {
            console.log("通过深度搜索找到视频数据");
            return deepResult;
          }
        }
      } catch (parseError) {
        console.log("解析APOLLO_STATE失败:", parseError.message);
        console.log("JSON字符串开头:", matches[1].substring(0, 200));
      }
    } else {
      console.log("未找到APOLLO_STATE");
    }

    // 方法2：直接从HTML中提取视频信息
    console.log("尝试从HTML中直接提取视频信息...");
    const htmlResult = extractFromHtml(response);
    if (htmlResult) {
      console.log("从HTML中找到视频数据");
      return htmlResult;
    }

    // 方法3：查找其他可能的数据结构
    console.log("尝试查找其他数据结构...");
    const dataPatterns = [
      /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
      /window\.__NUXT__\s*=\s*({[\s\S]*?});/,
      /"videoDetail":\s*({[\s\S]*?})/,
      /"photoInfo":\s*({[\s\S]*?})/,
    ];

    for (const pattern of dataPatterns) {
      const match = response.match(pattern);
      if (match) {
        try {
          const data = JSON.parse(match[1]);
          console.log("找到其他数据结构");
          const deepResult = findVideoDataDeep(data);
          if (deepResult) {
            console.log("从其他数据结构找到视频数据");
            return deepResult;
          }
        } catch (e) {
          console.log("解析其他数据结构失败:", e.message);
        }
      }
    }

    // 方法4：正则表达式直接匹配
    console.log("尝试正则表达式直接匹配...");
    const regexPatterns = [
      /"photoUrl":\s*"([^"]+)"/,
      /"playUrl":\s*"([^"]+)"/,
      /"videoUrl":\s*"([^"]+)"/,
      /"mp4Url":\s*"([^"]+)"/,
      /photoUrl['"]\s*:\s*['"]([^'"]+)['"]/,
      /playUrl['"]\s*:\s*['"]([^'"]+)['"]/,
    ];

    for (const pattern of regexPatterns) {
      const match = response.match(pattern);
      if (match) {
        let videoUrl = match[1];
        // 处理转义字符
        videoUrl = videoUrl
          .replace(/\\u002F/g, "/")
          .replace(/\\\//g, "/")
          .replace(/\\/g, "");
        if (videoUrl.startsWith("http")) {
          console.log("通过正则表达式找到视频URL:", videoUrl);

          // 尝试提取更多信息
          const contextData = {
            photoUrl: videoUrl,
            source: "regex-match",
          };

          // 简单的封面提取尝试
          const coverPatterns = [
            /"coverUrl":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
            /"cover":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
            /"poster":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
            /"thumbnail":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
            // 扩展更多可能的封面字段
            /"headUrl":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
            /"imageUrl":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
            /"previewUrl":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
            // 不限制文件扩展名的更广泛搜索
            /"coverUrl":\s*"([^"]+)"/,
            /"cover":\s*"([^"]+)"/,
            /"poster":\s*"([^"]+)"/,
            /"thumbnail":\s*"([^"]+)"/,
            /"headUrl":\s*"([^"]+)"/,
            /"imageUrl":\s*"([^"]+)"/,
          ];

          for (const coverPattern of coverPatterns) {
            const coverMatch = response.match(coverPattern);
            if (coverMatch) {
              let coverUrl = coverMatch[1]
                .replace(/\\u002F/g, "/")
                .replace(/\\\//g, "/")
                .replace(/\\/g, "");
              // 检查是否是有效的图片URL
              if (
                coverUrl.startsWith("http") &&
                (coverUrl.includes(".jpg") ||
                  coverUrl.includes(".jpeg") ||
                  coverUrl.includes(".png") ||
                  coverUrl.includes(".webp") ||
                  coverUrl.includes("image") ||
                  coverUrl.includes("cover") ||
                  coverUrl.includes("thumb"))
              ) {
                contextData.coverUrl = coverUrl;
                console.log("找到封面图片:", coverUrl);
                break;
              }
            }
          }

          // 如果还没找到封面，尝试更广泛的搜索
          if (!contextData.coverUrl) {
            console.log("尝试更广泛的封面搜索...");
            // 搜索所有可能的图片URL
            const allImageMatches = response.matchAll(
              /https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:[^"'\s]*)?/gi
            );
            for (const imageMatch of allImageMatches) {
              const imageUrl = imageMatch[0]
                .replace(/\\u002F/g, "/")
                .replace(/\\\//g, "/");
              // 优先选择包含cover、thumb、image等关键词的图片
              if (
                imageUrl.includes("cover") ||
                imageUrl.includes("thumb") ||
                imageUrl.includes("poster") ||
                imageUrl.includes("preview")
              ) {
                contextData.coverUrl = imageUrl;
                console.log("通过广泛搜索找到封面:", imageUrl);
                break;
              }
            }

            // 如果还是没找到，取第一个找到的图片
            if (!contextData.coverUrl) {
              const firstImageMatch = response.match(
                /https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:[^"'\s]*)?/i
              );
              if (firstImageMatch) {
                contextData.coverUrl = firstImageMatch[0]
                  .replace(/\\u002F/g, "/")
                  .replace(/\\\//g, "/");
                console.log(
                  "使用第一个找到的图片作为封面:",
                  contextData.coverUrl
                );
              }
            }
          }

          // 提取标题
          const captionMatch = response.match(/"caption":\s*"([^"]+)"/);
          if (captionMatch) {
            contextData.caption = captionMatch[1];
          }

          // 提取作者
          const authorMatch = response.match(/"name":\s*"([^"]+)"/);
          if (authorMatch && !authorMatch[1].includes("原声")) {
            contextData.authorName = authorMatch[1];
          }

          console.log(
            "正则匹配提取的数据:",
            JSON.stringify(contextData, null, 2)
          );
          return formatResponse(200, "解析成功", contextData);
        }
      }
    }

    console.log("所有解析方法都失败了");
    return null;
  } catch (error) {
    console.log("parseVideoInfo错误:", error);
    return null;
  }
}

function cleanJsonString(jsonStr) {
  try {
    // 移除函数定义
    jsonStr = jsonStr.replace(
      /function\s*\([^)]*\)\s*{[^{}]*(?:{[^{}]*}[^{}]*)*}/g,
      "null"
    );

    // 移除undefined
    jsonStr = jsonStr.replace(/:\s*undefined/g, ":null");
    jsonStr = jsonStr.replace(/,\s*undefined/g, ",null");

    // 移除注释
    jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, "");
    jsonStr = jsonStr.replace(/\/\/.*$/gm, "");

    // 处理末尾逗号
    jsonStr = jsonStr.replace(/,\s*(?=})/g, "");
    jsonStr = jsonStr.replace(/,\s*(?=])/g, "");

    // 处理一些特殊的快手特有格式
    jsonStr = jsonStr.replace(/new\s+Date\([^)]*\)/g, "null");
    jsonStr = jsonStr.replace(/Symbol\([^)]*\)/g, "null");

    // 处理特殊的函数调用
    jsonStr = jsonStr.replace(/[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)/g, "null");

    // 尝试修复一些常见的JSON格式问题
    jsonStr = jsonStr.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');

    return jsonStr;
  } catch (error) {
    console.log("JSON清理失败:", error);
    return jsonStr;
  }
}

function extractVideoDataFromObject(obj) {
  if (!obj || typeof obj !== "object") return null;

  // 查找视频URL
  const videoUrl =
    obj.photoUrl || obj.playUrl || obj.videoUrl || obj.mp4Url || obj.src;

  if (videoUrl && typeof videoUrl === "string" && videoUrl.startsWith("http")) {
    // 返回完整的原始数据对象，包含所有可用字段
    console.log("找到的原始视频数据对象:", JSON.stringify(obj, null, 2));

    // 提取关键信息
    const result = {
      photoUrl: videoUrl,
      source: "apollo-state",
    };

    // 添加其他可用字段
    if (obj.caption) result.caption = obj.caption;
    if (obj.title) result.title = obj.title;
    if (obj.coverUrl) result.coverUrl = obj.coverUrl;
    if (obj.poster) result.poster = obj.poster;
    if (obj.cover) result.cover = obj.cover;
    if (obj.thumbnail) result.thumbnail = obj.thumbnail;
    if (obj.name) result.authorName = obj.name;
    if (obj.author) result.author = obj.author;
    if (obj.headUrl) result.authorAvatar = obj.headUrl;
    if (obj.avatar) result.avatar = obj.avatar;
    if (obj.likeCount !== undefined) result.likeCount = obj.likeCount;
    if (obj.like !== undefined) result.like = obj.like;
    if (obj.commentCount !== undefined) result.commentCount = obj.commentCount;
    if (obj.shareCount !== undefined) result.shareCount = obj.shareCount;
    if (obj.playCount !== undefined) result.playCount = obj.playCount;
    if (obj.duration !== undefined) result.duration = obj.duration;
    if (obj.createTime !== undefined) result.createTime = obj.createTime;
    if (obj.timestamp !== undefined) result.timestamp = obj.timestamp;

    console.log("提取的结构化数据:", JSON.stringify(result, null, 2));
    return formatResponse(200, "解析成功", result);
  }

  return null;
}

function findVideoDataDeep(obj, depth = 0) {
  if (depth > 6) return null; // 防止无限递归
  if (!obj || typeof obj !== "object") return null;

  // 直接检查当前对象
  const directResult = extractVideoDataFromObject(obj);
  if (directResult) return directResult;

  // 递归搜索
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      try {
        const result = findVideoDataDeep(obj[key], depth + 1);
        if (result) return result;
      } catch {
        // 忽略递归中的错误，继续搜索
        continue;
      }
    }
  }

  return null;
}

function extractFromHtml(html) {
  try {
    // 查找script标签中的视频URL和其他信息
    const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of scriptMatches) {
      const scriptContent = match[1];

      // 在script内容中查找视频URL
      const urlPatterns = [
        /"photoUrl":\s*"([^"]+\.(?:mp4|m3u8|flv)[^"]*)"/,
        /"playUrl":\s*"([^"]+\.(?:mp4|m3u8|flv)[^"]*)"/,
        /"videoUrl":\s*"([^"]+\.(?:mp4|m3u8|flv)[^"]*)"/,
        /https?:\/\/[^"'\s]+\.(?:mp4|m3u8|flv)(?:\?[^"'\s]*)?/g,
      ];

      for (const pattern of urlPatterns) {
        const urlMatch = scriptContent.match(pattern);
        if (urlMatch) {
          let videoUrl = urlMatch[1] || urlMatch[0];
          videoUrl = videoUrl.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
          if (videoUrl.startsWith("http")) {
            console.log("从script标签找到视频URL:", videoUrl);

            // 提取完整的视频信息
            const extractedData = {
              photoUrl: videoUrl,
              source: "script-tag",
            };

            // 提取标题
            const titleMatch = scriptContent.match(/"caption":\s*"([^"]+)"/);
            if (titleMatch) extractedData.caption = titleMatch[1];

            // 提取封面 - 尝试多种字段
            const coverPatterns = [
              /"coverUrl":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
              /"cover":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
              /"poster":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
              /"thumbnail":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
              // 扩展更多可能的封面字段
              /"headUrl":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
              /"imageUrl":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
              /"previewUrl":\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
              // 不限制文件扩展名的更广泛搜索
              /"coverUrl":\s*"([^"]+)"/,
              /"cover":\s*"([^"]+)"/,
              /"poster":\s*"([^"]+)"/,
              /"thumbnail":\s*"([^"]+)"/,
              /"headUrl":\s*"([^"]+)"/,
              /"imageUrl":\s*"([^"]+)"/,
            ];

            for (const coverPattern of coverPatterns) {
              const coverMatch = scriptContent.match(coverPattern);
              if (coverMatch) {
                let coverUrl = coverMatch[1]
                  .replace(/\\u002F/g, "/")
                  .replace(/\\\//g, "/")
                  .replace(/\\/g, "");
                // 检查是否是有效的图片URL
                if (
                  coverUrl.startsWith("http") &&
                  (coverUrl.includes(".jpg") ||
                    coverUrl.includes(".jpeg") ||
                    coverUrl.includes(".png") ||
                    coverUrl.includes(".webp") ||
                    coverUrl.includes("image") ||
                    coverUrl.includes("cover") ||
                    coverUrl.includes("thumb"))
                ) {
                  extractedData.coverUrl = coverUrl;
                  console.log("找到封面图片:", coverUrl);
                  break;
                }
              }
            }

            // 如果还没找到封面，尝试更广泛的搜索
            if (!extractedData.coverUrl) {
              console.log("尝试更广泛的封面搜索...");
              // 搜索所有可能的图片URL
              const allImageMatches = scriptContent.matchAll(
                /https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:[^"'\s]*)?/gi
              );
              for (const imageMatch of allImageMatches) {
                const imageUrl = imageMatch[0]
                  .replace(/\\u002F/g, "/")
                  .replace(/\\\//g, "/");
                // 优先选择包含cover、thumb、image等关键词的图片
                if (
                  imageUrl.includes("cover") ||
                  imageUrl.includes("thumb") ||
                  imageUrl.includes("poster") ||
                  imageUrl.includes("preview")
                ) {
                  extractedData.coverUrl = imageUrl;
                  console.log("通过广泛搜索找到封面:", imageUrl);
                  break;
                }
              }

              // 如果还是没找到，取第一个找到的图片
              if (!extractedData.coverUrl) {
                const firstImageMatch = scriptContent.match(
                  /https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:[^"'\s]*)?/i
                );
                if (firstImageMatch) {
                  extractedData.coverUrl = firstImageMatch[0]
                    .replace(/\\u002F/g, "/")
                    .replace(/\\\//g, "/");
                  console.log(
                    "使用第一个找到的图片作为封面:",
                    extractedData.coverUrl
                  );
                }
              }
            }

            // 提取作者
            const authorMatch = scriptContent.match(/"name":\s*"([^"]+)"/);
            if (authorMatch && !authorMatch[1].includes("原声"))
              extractedData.authorName = authorMatch[1];

            console.log("从script标签提取的数据:", extractedData);
            return formatResponse(200, "解析成功", extractedData);
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.log("从HTML提取失败:", error);
    return null;
  }
}

async function getRedirectedUrl(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      },
      signal: AbortSignal.timeout(10000),
    });
    console.log("重定向响应状态:", response.status);
    return response.url || url;
  } catch (error) {
    console.log("获取重定向URL失败:", error);
    return url;
  }
}

async function makeRequest(url, headers) {
  try {
    console.log("请求URL:", url);
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000), // 15秒超时
    });

    console.log("响应状态:", response.status);
    console.log("响应头:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      console.log("请求失败，状态码:", response.status);
      if (response.status === 403) {
        console.log("403错误，可能被反爬虫拦截");
      }
      return null;
    }

    const text = await response.text();
    console.log("响应内容长度:", text.length);

    return text;
  } catch (error) {
    console.log("请求错误:", error.message);
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return Response.json(formatResponse(201, "链接不能为空！"), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  console.log("=== 开始处理快手URL ===");
  console.log("原始URL:", url);

  try {
    const jsonData = await kuaishou(url);
    console.log("jsonData", jsonData);
    if (jsonData) {
      console.log("=== 解析成功 ===");
      return Response.json(jsonData, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } else {
      console.log("=== 解析失败 ===");
      return Response.json(
        formatResponse(404, "解析失败，可能是链接格式不支持或内容无法访问"),
        {
          status: 404,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }
  } catch (error) {
    console.log("=== API处理错误 ===");
    console.log("错误详情:", error);
    return Response.json(formatResponse(500, "服务器错误", error.message), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
