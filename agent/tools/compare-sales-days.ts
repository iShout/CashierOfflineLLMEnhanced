import { tool } from "langchain";
import { generateBusinessReport } from "../analysis/generate.js";
import { reportRequestSchema } from "../analysis/schema.js";

export const compareSalesDays = tool(async (request) => JSON.stringify(await generateBusinessReport(request)), {
  name: "compare_sales_days",
  schema: reportRequestSchema,
  description:
    "比较当前登录餐厅的两个自然日销售。" +
    "date 是目标日，baselineDate 是对比基准日，格式均为 YYYY-MM-DD。" +
    "计算方向为目标日减去基准日。日期不清楚时先询问。",
});
