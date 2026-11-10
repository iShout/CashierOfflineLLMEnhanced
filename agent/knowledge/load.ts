import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export async function loadKnowledgeChunks() {
  const directory = process.env.AGENT_KNOWLEDGE_DIR || resolve(process.cwd(), "resources/knowledge");
  const entires = await readdir(directory, { withFileTypes: true });

  const filenames = entires
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  const documents: Document[] = [];

  for (const filename of filenames) {
    const content = await readFile(resolve(directory, filename), "utf8");
    if (!content.trim()) continue;
    documents.push(
      new Document({
        pageContent: content,
        metadata: {
          source: filename,
          title: content.match(/^#\s+(.+)$/m)?.[1] || filename,
        },
      }),
    );
  }

  if (!documents.length) {
    throw new Error("知识库没有可读取的 Markdown 文档。");
  }

  // 增加中文标点分隔，尽量保留段落和句子的完整含义。
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 80,
    separators: ["\n\n", "\n", "。", "；", "，", " ", ""],
  });

  const chunks = await splitter.splitDocuments(documents);
  const counters = new Map<string, number>();

  // 片段保留原文来源，并在每份文件内编号，供回答引用。
  for (const chunk of chunks) {
    const source = String(chunk.metadata.source);
    const number = (counters.get(source) || 0) + 1;

    counters.set(source, number);
    chunk.metadata.chunkId = `${source}#chunk-${number}`;
  }

  return chunks;
}
