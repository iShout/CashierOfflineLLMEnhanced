import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { knowledgeEmbeddings } from "./embeddings.js";
import { loadKnowledgeChunks } from "./load.js";

let storePromise: Promise<MemoryVectorStore> | undefined;

async function buildKnowledgeStore() {
  const chunks = await loadKnowledgeChunks();

  const store = await MemoryVectorStore.fromDocuments(chunks, knowledgeEmbeddings);
  console.info(`[Agent 知识库] 已加载 ${chunks.length} 个片段`);
  return store;
}

export function getKnowledgeStore(): Promise<MemoryVectorStore> {
  // 缓存初始化 Promise，连续请求和并发请求共用一次建库。
  if (!storePromise) {
    storePromise = buildKnowledgeStore().catch((error) => {
      // 初始化失败后允许下次重试，避免一直缓存失败状态。
      storePromise = undefined;
      throw error;
    });
  }

  return storePromise;
}
