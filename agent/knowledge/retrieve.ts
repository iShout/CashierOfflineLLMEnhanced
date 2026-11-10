import { string } from "zod";
import { getKnowledgeStore } from "./store";

const DEFAULT_MIN_SCORE = 0.55;

export async function retrieveKnowledge(query: string, minScore = DEFAULT_MIN_SCORE) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("知识检索问题不能为空。");
  }

  const store = await getKnowledgeStore();

  // 先取最相关的三个候选片段，再排除相关性较弱的结果。
  const candidates = await store.similaritySearchWithScore(normalizedQuery, 3);

  return candidates
    .filter(([, score]) => score >= minScore)
    .map(([document, score]) => ({
      citation: String(document.metadata.chunkId),
      source: String(document.metadata.source),
      title: String(document.metadata.title),
      score,
      content: document.pageContent,
    }));
}
