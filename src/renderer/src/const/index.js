const CONSTANT = {
  // 认证的商场类型
  MALL: {
    SM: 1,
    PARQAL: 2,
    MEGA_WORLD: 3,
  },
  // 连接状态

  // 打印机类型

  // 打印类型

  STORAGE: {
    RESTAURANT_NO: "RESTAURANT_NO",
    TABLE_UUID: "TABLE_UUID",
    RESTAURANT_INFO: "RESTAURANT_INFO",
    TOKEN: "TOKEN",
    TABLE_INFO: "TABLE_INFO",
    WAITER_NAME: "WAITER_NAME",
    FCM_TOKEN: "FCM_TOKEN",
    A_CC: "A_CC",
    P_CC: "P_CC",
  },
  // 付款模式
  PAYMENT_MODE: {
    PAYMENT_BEFORE: 1,
    PAYMENT_AFTER: 2,
  },
  // 订单状态
  ORDER_STATUS: {
    PENDING: 1, // 待接单
    TAKEN: 2, // 已接单
    COMPLETE: 3, // 已完成
    CANCEL: 4, // 取消
    DELIVERY: 5,
    WAITING_PICK_UP: 5, // 已出餐 or 待取餐
    WAITING_FOR_RIDER: 6, // 等待骑手
    TO_BE_PICKED_UP: 7,
  },
  // 就餐状态
  DINE_TYPE: {
    DINE_IN: 1,
    TAKE_OUT: 2,
  },
  // 订单渠道
  ORDER_CHANNEL: {
    TABLE: 1, // 桌码
    TAKE_OUT: 2, // 外带
    WAIT: 3, // 排队
  },
  // 配送状态
  DELIVERY_STATUS: {
    PENDING: 1,
    TAKEN: 2,
    COMPLETE: 4,
    CANCEL: 5,
    DELIVERY: 3,
    WAITING_FOR_RIDER: 6,
    TO_BE_PICKED_UP: 7,
  },
  //配送类型
  DELIVERY_TYPE: {
    GRAB: 1,
    MERCHANT: 2,
  },
  // 食物状态 (?)
  FOOD_STATUS: {
    NORMAL: 1,
    CANCEL: 2,
  },

  //支付状态
  PAYMENT_STATUS: {
    UNPAY: 1,
    PAY_SUCCESS: 2,
    PAY_FAIL: 3,
    REFUNDING: 4, // 退款中
    REFUNDED: 5, // 已退款
    REFUND_PENDING: 6, // 退款待处理
    REFUND_FAIL: 7, // 退款失败
    REFUND_CANCEL: 8, // 取消退款
  },

  // 支付方式
  PAYMENT_WAY: {
    ONLINE: 1,
    CASH: 2,
  },

  // 图片模式
  IMG_MODE: {
    HAS_IMG: 1,
    NO_IMG: 2,
  },
  VARIANT: {
    // 菜品是否多规格
    SINGLE: 2,
    MULTIPLE: 1,
  },
  PWD_STATUS: {
    OPEN: 1,
    CLOSE: 2,
  },
  PWD_TYPE: {
    NUMBER: 1, // 按持卡人数
    ALL: 2, // 整单折扣
  },
  VAT_INCLUDED: {
    // 是否含税
    YES: 1,
    NO: 2,
  },
  TAX_FEE: {
    ON: 1,
    OFF: 2,
  },
  CHOICE_TYPE: {
    // 选项是否多选
    SINGLE: 1,
    MULTIPLE: 2,
  },
  REQUIRED_TYPE: {
    // 选项是否必填
    YES: 1,
    NO: 2,
  },
  ORDER_TYPE: {
    MAIN: 1,
    ASSISTANT: 2,
  },
  SERVICE_FEE_TYPE: {
    FIXED: 1,
    PERCENTAGE: 2,
    CUSTOM: 3,
  },
  SERVICE_FEE_STATUS: {
    OPEN: 1,
    CLOSE: 2,
  },
  SOLD_OUT: {
    YES: 2,
    NO: 1,
  },
  WAITER_WORK_STATUS: {
    WORKING: 1,
    RESTING: 2,
    OUTED: 3,
  },
  // 打卡照片的类型
  CLOCK_PHOTO_TYPE: {
    IN: 1,
    OUT: 2,
  },
  PAYMENT_CHANNEL_COMPONENTS: {
    PaymentGCash: "PaymentGCash",
    PaymentQRPH: "PaymentQRPH",
  },

  INVENTORY: {
    ON: 1,
    OFF: 2,
  },
  INVENTORY_TYPE: {
    INGREDIENT: 1,
    RETAIL: 2,
  },
  AUTH_CODE: {
    AUTH_CASHIER_NORMAL_DISCOUNT: "AUTH_CASHIER_NORMAL_DISCOUNT",
    AUTH_CASHIER_CUSTOM_DISCOUNT: "AUTH_CASHIER_CUSTOM_DISCOUNT",
    AUTH_CASHIER_INVENTORY: "AUTH_CASHIER_INVENTORY",
    AUTH_CASHIER_ORDERS: "AUTH_CASHIER_ORDERS",
    AUTH_CASHIER_STAFF: "AUTH_CASHIER_STAFF",
    AUTH_CASHIER_LOGIN: "AUTH_CASHIER_LOGIN",
    AUTH_CASHIER_LESS_WITHDRAWAL: "AUTH_CASHIER_LESS_WITHDRAWAL",
    AUTH_CASHIER_DAY_REPORT: "AUTH_CASHIER_DAY_REPORT",
    AUTH_CASHIER_REFUND: "AUTH_CASHIER_REFUND",
  },

  TAKEOUT_STATUS: {
    // 外卖店铺状态
    ON: 1,
    OFF: 2,
  },
  CLOCK_STATUS: {
    // 考勤功能开关
    ON: 1,
    OFF: 2,
  },
  WORK_STATUS: {
    // 员工工作状态
    WORKING: 1, // 上班中
    REST: 2, // 休息中
    OFF: 3, // 下班
  },
  PROCESS_TYPE: {
    // 点餐类型 桌码点餐 | 排队点餐
    TABLE_ORDER: "TABLE_ORDER",
    COUNTER_ORDER: "COUNTER_ORDER",
  },
  CASHIER_MODE: {
    TABLE_ORDER: 1,
    COUNTER_ORDER: 3,
  },

  ORDER_METHODS: {
    SCAN_TO_ORDER: 1, // 扫码下单
    TAKE_OUT: 3, // 外卖点餐
    QUEUE_TO_ORDER: 4, // 排队点餐
  },

  CUSTOM_DISCOUNT_TYPE: {
    // 自定义折扣类型
    PERCENTAGE: 1, // 百分比
    FIXED_AMOUNT: 2, // 固定减去的金额
  },
  SWITCH_STATUS: {
    // 通用状态
    ON: 1,
    OFF: 2,
  },
  ORDER_APP: {
    MANUAL_ORDER: 7, // 手动录单
  },
  //优惠券类型
  DISCOUNT_TYPE: {
    PWD: 1,
    CUSTOM: 2,
    PWD_NUMBER: 3,
    SC: 4,
    SC_NUMBER: 5,
    VOUCHER: 6,
  },

  MODE: {
    BEFORE_MEAL: 1,
    AFTER_MEAL: 2,
  },
};

export default CONSTANT;
