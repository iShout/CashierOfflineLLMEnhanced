import dayjs from "dayjs";
import { tool } from "langchain";
import { getCurrentSession } from "@main/authManager";
import { querySummaryReport } from "@db/DBManager/reports-nonsync";
import { queryCurrentContry } from "@db/DBManager/utils";
import { salesSummaryQuerySchema } from "../schemas.js";

// 收银金额使用最小货币单位；这里只进行展示转换，不重新计算业务金额。
const formatMoney = (minorAmount: number): string => {
  return (Number(minorAmount) / 100).toFixed(2);
};

export const getSalesSummary = tool(
  async ({ dateStart, dateEnd }) => {
    try {
      const session = getCurrentSession();
      const restaurantId = session.user?.restaurant_id;

      // 按收银机本地自然日生成查询边界，不使用固定模拟日期。
      const startTime = dayjs(dateStart).startOf("day").toDate();
      const endTime = dayjs(dateEnd).endOf("day").toDate();

      if (!restaurantId) {
        throw new Error("Current session restaurant_id is missing.");
      }

      const report = await querySummaryReport({
        restaurantId,
        startTime,
        endTime,
      });
      const country = queryCurrentContry();
      const hasData = report.productSummaryInfos.length > 0;
      return JSON.stringify({
        success: true,
        has_data: hasData,
        source: "cashier_sqlite",
        business_date: startTime,
        currency: country?.currency_unit?.trim() || null,

        // 所有金额直接采用现有报表业务方法的返回口径。
        total_amount: formatMoney(report.totalAmount),
        subtotal_amount: formatMoney(report.subAmount),
        discount_amount: formatMoney(report.discountAmount),
        sold_item_count: report.productCount,
      });
    } catch (error) {
      // 原始错误只记录在主进程，避免数据库细节进入模型上下文。
      console.error("[Agent 工具执行失败] get_sales_summary", error);

      return JSON.stringify({
        success: false,
        source: "cashier_sqlite",
        error_code: "SALES_SUMMARY_QUERY_FAILED",
        message: "销售汇总查询失败，请确认数据库已经初始化并重新登录后再试。",
      });
    }
  },
  {
    name: "get_sales_summary",
    schema: salesSummaryQuerySchema,
    description:
      "按 YYYY-MM-DD 查询当前登录餐厅、全部收银员的真实自然日销售汇总，包括支付总金额、商品小计、折扣和售出商品数量。只能读取。",
  },
);
