import Big from "big.js";
import { z } from "zod";
import { getSalesSummary } from "../tools/get-sales-summary.js";
import { getProductRanking } from "../tools/get-product-ranking.js";
import { searchKnowledge } from "../tools/search-knowledge.js";
import { compareSales } from "./compare.js";
import { factsSchema, rankingResultSchema, reportRequestSchema, salesResultSchema, sourceSchema } from "./schema.js";

function readJson(value: unknown): unknown {
  if (typeof value !== "string") {
    throw new Error("工具未返回预期的 JSON 字符串。");
  }

  return JSON.parse(value);
}

const knowledgeResultSchema = z.object({
  success: z.literal(true),
  found: z.boolean(),
  hits: z.array(
    z.object({
      citation: z.string(),
      title: z.string(),
      content: z.string(),
    }),
  ),
});

export async function collectAnalysis({ date, baselineDate }: z.infer<typeof reportRequestSchema>) {
  // 用同一个销售工具按两个自然日查数，复用现有报表口径。
  const current = salesResultSchema.parse(readJson(await getSalesSummary.invoke({ dateStart: date, dateEnd: date })));
  const baseline = salesResultSchema.parse(
    readJson(
      await getSalesSummary.invoke({
        dateStart: baselineDate,
        dateEnd: baselineDate,
      }),
    ),
  );

  const sales = compareSales(current, baseline);

  // 来源随事实一起交给建议生成器，供模型引用和程序核对。
  const sources: z.infer<typeof sourceSchema>[] = [
    {
      id: "sales_current",
      kind: "business",
      title: `${date} 销售汇总`,
      content: JSON.stringify(current),
    },
    {
      id: "sales_baseline",
      kind: "business",
      title: `${baselineDate} 销售汇总`,
      content: JSON.stringify(baseline),
    },
  ];

  // 用已有排行工具查询目标日销量前五。
  const ranking = rankingResultSchema.parse(
    readJson(
      await getProductRanking.invoke({
        dateStart: date,
        dateEnd: date,
        sortBy: "quantity",
        limit: 5,
      }),
    ),
  );

  sources.push({
    id: "ranking_current",
    kind: "business",
    title: `${date} 商品销量排行`,
    content: JSON.stringify(ranking),
  });

  const signals: z.infer<typeof factsSchema>["signals"] = [];

  // 根据报告展示的变化率判断是否达到教学阈值。
  if (sales.status === "ok" && sales.changePercent !== null && new Big(sales.changePercent).lte(-20)) {
    signals.push({
      type: "sales_drop",
      description: "销售额较对比日下降至少 20%，建议核查。",
      evidenceIds: ["sales_current", "sales_baseline"],
    });
  }

  const warnings: string[] = [];

  // 使用知识库补充可以执行的报表核查步骤。
  try {
    const knowledge = knowledgeResultSchema.parse(
      readJson(
        await searchKnowledge.invoke({
          query: "产品汇总怎么查询？如何选择自定义日期并核对销售统计范围？",
        }),
      ),
    );

    if (!knowledge.found) {
      warnings.push("没有检索到相关操作资料。");
    }

    for (const hit of knowledge.hits) {
      sources.push({
        id: `knowledge:${hit.citation}`,
        kind: "knowledge",
        title: hit.title,
        content: hit.content,
      });
    }
  } catch {
    warnings.push("知识检索失败，报告保留已取得的业务数据。");
  }

  return { facts: { date, baselineDate, sales, ranking, signals }, sources, warnings };
}
