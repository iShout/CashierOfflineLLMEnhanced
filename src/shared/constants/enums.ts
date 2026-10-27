//  -----------------------主进程和渲染进程共用的常量 --------------------------
export const RESPONSE_CODE = {
  SUCCESS: 10000,
  ERROR: 10001,
  EXPIRED: 20001,
} as const;

// 本地系统自动生成的 order_payment.receipt_no 位数；手写 SI/OR 不能伪装成同位数纯数字系统号。
export const SYSTEM_RECEIPT_NO_LENGTH = 20;

export const DATA_SYNCHRONIZATION_MODULES = {
  // 特殊记录：最近一次任意模块同步成功的事件时间，不代表业务模块。
  LAST_EVENT: 0,
  // 特殊记录：最近一次全量同步成功时间，不会被单模块同步刷新。
  FULL_SYNC: 7,
  ACCOUNT: 1,
  RESTAURANT_CONFIG: 2,
  DISH: 3,
  CLOCK_IN: 4,
  REPORT: 5,
  ORDER: 6,
} as const;

export const DATA_SYNCHRONIZATION_STATUS = {
  // 从未同步过，UI 展示为待同步或 Never。
  NEVER: 0,
  // 最近一次同步成功。
  SUCCESS: 1,
  // 最近一次同步失败，成功时间不被覆盖。
  FAILED: 2,
} as const;

export const WAITER_STATUS = {
  WORKING: 1,
  RESTING: 2,
  OUTED: 3,
} as const;

export const CUSTOMER_DINING_STYLE = {
  DINING_ROOM: 1,
  TAKE_AWAY: 2,
};

export const ORDER_CHANNEL = {
  TABLE: 1,
  QUEUE: 3,
};

export const CUSTOM_DISCOUNT_TYPE = {
  // 自定义折扣类型
  PERCENTAGE: 1, // 百分比
  FIXED_AMOUNT: 2, // 固定减去的金额
};

//餐厅设置的额服务费类型
export const SERVICE_FEE_TYPE = {
  FIXED_AMOUNT: 1,
  PERCENTAGE: 2,
  CUSTOM: 3,
};

// 状态类型
export const STATUS_TYPE = {
  TABLE: 1, // 桌码点餐
  TAKEOUT: 2, // 外卖
  QUEUE: 3, // 排队点餐
};
