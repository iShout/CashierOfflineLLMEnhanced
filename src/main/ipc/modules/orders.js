import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";
import { getDishProductList, getProductDetailByProductNo } from "@db/DBManager/dish";
import { getTableAreaList } from "@db/DBManager/restaurant-settings";
import {
  createOrder,
  authManualOrderSerialNumber,
  checkPwdScDiscountIdAvailable,
  createManualOrder,
  cashReceived,
  createPaymentOrder,
  getOrderListByOrderInnerNo,
  getOrderList,
  getUncompleteOrders,
  getUncompleteOrderCount,
  getPendingOrderByTable,
  getCancellableOrdersByTable,
  getCancellableOrderDetail,
  getOrderDetailByInnerNo,
  viewDigitalCopy,
  getOrderHistory,
  orderRefund,
  orderCancel,
  orderTake,
  orderServe,
  orderComplete,
  reduceOrder,
  tableClear,
  changeTable,
} from "@db/DBManager/order-nonsync";

import { notifyUncompleteOrderCountChanged } from "@main/services/uncompleteOrderNotifier";
import { appendMallCertificationOrderRecord } from "@db/DBManager/restaurant-settings-nonsync";

import { refreshScheduledOrderTaskSchedule } from "@main/services/scheduledOrderTaskManager";
import { getCurrentSession } from "@main/authManager";
import { SCHEDULED_ORDER_TASK_TYPE, cancelPendingScheduledOrderTasksByOrder } from "@db/DBManager/scheduled-order-task";

const cancelPendingOrderTasks = (orderInnerNo, taskTypes) => {
  const restaurantId = getCurrentSession().user?.restaurant_id;
  if (!restaurantId || !orderInnerNo) return 0;

  return cancelPendingScheduledOrderTasksByOrder({
    restaurantId,
    orderInnerNo,
    taskTypes,
  });
};

const handleOrderWrite = (channel, handler) => {
  ipcMain.handle(channel, async (event, ...args) => {
    return handler(event, ...args);
  });
};

