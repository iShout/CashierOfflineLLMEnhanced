// 订单相关ipc

import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";

export const ordersApi = {
  getTableAreaList(restaurantId) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_TABLE_AREA_LIST, restaurantId);
  },
  getDishProductList(restaurantId) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_DISH_PRODUCT_LIST, restaurantId);
  },
  getProductDetailByProductNo(productNo) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_PRODUCT_DETAIL_BY_PRODUCT_NO, productNo);
  },
  createOrder(createOrderParams) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.CREATE_ORDER, createOrderParams);
  },
  authManualOrderSerialNumber(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.AUTH_MANUAL_ORDER_SERIAL_NUMBER, params);
  },
  checkPwdScDiscountIdAvailable(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.CHECK_PWD_SC_DISCOUNT_ID_AVAILABLE, params);
  },
  createManualOrder(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.CREATE_MANUAL_ORDER, params);
  },
  getOrderListByOrderInnerNo(orderInnerNo) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_ORDER_LIST_BY_ORDER_INNER_NO, orderInnerNo);
  },

  getOrderList(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_ORDER_LIST, params);
  },
  // 查询当前餐厅所有未完成订单，用于 pending orders 弹窗
  getUncompleteOrders() {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_UNCOMPLETE_ORDERS);
  },
  // 查询指定桌台未完成订单组；主进程优先使用 table_id，也兼容 table_uuid。
  getUncompleteOrdersByTable(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_UNCOMPLETE_ORDERS_BY_TABLE, params);
  },
  getUncompleteOrderCount() {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_UNCOMPLETE_ORDER_COUNT);
  },
  getPendingOrderByTable(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_PENDING_ORDER_BY_TABLE, params);
  },
  onUncompleteOrderCountChanged(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.ORDERS.UNCOMPLETE_ORDER_COUNT_CHANGED, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ORDERS.UNCOMPLETE_ORDER_COUNT_CHANGED, listener);
    };
  },
  onScheduledTaskExecuted(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.ORDERS.SCHEDULED_TASK_EXECUTED, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ORDERS.SCHEDULED_TASK_EXECUTED, listener);
    };
  },
  getCancellableOrdersByTable(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_CANCELLABLE_ORDERS_BY_TABLE, params);
  },
  getCancellableOrderDetail(orderInnerNo) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_CANCELLABLE_ORDER_DETAIL, orderInnerNo);
  },
  getOrderDetailByInnerNo(orderInnerNo) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_ORDER_DETAIL_BY_INNER_NO, orderInnerNo);
  },
  // 预览订单 Digital Copy，主进程返回图片 data URL。
  viewDigitalCopy(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.VIEW_DIGITAL_COPY, params);
  },
  // 生成订单小票打印数据，并让主进程更新本地打印快照状态。

  getOrderHistory(orderInnerNo) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.GET_ORDER_HISTORY, orderInnerNo);
  },
  createPaymentOrder(paymentOrderParams) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.CREATE_PAYMENT_ORDER, paymentOrderParams);
  },
  cashReceived(cashReceivedParams) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.CASH_RECEIVED, cashReceivedParams);
  },

  orderTake(takeParams) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.ORDER_TAKE, takeParams);
  },
  orderServe(serveParams) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.ORDER_SERVE, serveParams);
  },
  orderComplete(completeParams) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.ORDER_COMPLETE, completeParams);
  },
  reduceOrder(reduceParams) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.REDUCE_ORDER, reduceParams);
  },
  tableClear(clearParams) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.TABLE_CLEAR, clearParams);
  },
  changeTable(changeTableParams) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.CHANGE_TABLE, changeTableParams);
  },
  orderRefund(refundParams) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.ORDER_REFUND, refundParams);
  },
  orderCancel(cancelParams) {
    return ipcRenderer.invoke(IPC_CHANNELS.ORDERS.ORDER_CANCEL, cancelParams);
  },
};
