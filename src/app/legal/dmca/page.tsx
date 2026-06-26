import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "权利通知 - ParseShort",
  description: "ParseShort 权利通知与版权投诉流程，尊重并保护知识产权。",
  robots: { index: true, follow: true },
};

export default function DmcaPage() {
  return (
    <LegalLayout
      title="权利通知"
      subtitle="我们尊重知识产权。若你认为本服务影响了你的合法权益，请按以下流程联系我们。">
      <h2>一、我们的立场</h2>
      <p>
        ParseShort 尊重并致力于保护知识产权及其他合法权益。
        本服务本身不存储、不托管、不上传任何视频或图片内容，
        仅作为链接解析工具，帮助从分享文本中提取链接并尝试解析其公开信息。
      </p>
      <p>
        若你认为本服务处理某条链接的方式侵犯了你的著作权或其他合法权益，
        请及时通知我们，我们将在核实后尽快处理。
      </p>

      <h2>二、投诉流程</h2>
      <p>为便于我们快速处理，请以书面形式（邮件）发送权利通知，并包含以下信息：</p>
      <ol>
        <li>
          <strong>权利人信息</strong>：姓名/名称、联系方式（邮箱、电话）、有效身份证件或营业执照信息；
        </li>
        <li>
          <strong>权属证明</strong>：主张被侵权作品或内容的权属证明（如著作权登记证书、原始发布链接等）；
        </li>
        <li>
          <strong>涉嫌侵权的内容</strong>：对应的目标链接（URL），请尽量提供完整、可访问的链接；
        </li>
        <li>
          <strong>具体诉求</strong>：你希望我们采取的处理方式（如停止解析该链接等）；
        </li>
        <li>
          <strong>真实性承诺</strong>：声明通知中的信息真实、准确，且你是合法权益利人或已获授权。
        </li>
      </ol>

      <h2>三、联系方式</h2>
      <p>请将完整的权利通知发送至：</p>
      <p>
        <strong>邮箱：</strong>
        <a href={`mailto:${siteConfig.copyrightEmail}`}>
          {siteConfig.copyrightEmail}
        </a>
      </p>
      <p>我们收到符合要求的通知后，会在合理期限内处理并回复。</p>

      <h2>四、处理说明</h2>
      <ul>
        <li>由于本服务不在服务器存储内容，处理方式通常为停止对涉诉链接的解析；</li>
        <li>对于明显无效、不完整或无法核实的通知，我们可能要求补充材料；</li>
        <li>我们保留对每份通知进行独立判断的权利。</li>
      </ul>

      <h2>五、反通知</h2>
      <p>
        若你是被投诉内容的发布者或认为处理有误，可在收到处理通知后，
        通过上述邮箱提交反通知并说明理由。我们将在核实后酌情恢复或维持处理结果。
      </p>

      <h2>六、温馨提示</h2>
      <p>
        本页面提供的是工程化的投诉处理流程。若涉及重大权益，建议你同时咨询专业法律人士。
      </p>
    </LegalLayout>
  );
}
