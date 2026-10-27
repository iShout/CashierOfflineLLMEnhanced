import { STATUS_TYPE } from "@shared/constants/enums";

const SWITCH_ON = 1;
const TABLE_ORDER_ROUTE = { to: "/" };
const QUEUE_ORDER_ROUTE = {
  to: "/table-menu/counter",
  state: { status_type: STATUS_TYPE.QUEUE },
};
const OFFLINE_ORDERS_ROUTE = { to: "/offline-orders" };

export const hasDefaultOrderingSettings = (restaurantSetting) =>
  ["table_order_status", "wait_order_status", "cashier_mode"].every((key) =>
    Object.prototype.hasOwnProperty.call(restaurantSetting ?? {}, key),
  );

export const getDefaultOrderingRoute = (restaurantSetting) => {
  const tableOrderEnabled = Number(restaurantSetting?.table_order_status) === SWITCH_ON;
  const waitOrderEnabled = Number(restaurantSetting?.wait_order_status) === SWITCH_ON;

  // 两种点餐都关闭时，系统入口默认展示线下订单。
  if (!tableOrderEnabled && !waitOrderEnabled) {
    return OFFLINE_ORDERS_ROUTE;
  }

  // 只开启一种点餐模式时，忽略收银模式配置并进入已开启的模式。
  if (tableOrderEnabled !== waitOrderEnabled) {
    return tableOrderEnabled ? TABLE_ORDER_ROUTE : QUEUE_ORDER_ROUTE;
  }

  // 两种模式都开启时，cashier_mode=3 默认排队点餐，其余值兼容回退到桌码点餐。
  return Number(restaurantSetting?.cashier_mode) === STATUS_TYPE.QUEUE ? QUEUE_ORDER_ROUTE : TABLE_ORDER_ROUTE;
};
