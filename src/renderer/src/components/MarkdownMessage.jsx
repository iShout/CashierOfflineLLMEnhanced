import { Typography } from "antd";
import PropTypes from "prop-types";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

const MARKDOWN_PLUGINS = [remarkGfm, remarkBreaks];

// 消息中的链接只负责展示，避免点击后替换 Electron 当前页面。
const MarkdownLink = ({ children, href }) => (
  <a href={href} title={href} rel="noreferrer" onClick={(event) => event.preventDefault()}>
    {children}
  </a>
);

MarkdownLink.propTypes = {
  children: PropTypes.node,
  href: PropTypes.string,
};

// 不直接加载 Markdown 远程图片，避免聊天内容触发未经授权的网络请求。
const MarkdownImagePlaceholder = ({ alt }) => (
  <span className="agent-markdown__image-placeholder">{alt ? `[图片：${alt}]` : "[图片]"}</span>
);

MarkdownImagePlaceholder.propTypes = {
  alt: PropTypes.string,
};

function MarkdownMessage({ content }) {
  return (
    <Typography className="agent-markdown">
      <ReactMarkdown
        remarkPlugins={MARKDOWN_PLUGINS}
        components={{
          a: MarkdownLink,
          img: MarkdownImagePlaceholder,
        }}
      >
        {content}
      </ReactMarkdown>
    </Typography>
  );
}

MarkdownMessage.propTypes = {
  content: PropTypes.string.isRequired,
};

export default MarkdownMessage;
