import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "隐私政策 - ParseShort",
  description: "ParseShort 隐私政策，说明我们如何处理你的信息与日志。",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="隐私政策"
      subtitle="我们高度重视你的隐私，本政策说明我们处理哪些信息。">
      <h2>一、总则</h2>
      <p>
        本服务（ParseShort）无需注册账号即可使用，我们不要求你提供姓名、手机号、邮箱等个人身份信息。
        本政策说明我们在你使用过程中会接触哪些数据，以及如何处理它们。
      </p>

      <h2>二、我们处理的信息</h2>
      <h3>1. 你主动提交的链接</h3>
      <p>
        你在输入框粘贴的分享文本或链接，会被发送至服务器用于解析。
        解析结果<strong>仅在服务器内存中短暂缓存（默认 5 分钟）</strong>以提高性能，
        超时后自动清除，<strong>不会持久化存储到磁盘或数据库</strong>。
      </p>

      <h3>2. 自动产生的日志信息</h3>
      <p>为保障服务安全与稳定，我们可能记录以下信息：</p>
      <ul>
        <li>客户端 IP 地址（用于速率限制与安全防护）；</li>
        <li>请求时间与请求路径；</li>
        <li>解析的目标 URL（用于限流与排查问题）。</li>
      </ul>
      <p>
        这些日志同样<strong>保留在内存中</strong>，不长期归档，主要用于运行期的限流计数与异常排查。
      </p>

      <h3>3. 我们不主动收集的信息</h3>
      <ul>
        <li>我们不要求注册，不收集账号信息；</li>
        <li>我们不在你的浏览器中放置用于跨站追踪的 Cookie；</li>
        <li>我们不进行用户画像或行为分析。</li>
      </ul>

      <h2>三、与第三方平台的数据交互</h2>
      <p>
        解析过程中，本服务会向你提交链接对应的平台（如抖音、哔哩哔哩等）发起请求以获取公开信息。
        这些请求可能携带必要的标识（如平台 Cookie）以便正常解析，
        但这些标识属于<strong>本服务与平台之间的会话凭证</strong>，与你的个人身份无关。
      </p>
      <p>
        媒体播放或预览时，请求会经由本服务的代理转发至对应平台，<strong>代理仅做实时转发，不存储媒体内容</strong>。
      </p>

      <h2>四、信息存储与安全</h2>
      <ul>
        <li>解析结果与限流计数均存储于<strong>服务器内存</strong>，服务重启即清除；</li>
        <li>我们采取速率限制、SSRF 防护等措施保障服务安全；</li>
        <li>尽管如此，互联网传输不存在绝对安全，请你避免提交敏感或私密链接。</li>
      </ul>

      <h2>五、你的权利</h2>
      <p>由于我们不长期存储你的个人数据，你无需主动行使删除权——内存缓存会在短时间内自动失效。</p>
      <p>如你认为有特殊情况需要我们处理，可通过下方邮箱联系我们。</p>

      <h2>六、未成年人保护</h2>
      <p>
        本服务不针对未成年人提供。如果你是未成年人，请在监护人指导下使用，
        并避免提交任何涉及个人隐私的链接。
      </p>

      <h2>七、政策更新</h2>
      <p>
        本政策可能不时更新，更新后将在本页面公布并调整顶部的&ldquo;最近更新&rdquo;日期。
      </p>

      <h2>八、联系我们</h2>
      <p>
        如对本政策有任何疑问或建议，请联系：
        <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
      </p>
    </LegalLayout>
  );
}
