import { tool } from "langchain";
import { getCurrentSession } from "@main/authManager";
import { getOrderDetailByInnerNo } from "@db/DBManager/order-nonsync";
import { queryCurrentContry } from "@db/DBManager/utils";
import { ORDER_STATUS, PAYMENT_STATUS } from "@db/constants/order";
import { orderDetailQuerySchema } from "../schemas.js";

// 收银金额使用最小货币单位存储；工具只负责展示转换，不重新计算订单总额。
const formatMoney = (minorAmount: number): string => {
  return (Number(minorAmount) / 100).toFixed(2);
};

export const getOrderDetail = tool(
  async ({ orderInnerNo }) => {
    try {
      // 工具执行时再次检查当前会话，避免模型等待期间登录状态已经失效。
      getCurrentSession();

      // 直接复用收银业务方法，不能通过 ipcMain.handle 间接调用。
      const detail = getOrderDetailByInnerNo(orderInnerNo);

      // 业务方法已经按登录餐厅隔离；离线项目不再用历史 POS 字段二次过滤。
      if (!detail) {
        return JSON.stringify({
          success: true,
          found: false,
          source: "cashier_sqlite",
          order_inner_no: orderInnerNo,
          message: "当前餐厅下没有找到该整单编号。",
        });
      }

      const country = queryCurrentContry();

      return JSON.stringify({
        success: true,
        found: true,
        source: "cashier_sqlite",
        order_inner_no: detail.order_inner_no,
        order_no: detail.order_no,
        table_name: detail.table_name,
        order_status: ORDER_STATUS[detail.order_status] ?? "UNKNOWN",
        payment_status:
          detail.payment_status == null ? "UNKNOWN" : (PAYMENT_STATUS[detail.payment_status] ?? "UNKNOWN"),
        currency: country?.currency_unit?.trim() || null,

        // amount 和 real_amount 都直接采用现有业务方法返回的整单金额口径。
        amount: formatMoney(detail.amount),
        paid_amount: detail.real_amount == null ? null : formatMoney(detail.real_amount),

        items: detail.items.map((item) => ({
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: formatMoney(item.price),
          subtotal: formatMoney(item.total_amount),
        })),
      });
    } catch (error) {
      // 原始异常只留在主进程日志，不把数据库或会话错误细节发送给模型。
      console.error("[Agent 工具执行失败] get_order_detail", error);

      return JSON.stringify({
        success: false,
        source: "cashier_sqlite",
        error_code: "ORDER_QUERY_FAILED",
        message: "订单查询执行失败，请确认数据库已经初始化并重新登录后再试。",
      });
    }
  },
  {
    name: "get_order_detail",
    schema: orderDetailQuerySchema,
    description:
      "根据用户提供的完整 order_inner_no 查询当前登录餐厅的真实整单详情，包括主单编号、桌台、状态、业务金额和商品明细。只能读取，不能修改订单。",
  },
);
