import { tool } from "langchain";
import { getCurrentSession } from "@main/authManager";
import { querySummaryReport } from "@db/DBManager/reports-nonsync";
import { queryCurrentContry } from "@db/DBManager/utils";
import { productRankingQuerySchema } from "../schemas.js";
import dayjs from "dayjs";

const formatMoney = (minorAmount: number): string => {
  return (Number(minorAmount) / 100).toFixed(2);
};

export const getProductRanking = tool(
  async ({ dateStart, dateEnd, sortBy, limit }) => {
    try {
      const session = getCurrentSession();
      const restaurantId = session.user?.restaurant_id;
      // 按收银机本地自然日生成查询边界，不使用固定模拟日期。
      const startTime = dayjs(dateStart).startOf("day").toDate();
      const endTime = dayjs(dateEnd).endOf("day").toDate();

      if (!restaurantId) {
        throw new Error("Current session restaurant_id is missing.");
      }

      const res = await querySummaryReport({ restaurantId, startTime, endTime });
      const products = [...res.productSummaryInfos]
        .sort((left, right) => {
          if (sortBy === "subtotal_amount") {
            return right.totalAmount - left.totalAmount;
          }
          return right.quantity - left.quantity;
        })
        .slice(0, limit)
        .map((item, index) => ({
          rank: index + 1,
          product_no: item.productNo ?? null,
          sku_no: item.skuNo ?? null,
          product_name: item.productName,
          spec_name: item.specName || null,
          category_name: item.categoryName || null,
          quantity: item.quantity,
          unit_price: formatMoney(item.price),
          subtotal_amount: formatMoney(item.totalAmount),
        }));
      const country = queryCurrentContry();

      return JSON.stringify({
        has_data: products.length > 0,
        sort_by: sortBy,
        currency: country?.currency_unit?.trim() || null,
        ranking: products,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        source: "cashier_sqlite",
        error_code: "PRODUCT_RANKING_QUERY_FAILED",
        message: "商品排行查询失败，请确认数据库已经初始化并重新登录后再试。",
      });
    }
  },
  {
    name: "get_product_ranking",
    schema: productRankingQuerySchema,
    description: "按日期查询当前登录餐厅的真实商品或规格排行，可按销量或商品汇总金额排序。只能读取。",
  },
);
