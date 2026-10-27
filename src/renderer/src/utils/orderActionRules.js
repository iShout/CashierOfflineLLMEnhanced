import CONSTANT from "@renderer/const";

const { ORDER_STATUS, PAYMENT_STATUS, PAYMENT_MODE, ORDER_CHANNEL, ORDER_APP } = CONSTANT;

// 线下订单详情页 Edit Order 下拉菜单的动作枚举。
export const ORDER_EDIT_ACTION = {
  TAKE: "TAKE",
  CANCEL: "CANCEL",
  SERVE: "SERVE",
  COMPLETE: "COMPLETE",
  BILL_OUT: "BILL_OUT",
};

// Pending Orders 弹窗底部按钮的动作枚举。
export const PENDING_ORDER_ACTION = {
  CANCEL: "CANCEL",
  TAKE: "TAKE",
  BILL_OUT: "BILL_OUT",
  COMPLETE: "COMPLETE",
  SERVE: "SERVE",
  REFUND: "REFUND",
};

// 判断订单是否仍处于未支付或支付失败状态。
export const isUnpaid = (paymentStatus) => [PAYMENT_STATUS.UNPAY, PAYMENT_STATUS.PAY_FAIL].includes(paymentStatus);

// 判断订单是否可视为已支付，包含退款失败后仍可继续履约的状态。
export const isPaid = (paymentStatus) =>
  [PAYMENT_STATUS.PAY_SUCCESS, PAYMENT_STATUS.REFUND_FAIL].includes(paymentStatus);

// 判断订单是否曾经进入支付链路，用于隐藏重复 Bill Out。
export const hasPaid = (paymentStatus) =>
  [
    PAYMENT_STATUS.PAY_SUCCESS,
    PAYMENT_STATUS.REFUNDING,
    PAYMENT_STATUS.REFUNDED,
    PAYMENT_STATUS.REFUND_PENDING,
    PAYMENT_STATUS.REFUND_FAIL,
  ].includes(paymentStatus);

// 判断订单是否正在退款中，退款中不允许继续状态流转。
export const isRefunding = (paymentStatus) =>
  [PAYMENT_STATUS.REFUNDING, PAYMENT_STATUS.REFUND_PENDING].includes(paymentStatus);

// 兼容订单详情 status 和同步表 order_status 两种字段命名。
export const getOrderStatus = (order) => order?.status ?? order?.order_status;

// 判断当前账号是否拥有指定操作权限。
export const hasAuth = (authList, authCode) => Array.isArray(authList) && authList.includes(authCode);

// 计算线下订单详情页右下角按钮显隐，规则对齐 web 在线项目。
export const getOrderActionFlags = ({ order, isBeforeMeal, isPhilippines = true, hasRefundAuth = false }) => {
  const status = getOrderStatus(order);
  const { payment_status, order_channel, order_app, payable = true } = order ?? {};
  const isWaitOrder = order_channel === ORDER_CHANNEL.WAIT;
  const isManualOrder = order_app === ORDER_APP.MANUAL_ORDER;
  const receiptStatusShown = [ORDER_STATUS.TAKEN, ORDER_STATUS.WAITING_PICK_UP, ORDER_STATUS.COMPLETE].includes(status);

  const showTakeBtn = isWaitOrder
    ? status === ORDER_STATUS.PENDING && isPaid(payment_status) && !isRefunding(payment_status)
    : ((status === ORDER_STATUS.PENDING && isBeforeMeal && isPaid(payment_status)) ||
        (!isBeforeMeal && status === ORDER_STATUS.PENDING && isUnpaid(payment_status))) &&
      !isRefunding(payment_status);
  const showCancelBtn = isWaitOrder
    ? isUnpaid(payment_status) && status === ORDER_STATUS.PENDING && !isRefunding(payment_status)
    : ((isBeforeMeal && isUnpaid(payment_status) && status === ORDER_STATUS.PENDING) ||
        (!isBeforeMeal && isUnpaid(payment_status) && [ORDER_STATUS.PENDING, ORDER_STATUS.TAKEN].includes(status))) &&
      !isRefunding(payment_status);
  const showServeBtn = status === ORDER_STATUS.TAKEN && !isRefunding(payment_status) && isWaitOrder;
  const showCompleteBtn =
    !isRefunding(payment_status) &&
    (isWaitOrder ? status === ORDER_STATUS.WAITING_PICK_UP : status === ORDER_STATUS.TAKEN && isPaid(payment_status));
  const showBillBtn =
    !isWaitOrder &&
    payable &&
    (isBeforeMeal
      ? !hasPaid(payment_status) && status === ORDER_STATUS.PENDING
      : !hasPaid(payment_status) && status === ORDER_STATUS.TAKEN);

  return {
    isWaitOrder,
    isManualOrder,
    receiptStatusShown,
    showTakeBtn,
    showCancelBtn,
    showServeBtn,
    showCompleteBtn,
    showBillBtn,
    showEditBtn: showTakeBtn || showCancelBtn || showServeBtn || showCompleteBtn || showBillBtn,
    showEjournalBtn:
      [PAYMENT_STATUS.PAY_SUCCESS, PAYMENT_STATUS.REFUNDED].includes(payment_status) && isPhilippines && !isManualOrder,
    showRefundBtn: hasRefundAuth && [PAYMENT_STATUS.PAY_SUCCESS, PAYMENT_STATUS.REFUND_FAIL].includes(payment_status),
    showReceiptBtn:
      receiptStatusShown ||
      (isBeforeMeal && status === ORDER_STATUS.PENDING && payment_status === PAYMENT_STATUS.PAY_SUCCESS),
  };
};

