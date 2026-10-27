type ReceiptTextSegment = {
  text: string;
  bold: boolean;
};

type ReceiptImageRenderOptions = {
  width?: number;
  fontSize?: number;
  lineHeight?: number;
  paddingY?: number;
  forceBoldTotalAmount?: boolean;
  preserveColumnAlignment?: boolean;
  contentColumns?: number;
};

// 将小票/报表文本转为 SVG 前先转义 XML 特殊字符。
const escapeXml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 兼容不同平台换行符，保证图片行高计算稳定。
const splitReceiptLines = (receiptText: string): string[] => receiptText.replace(/\r\n/g, "\n").replace(/\f/g, "\n\n\n").split("\n");

// 解析后端小票内容中的 <b> 标记，用于在预览图片里局部加粗。
const parseReceiptTextSegments = (line: string): ReceiptTextSegment[] => {
  const segments: ReceiptTextSegment[] = [];
  let start = 0;

  while (start < line.length) {
    const boldStart = line.indexOf("<b>", start);

    if (boldStart === -1) {
      segments.push({ text: line.slice(start), bold: false });
      break;
    }

    if (boldStart > start) {
      segments.push({ text: line.slice(start, boldStart), bold: false });
    }

    const boldEnd = line.indexOf("</b>", boldStart);
    const contentStart = boldStart + 3;
    const contentEnd = boldEnd === -1 ? line.length : boldEnd;
    segments.push({ text: line.slice(contentStart, contentEnd), bold: true });

    start = boldEnd === -1 ? line.length : boldEnd + 4;
  }

  return segments.length > 0 ? segments : [{ text: line, bold: false }];
};

// 本地兜底文本没有后端 <b> 标记时，也要让总金额行接近线上预览样式。
const shouldForceBoldLine = (line: string): boolean => line.trim().startsWith("Total Amount");

const renderReceiptLine = (
  line: string,
  y: number,
  x: number,
  textAnchor: "start" | "middle",
  forceBoldTotalAmount: boolean,
): string => {
  const segments = parseReceiptTextSegments(line || " ");
  const forceBold = forceBoldTotalAmount && shouldForceBoldLine(line);
  const tspans = segments
    .map((segment) => {
      const weight = segment.bold || forceBold ? 700 : 400;
      return `<tspan font-weight="${weight}">${escapeXml(segment.text)}</tspan>`;
    })
    .join("");

  return `<text x="${x}" y="${y}" text-anchor="${textAnchor}" xml:space="preserve">${tspans}</text>`;
};

// 本地将小票/报表文本渲染为 base64 图片 data URL，供渲染进程直接展示。
export const renderReceiptTextToImageDataUrl = (
  receiptText: string,
  options: ReceiptImageRenderOptions = {},
): string => {
  const lines = splitReceiptLines(receiptText);
  const width = options.width ?? 450;
  const paddingY = options.paddingY ?? 20;
  const lineHeight = options.lineHeight ?? 32;
  const fontSize = options.fontSize ?? 24;
  const centerX = width / 2;
  const forceBoldTotalAmount = options.forceBoldTotalAmount ?? true;
  const preserveColumnAlignment = options.preserveColumnAlignment ?? false;
  const contentColumns = options.contentColumns ?? 32;
  // 等宽字体的字符宽度约为字号的 0.6 倍，据此把固定列宽内容块置于图片中间。
  const receiptTextX = Math.max(0, (width - contentColumns * fontSize * 0.6) / 2);
  const textX = preserveColumnAlignment ? receiptTextX : centerX;
  const textAnchor = preserveColumnAlignment ? "start" : "middle";
  const height = Math.max(80, paddingY * 2 + lines.length * lineHeight);
  const textNodes = lines
    .map((line, index) => {
      const y = paddingY + (index + 1) * lineHeight;
      return renderReceiptLine(line, y, textX, textAnchor, forceBoldTotalAmount);
    })
    .join("");
  const fontFamily = preserveColumnAlignment
    ? "'Courier New', 'Noto Sans Mono CJK SC', monospace"
    : "'Times New Roman', 'Noto Serif SC', serif";
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<g fill="#111" font-family="${fontFamily}" font-size="${fontSize}">${textNodes}</g>`,
    `</svg>`,
  ].join("");

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
};
