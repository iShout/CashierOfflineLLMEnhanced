import { ChatDeepSeek } from "@langchain/deepseek";

export function createCashierModel() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();

  // 普通聊天和结构化报告使用相同的模型配置。
  if (!apiKey) {
    throw new Error("未配置 DEEPSEEK_API_KEY。");
  }

  return new ChatDeepSeek({
    apiKey,
    model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-flash",
    configuration: {
      baseURL: "https://api.deepseek.com",
    },
    modelKwargs: {
      thinking: {
        type: "disabled",
      },
    },
    timeout: 60000,
    maxRetries: 0,
  });
}
