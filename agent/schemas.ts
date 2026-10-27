import dayjs from "dayjs";
import { z } from "zod";

const MAX_QUERY_DAYS = 7;

export const orderDetailQuerySchema = z.object({
  orderInnerNo: z
    .string()
    .trim()
    .min(1, "order_inner_no 不能为空")
    .max(100, "order_inner_no 长度不能超过 100")
    .describe("用户提供的完整整单编号 order_inner_no；它与具体主单或加菜单编号 order_no 不同，不要改写或补前缀"),
});

// 销售汇总和商品排行共用相同的日期范围约束。
const dateRangeQuerySchema = z
  .object({
    dateStart: z.iso.date().describe("查询起始日期，格式必须为 YYYY-MM-DD"),

    dateEnd: z.iso.date().describe("查询结束日期，格式必须为 YYYY-MM-DD；查询单日时与 dateStart 相同"),
  })
  .superRefine(({ dateStart, dateEnd }, ctx) => {
    const start = dayjs(dateStart).startOf("day");
    const end = dayjs(dateEnd).startOf("day");

    // 结束日期不能早于起始日期。
    if (end.isBefore(start, "day")) {
      ctx.addIssue({
        code: "custom",
        path: ["dateEnd"],
        message: "结束日期不能早于起始日期",
      });

      return;
    }

    // 加 1 是因为起始日和结束日都属于查询范围。
    const queryDays = end.diff(start, "day") + 1;

    if (queryDays > MAX_QUERY_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["dateEnd"],
        message: `查询范围最多包含 ${MAX_QUERY_DAYS} 个自然日`,
      });
    }
  });

export const salesSummaryQuerySchema = dateRangeQuerySchema;

// safeExtend 会保留 dateRangeQuerySchema 上的 superRefine 校验。
export const productRankingQuerySchema = dateRangeQuerySchema.safeExtend({
  sortBy: z
    .enum(["quantity", "subtotal_amount"])
    .default("quantity")
    .describe("quantity 表示按销量排序；subtotal_amount 表示按商品汇总金额排序"),

  limit: z
    .number()
    .int("返回数量必须是整数")
    .min(1, "返回数量不能小于 1")
    .max(20, "返回数量不能超过 20")
    .default(10)
    .describe("返回前多少项数据"),
});