export function registerOrdersHandlers() {
  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_TABLE_AREA_LIST, (_event, restaurantId) => {
    return getTableAreaList(restaurantId);
  });

  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_DISH_PRODUCT_LIST, (_event, restaurantId) => {
    return getDishProductList(restaurantId);
  });

  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_PRODUCT_DETAIL_BY_PRODUCT_NO, (_event, productNo) => {
    return getProductDetailByProductNo(productNo);
  });
  handleOrderWrite(IPC_CHANNELS.ORDERS.CREATE_ORDER, (_event, req) => {
    const result = createOrder(req);
    notifyUncompleteOrderCountChanged();
    void refreshScheduledOrderTaskSchedule();
    return result;
  });

  // 手动录单确认时先校验 SI/OR，和在线端 auth/serial/number 保持相同调用时机。
  ipcMain.handle(IPC_CHANNELS.ORDERS.AUTH_MANUAL_ORDER_SERIAL_NUMBER, (_event, req) => {
    return authManualOrderSerialNumber(req);
  });

  // 应用 PWD/SC 前，仅检查当前餐厅本地当天已经完成的使用记录。
  ipcMain.handle(IPC_CHANNELS.ORDERS.CHECK_PWD_SC_DISCOUNT_ID_AVAILABLE, (_event, req) => {
    return checkPwdScDiscountIdAvailable(req);
  });

  handleOrderWrite(IPC_CHANNELS.ORDERS.CREATE_MANUAL_ORDER, (_event, req) => {
    const result = createManualOrder(req);
    try {
      appendMallCertificationOrderRecord(result?.order_inner_no ?? req?.order_inner_no);
    } catch (error) {
      console.error("Failed to append mall certification manual order record:", error);
    }
    notifyUncompleteOrderCountChanged();
    void refreshScheduledOrderTaskSchedule();
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_ORDER_LIST_BY_ORDER_INNER_NO, (_event, orderInnerNo) => {
    return getOrderListByOrderInnerNo(orderInnerNo);
  });

  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_ORDER_LIST, (_event, params) => {
    return getOrderList(params);
  });

  // 查询当前餐厅所有未完成订单，用于 pending orders 弹窗
  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_UNCOMPLETE_ORDERS, () => {
    return getUncompleteOrders();
  });

  // 复用未完成订单查询，按桌台过滤；主进程优先使用 table_id，兼容 table_uuid 兜底。
  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_UNCOMPLETE_ORDERS_BY_TABLE, (_event, params = {}) => {
    const tableId = params.table_id;
    const tableUuid = params.table_uuid;

    return getUncompleteOrders().filter((orderGroup) => {
      if (tableId !== undefined && tableId !== null && tableId !== "") {
        return Number(orderGroup?.table_id) === Number(tableId);
      }

      return tableUuid ? orderGroup?.table_uuid === tableUuid : false;
    });
  });

  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_UNCOMPLETE_ORDER_COUNT, () => {
    return getUncompleteOrderCount();
  });
  // 根据桌码查询未完成订单
  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_PENDING_ORDER_BY_TABLE, (_event, params) => {
    return getPendingOrderByTable(params);
  });

  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_CANCELLABLE_ORDERS_BY_TABLE, (_event, params) => {
    return getCancellableOrdersByTable(params);
  });

  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_CANCELLABLE_ORDER_DETAIL, (_event, orderInnerNo) => {
    return getCancellableOrderDetail(orderInnerNo);
  });

  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_ORDER_DETAIL_BY_INNER_NO, (_event, orderInnerNo) => {
    return getOrderDetailByInnerNo(orderInnerNo);
  });

  // 本地生成订单 Digital Copy 图片，替代在线接口 /order-print/preview。
  ipcMain.handle(IPC_CHANNELS.ORDERS.VIEW_DIGITAL_COPY, (_event, req) => {
    return viewDigitalCopy(req);
  });

  // 生成订单/账单/支付/退款/厨房小票打印数据，并在本地记录打印次数和打印状态。

  ipcMain.handle(IPC_CHANNELS.ORDERS.GET_ORDER_HISTORY, (_event, orderInnerNo) => {
    return getOrderHistory(orderInnerNo);
  });

  handleOrderWrite(IPC_CHANNELS.ORDERS.CREATE_PAYMENT_ORDER, (_event, req) => {
    return createPaymentOrder(req);
  });

  handleOrderWrite(IPC_CHANNELS.ORDERS.CASH_RECEIVED, (_event, req) => {
    const result = cashReceived(req);
    cancelPendingOrderTasks(result?.order_inner_no ?? req?.order_inner_no, [
      SCHEDULED_ORDER_TASK_TYPE.QUEUE_UNPAID_CANCEL,
    ]);
    // SM 商场认证在本地现金收款完成后追加单笔交易 CSV；失败不影响订单主流程。
    try {
      appendMallCertificationOrderRecord(result?.order_inner_no ?? req?.order_inner_no);
    } catch (error) {
      console.error("Failed to append mall certification payment record:", error);
    }
    notifyUncompleteOrderCountChanged();
    void refreshScheduledOrderTaskSchedule();
    return result;
  });

  handleOrderWrite(IPC_CHANNELS.ORDERS.ORDER_TAKE, (_event, req) => {
    const result = orderTake(req);
    cancelPendingOrderTasks(result?.order_inner_no ?? req?.order_inner_no, [
      SCHEDULED_ORDER_TASK_TYPE.QUEUE_UNPAID_CANCEL,
    ]);
    notifyUncompleteOrderCountChanged();
    void refreshScheduledOrderTaskSchedule();
    return result;
  });

  handleOrderWrite(IPC_CHANNELS.ORDERS.ORDER_SERVE, (_event, req) => {
    const result = orderServe(req);
    cancelPendingOrderTasks(result?.order_inner_no ?? req?.order_inner_no, [
      SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PREPARE,
      SCHEDULED_ORDER_TASK_TYPE.LEGACY_QUEUE_AUTO_SERVE,
    ]);
    notifyUncompleteOrderCountChanged();
    void refreshScheduledOrderTaskSchedule();
    return result;
  });

  handleOrderWrite(IPC_CHANNELS.ORDERS.ORDER_COMPLETE, (_event, req) => {
    const result = orderComplete(req);
    cancelPendingOrderTasks(result?.order_inner_no ?? req?.order_inner_no, [
      SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PICKUP,
      SCHEDULED_ORDER_TASK_TYPE.TABLE_ORDER_AUTO_COMPLETE,
      SCHEDULED_ORDER_TASK_TYPE.LEGACY_PAID_ORDER_AUTO_COMPLETE,
    ]);
    notifyUncompleteOrderCountChanged();
    void refreshScheduledOrderTaskSchedule();
    return result;
  });

  handleOrderWrite(IPC_CHANNELS.ORDERS.REDUCE_ORDER, (_event, req) => {
    const result = reduceOrder(req);
    notifyUncompleteOrderCountChanged();
    return result;
  });

  handleOrderWrite(IPC_CHANNELS.ORDERS.TABLE_CLEAR, (_event, req) => {
    const result = tableClear(req);
    // 清台可能一次完成多个桌码订单，逐单清除所有尚未领取的任务。
    (result?.order_inner_no ?? []).forEach((orderInnerNo) => {
      cancelPendingOrderTasks(orderInnerNo);
    });
    notifyUncompleteOrderCountChanged();
    void refreshScheduledOrderTaskSchedule();
    return result;
  });

  handleOrderWrite(IPC_CHANNELS.ORDERS.CHANGE_TABLE, (_event, req) => {
    const result = changeTable(req);
    notifyUncompleteOrderCountChanged();
    return result;
  });

  handleOrderWrite(IPC_CHANNELS.ORDERS.ORDER_REFUND, (_event, req) => {
    const result = orderRefund(req);
    cancelPendingOrderTasks(result?.order_inner_no ?? req?.order_inner_no);
    // SM 商场认证在退款成功后追加单笔退款 CSV；失败不影响退款主流程。
    try {
      appendMallCertificationOrderRecord(result?.order_inner_no ?? req?.order_inner_no, {
        refund_status: true,
      });
    } catch (error) {
      console.error("Failed to append mall certification refund record:", error);
    }

    void refreshScheduledOrderTaskSchedule();
    return result;
  });

  handleOrderWrite(IPC_CHANNELS.ORDERS.ORDER_CANCEL, (_event, req) => {
    const result = orderCancel(req);
    cancelPendingOrderTasks(result?.order_inner_no ?? req?.order_inner_no);
    notifyUncompleteOrderCountChanged();
    void refreshScheduledOrderTaskSchedule();
    return result;
  });
}
