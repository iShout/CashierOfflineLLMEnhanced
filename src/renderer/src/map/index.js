import CONSTANT from "@renderer/const";
const { ORDER_STATUS, ORDER_CHANNEL, PAYMENT_STATUS, DINE_TYPE } = CONSTANT;
export const orderStatusMap = new Map([
  [`O${ORDER_STATUS.PENDING}`, { themeColor: "#FCF7DC", textColor: "#E59B04", text: "order.pending" }],
  [`O${ORDER_STATUS.TAKEN}`, { themeColor: "#F6E8D8", textColor: "#FF6B00", text: "order.taken" }],
  [`O${ORDER_STATUS.WAITING_PICK_UP}`, { themeColor: "#E6EEFF", textColor: "#003498", text: "order.waiting_pick_up" }],
  [`O${ORDER_STATUS.COMPLETE}`, { themeColor: "#FEE9EC", textColor: "#BE0700", text: "order.complete" }],
  [`O${ORDER_STATUS.CANCEL}`, { themeColor: "#D8D8D8", textColor: "#8D8D8D", text: "order.cancel" }],
  [`P${PAYMENT_STATUS.REFUNDED}`, { themeColor: "#5BC0DE", textColor: "#fff", text: "order.refunded" }],
]);

export const orderChannelMap = new Map([
  [ORDER_CHANNEL.TABLE, { text: "map.table_ordering" }],
  [ORDER_CHANNEL.TAKE_OUT, { text: "map.online_ordering" }],
  [ORDER_CHANNEL.WAIT, { text: "map.counter_ordering" }],
]);

export const serviceTypeMap = new Map([
  [DINE_TYPE.DINE_IN, { text: "table_manage.dine_in" }],
  [DINE_TYPE.TAKE_OUT, { text: "table_manage.take_out" }],
]);