// 计算 Pending Orders 弹窗底部按钮列表和顺序，规则对齐 web 在线项目。
export const getPendingOrderActions = ({ order, mode }) => {
  const status = getOrderStatus(order);
  const paymentStatus = order?.payment_status;
  const isWaitOrder = order?.order_channel === ORDER_CHANNEL.WAIT;
  const isBeforeMeal = mode === PAYMENT_MODE.PAYMENT_BEFORE;

  // 对齐在线端 OrderNoticeModal 的底部按钮顺序。
  if (isWaitOrder) {
    if (status === ORDER_STATUS.PENDING && isUnpaid(paymentStatus)) return [PENDING_ORDER_ACTION.CANCEL];
    if (status === ORDER_STATUS.PENDING && isPaid(paymentStatus)) {
      return [PENDING_ORDER_ACTION.REFUND, PENDING_ORDER_ACTION.TAKE];
    }
    if (status === ORDER_STATUS.TAKEN) return [PENDING_ORDER_ACTION.REFUND, PENDING_ORDER_ACTION.SERVE];
    if (status === ORDER_STATUS.WAITING_PICK_UP) {
      return [PENDING_ORDER_ACTION.REFUND, PENDING_ORDER_ACTION.COMPLETE];
    }
  }

  if (isBeforeMeal) {
    if (status === ORDER_STATUS.PENDING && isUnpaid(paymentStatus)) {
      return [PENDING_ORDER_ACTION.CANCEL, PENDING_ORDER_ACTION.BILL_OUT];
    }
    if (status === ORDER_STATUS.PENDING && isPaid(paymentStatus)) {
      return [PENDING_ORDER_ACTION.REFUND, PENDING_ORDER_ACTION.TAKE];
    }
    if (status === ORDER_STATUS.TAKEN && isPaid(paymentStatus)) {
      return [PENDING_ORDER_ACTION.REFUND, PENDING_ORDER_ACTION.COMPLETE];
    }
  } else {
    if (status === ORDER_STATUS.PENDING) return [PENDING_ORDER_ACTION.CANCEL, PENDING_ORDER_ACTION.TAKE];
    if (status === ORDER_STATUS.TAKEN && isUnpaid(paymentStatus)) {
      return [PENDING_ORDER_ACTION.CANCEL, PENDING_ORDER_ACTION.BILL_OUT];
    }
    if (status === ORDER_STATUS.TAKEN && isPaid(paymentStatus)) {
      return [PENDING_ORDER_ACTION.REFUND, PENDING_ORDER_ACTION.COMPLETE];
    }
  }

  return [];
};
