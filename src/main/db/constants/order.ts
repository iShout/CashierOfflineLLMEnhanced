export const PRODUCT_STATUS = {
  VALID: 1,
} as const

export enum ORDER_STATUS {
  PROCESSING = 1, // 待接单
  RECEIVED = 2, //已接单
  COMPLETED = 3, //已完成
  CANCEL = 4, //取消
  AWAITING_PICKUP = 5, // 待取餐
}

export enum ORDER_TYPE {
  MASTER = 1, // 主订单
  SLAVE = 2, // 加菜订单
}

export enum PAYMENT_STATUS {
  UNPAY = 1,
  PAY_SUCCESS = 2,
  FAILED = 3,
  REFUNDING = 4,
  REFUNDED = 5,
  REFUND_PENDING = 6,
  REFUND_FAILED = 7,
  REFUND_CANCEL = 8,
}

export enum ORDER_CHANGE_STATUS {
  PLACE_ORDER = 1, // 下单
  ORDERS = 2, // 接单
  START_DELIVERY = 3, // 开始配送（配送中）
  DELIVERY_COMPLETED = 4, // 配送完成
  DELIVERY_FAILED = 5, // 取消
  INITIATE_A_REFUND = 6, // 发起退款
  REFUND_SUCCESSFUL = 7, // 退款成功
  REFUND_FAILED = 8, // 退款失败
  WAITING_FOR_RIDER = 9, // 等待骑手（grab）
  PICK_UP_AN_ORDER = 10, // 待取货(grab)
  MEALS_TO_BE_SERVED = 11, // 待取餐（排队点餐）
  PAID = 12, // 已支付
  PAYMENT_FAILED = 13, // 支付失败
  COMPLETED = 14, // 已完成
}
/**
 * 审核状态枚举 (对应 restaurant_operation_config.audit_status)
 */
export enum AUDIT_STATUS {
  PENDING_SUBMISSION = 1, // 待提交（撤回）
  PENDING_REVIEW = 2, // 待审核
  PASS_THE_EXAMINATION = 3, // 审核通过
  REJECTED = 4, // 驳回
}
/**
 * 订单记录类型枚举 (对应 waiter_clock_order.record_the_order_type)
 */
export enum RECORD_THE_ORDER_TYPE {
  POSITIVE_ORDER = 1, // 正向订单
  REFUND_ORDER = 2, // 退款订单
  CANCEL_ORDER = 3, // 取消订单
}

/**
 * 打卡订单记录类型 (对应 waiter_clock_order.record_the_order_type)
 */
export enum CLOCK_ORDER_TYPE {
  PAYMENT_ORDER = 1, // 支付订单
  REFUND_ORDER = 2, // 退款订单
  CANCEL_ORDER = 3, // 取消订单
}

/**
 * 服务员类型枚举 (对应 waiter_clock_order.waiter_type)
 */
export enum WAITER_TYPE {
  REAL_WAITER = 1, // 真实服务员
  SELF_SERVICE = 2, // 自助服务
}

export enum WAITER_STATUS {
  WORKING = 1, // 上班
  RESTING = 2, // 休息
  OFF = 3, // 下班
}
