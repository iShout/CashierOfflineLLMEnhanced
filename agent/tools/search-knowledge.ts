import { tool } from "langchain";
import { knowledgeQuerySchema } from "../schemas.js";
import { retrieveKnowledge } from "../knowledge/retrieve.js";

export const searchKnowledge = tool(
  async ({ query }) => {
    try {
      const hits = await retrieveKnowledge(query);

      return JSON.stringify({
        success: true,
        found: hits.length > 0,
        source: "project_knowledge",
        hits,
      });
    } catch (error) {
      // 详细错误留在主进程，向模型返回明确的检索失败状态。
      console.error("[Agent 知识检索失败]", error);

      return JSON.stringify({
        success: false,
        source: "project_knowledge",
        error_code: "KNOWLEDGE_SEARCH_FAILED",
        message: "知识检索失败，请检查资料目录",
      });
    }
  },
  {
    name: "search_knowledge",
    schema: knowledgeQuerySchema,
    description:
      "当用户询问的问题与如何使用系统相关时，调用此工具。" +
      "返回相关资料正文与引用编号。" +
      "不查询实时营业额、销量或具体订单状态，也不执行业务操作。",
  },
);
