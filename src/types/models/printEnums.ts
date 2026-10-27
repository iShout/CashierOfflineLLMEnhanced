/**
 * 打印关联类型
 */
export enum PrintAssociationType {
  ORDER_NO = 'ORDER_NO', // 订单号
  ORDER_INNER_NO = 'ORDER_INNER_NO', // 订单内部编号
}

/**
 * 打印类型
 */
export enum PrintType {
  ORDER = 1,
  PAYMENT = 2,
  BILL = 3,
  ALL = 4,
  TAKEOUT = 5,
  REFUND = 6,
  KITCHEN = 7,
  LESS_WITHDRAWAL = 8,
}

/**
 * 打印机类型
 */
export enum PrinterTypeEnum {
  /** register */
  REGISTER = 1,
  /** kitchen */
  KITCHEN = 2,
  /** payment */
  PAYMENT = 3,
  /** bill */
  BILL = 4,
}

/**
 * 折扣类型
 */
export enum DiscountTypeEnum {
  /** pwd折扣-整单 */
  PWD_SC_ALL = 1,
  /** 商户自定义折扣 */
  CUSTOM = 2,
  /** pwd折扣-人 */
  PWD_SC_PEOPLE = 3,
  /** sc折扣-整单 */
  SC_ALL = 4,
  /** sc折扣-人数 */
  SC_PEOPLE = 5,
  /** 优惠券 */
  VOUCHER = 6,
}

/**
 * 配送类型
 */
export enum DeliveryTypeEnum {
  GRAB = 1, // Grab配送
  SELF = 2, // 自配送
}

/**
 * 顾客用餐方式
 */
export enum CustomerDiningStyleEnum {
  DINE_IN = 1, // 堂食
  TAKEAWAY = 2, // 打包带走
}
