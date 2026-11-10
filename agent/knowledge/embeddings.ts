import { OpenAIEmbeddings } from "@langchain/openai";

const apiKey = process.env.EMBEDDING_API_KEY?.trim();
const baseURL = process.env.EMBEDDING_BASE_URL?.trim();
const model = process.env.EMBEDDING_MODEL?.trim();

// 提前检查配置，避免到首次建库时才出现难以理解的请求错误。
if (!apiKey || !baseURL || !model) {
  throw new Error("请配置 EMBEDDING_API_KEY、EMBEDDING_BASE_URL 和 EMBEDDING_MODEL。");
}

export const knowledgeEmbeddings = new OpenAIEmbeddings({
  apiKey,
  model,
  dimensions: 1024,
  encodingFormat: "float",

  // text-embedding-v4 单次请求最多接收 10 条文本。
  batchSize: 10,
  maxConcurrency: 1,

  timeout: 30000,
  maxRetries: 1,

  configuration: {
    baseURL,
  },
});
