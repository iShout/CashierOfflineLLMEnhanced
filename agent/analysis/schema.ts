import { z } from "zod";

const moneySchema = z.string().regex(/^\d+\.\d{2}$/);
const signedDecimalSchema = z.string().regex(/^-?\d+\.\d{2}$/);


//工具参数传入的schema
export const reportRequestSchema = z
  .object({
    date: z.iso.date(),
    baselineDate: z.iso.date(),
  })
  .refine((value) => value.date !== value.baselineDate, { error: "目标日期与对比日期不能相同。" });

// 按当前销售工具实际返回的字段校验数据。
export const salesResultSchema = z.object({
  success: z.literal(true),
  has_data: z.boolean(),
  currency: z.string().nullable(),
  total_amount: moneySchema,
});

// 当前商品排行工具成功时没有 success 字段，按其实际结构处理。
export const rankingResultSchema = z.object({
  has_data: z.boolean(),
  currency: z.string().nullable(),
  ranking: z.array(
    z.object({
      rank: z.number().int().positive(),
      product_name: z.string(),
      quantity: z.number().nonnegative(),
      subtotal_amount: moneySchema,
    }),
  ),
});
export const salesComparisonSchema = z.object({
  currency: z.string().nullable(),
  currentAmount: moneySchema.nullable(),
  baselineAmount: moneySchema.nullable(),
  difference: signedDecimalSchema.nullable(),
  changePercent: signedDecimalSchema.nullable(),
  status: z.enum(["ok", "missing_data", "currency_unavailable", "zero_baseline"]),
});

export const sourceSchema = z.object({
  id: z.string(),
  kind: z.enum(["business", "knowledge"]),
  title: z.string(),
  content: z.string(),
});

export const factsSchema = z.object({
  date: z.iso.date(),
  baselineDate: z.iso.date(),
  sales: salesComparisonSchema,
  ranking: rankingResultSchema,
  signals: z.array(
    z.object({
      type: z.literal("sales_drop"),
      description: z.string(),
      evidenceIds: z.array(z.string()).min(1),
    }),
  ),
});

// 模型只生成解释性字段，数值事实由程序填入。
const explanationSchema = z.object({
  text: z.string().min(1),
  evidenceIds: z.array(z.string()).min(1).describe("只能引用输入 sources 中已有的 id"),
});

export const interpretationSchema = z.object({
  hypotheses: z.array(explanationSchema).max(3).describe("尚未证实的可能原因；依据不足时返回空数组"),
  recommendations: z.array(explanationSchema).max(3).describe("建议进行的核查或改进，不表示已经执行"),
});

export const businessReportSchema = z.object({
  version: z.literal(1),
  facts: factsSchema,
  interpretation: interpretationSchema,
  sources: z.array(sourceSchema),
  warnings: z.array(z.string()),
});

export type SalesResult = z.infer<typeof salesResultSchema>;
export type SalesComparison = z.infer<typeof salesComparisonSchema>;
