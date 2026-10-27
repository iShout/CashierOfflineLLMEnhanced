export interface FoodOrderRecord {
  id: number;
  server_id?: number | null;
  restaurant_id: number;
  table_id: number;
  waiter_no: string | null;
  user_no: string;
  order_inner_no: string;
  order_no: string;
  order_payment_id: number | null;
  total_amount: number;
  total_count: number | null;
  service_fee: number | null;
  customer_num: number | null;
  restaurant_type: number | null;
  payment_way: number | null;
  order_status: number;
  payment_status: number | null;
  order_type: number | null;
  order_app: number | null;
  complete_time: string | null;
  remark: string | null;
  cancel_remark: string | null;
  order_print_status: number;
  payment_print_status: number;
  bill_print_status: number;
  create_time: string | null;
  update_time: string | null;
  edit_remark: string;
  region_office_rest_id: number | null;
  headquarter_rest_id: number | null;
  tax_type: number;
  tax_amount: number;
  review_status: number;
  order_channel: number;
  package_fee: number | null;
  take_food_no: string | null;
  customer_dining_style: number;
  refund_payment_id: number | null;
  refund_time: string | null;
  order_serial_number: string | null;
  coupon_code: string | null;
  coupon_amount: number;
  refund_waiter_no: string | null;
  /** 旧订单来源 POS，仅用于兼容历史数据 */
  device_no: string | null;
}

export interface FoodOrderPrintInfoRecord {
  id: number;
  server_id?: number | null;
  /** 餐厅主键ID */
  restaurant_id: number;
  /** 订单编号 */
  order_no: string;
  /** 订单类型 1 ORDER 2 PAYMENT 3 BILL */
  print_type: number;
  /** 关联类型 1 orderNo 2 order_inner_no */
  association_type: number;
  /** 设备编号 */
  device_no: string | null;
  /** 打印订单 ID */
  print_order_id: string | null;
  /** 打印费用 ID */
  print_bill_id: string | null;
  /** 打印支付 ID */
  print_payment_id: string | null;
  /** 打印退款 ID */
  print_refund_id: string | null;
  /** 订单打印内容 */
  content_json: string | null;
  create_time: string | null;
  update_time: string | null;
}

export interface OrderDetailRecord {
  id: number;
  server_id?: number | null;
  /** 订单主键 ID */
  order_id: number;
  /** SKU ID */
  sku_id: number;
  /** 购买数量 */
  count: number;
  /** 菜品金额 */
  sku_amount: number;
  /** 选项附加金额 */
  option_amount: number;
  /** 菜品状态：1. 加菜菜品 2. 取消菜品 */
  detail_type: number;
  /** 详情快照 */
  detail_snapshot: string | null;
  create_time: string;
  update_time: string | null;
  /** 减单的源 ID */
  parent_id: number;
}

export interface OrderDetailSnapRecord {
  /** 主键id */
  id: number;
  server_id?: number | null;
  /** food_order 表主键id */
  food_order_id: number;
  /** order_detail 表主键id */
  order_detail_id: number;
  /** 菜品名称 */
  product_name: string;
  /** 菜单图片 */
  menu_img_url: string | null;
  /** 菜品数量 */
  product_count: number;
  /** sku名称 */
  sku_name: string;
  /** sku价格 */
  sku_price: number;
  /** 是否多规格 1.是 2.否 */
  variant: number;
  /** 当前订单所选option名称与option价格的键值对 */
  option_item_json: string | null;
  /** sku版本号 */
  sku_version: number;
  create_time: string;
  update_time: string | null;
}

export interface OrderPaymentRecord {
  id: number;
  server_id?: number | null;
  /** 餐厅主键ID */
  restaurant_id: number;
  /** 付款的用户编号 */
  restaurant_user_id: string | null;
  /** 用户编号 */
  user_no: string;
  /** 内部订单编号 */
  order_inner_no: string;
  /** 上游订单号 */
  mch_order_id: string;
  /** 交易id */
  transaction_id: string | null;
  /** 购买金额 */
  amount: number;
  /** 支付状态 1.未支付 2.支付成功 3.支付失败 4退款中 5 已退款 6 退款待处理 7 退款失败 8取消退款 */
  transaction_status: number;
  /** 支付产品类型 0 现金 1 订单支付 PaymentLink 2 静态VA BillPayment 3 BankTransfer 4 QrStatic (静态) 5 QrDynamic (动态) */
  pay_product_type: number;
  /** 渠道全名 */
  channel_code: string | null;
  /** 支付平台 */
  payment_platform: string;
  /** 是否为餐饮订单最终实际支付的订单: 1是 2否 */
  final_payment_status: number;
  /** 渠道流水创建时间 */
  transaction_create_time: string | null;
  /** 渠道流水更新时间 */
  transaction_return_time: string | null;
  create_time: string | null;
  update_time: string | null;
  /** 实际支付金额 */
  real_amount: number | null;
  /** 优惠人数 */
  discount_number: number | null;
  /** 优惠卡号 */
  discount_no: string | null;
  /** 折扣类型 1、PWD整单折扣，2、普通折扣 3、pwd按人数折扣 4、sc */
  discount_type: number | null;
  /** 实际税收金额 */
  real_tax_amount: number;
  /** 实际服务费金额 */
  real_service_fee: number | null;
  /** 系统交易号（swifood），打印一次加一次，这个大小最多打印十次 */
  system_transaction_no: string | null;
  /** 退款序号 */
  refund_serial_no: string | null;
  /** 优惠券优惠金额 */
  coupon_amount: number | null;
  /** 现金收款金额 */
  cash_receipt_amount: number;
  /** 退款备注 */
  refund_remark: string | null;
  /** 折扣人名称 */
  discounter_name: string | null;
  /** 折扣有效期 */
  discount_validity_period: string | null;
  /** 折扣序号 */
  discount_serial_no: string | null;
  /** 折扣优惠金额 */
  discount_amount: number | null;
  /** 收据号 */
  receipt_no: string | null;
  /** 支付订单创建操作人 */
  waiter_id: number | null;
  /** 实际顾客人数 */
  real_customer_num: number | null;
  /** 附加费 */
  surcharge: number;
  /** 普通折扣类型 1整单折扣 2.菜品折扣 */
  promo_discount_type: number;
  /** 旧支付记录来源 POS，仅用于兼容历史数据 */
  device_no: string | null;
}

export interface OrderPaymentInfoRecord {
  /** 主键id */
  id: number;
  server_id?: number | null;
  /** order_payment 表主键id */
  order_payment_id: number | null;
  /** 交易id */
  transaction_id: string | null;
  /** 上游订单号 */
  mch_order_id: string;
  /** 购买金额 */
  amount: number;
  /** 交易账单金额(用户承担手续费时该字段未包含手续费) */
  transaction_amount_bill: number | null;
  /** 手续费 */
  fee: number | null;
  /** 结算金额 */
  net_settlement: number | null;
  /** 响应参数 */
  response_param: string | null;
  /** 回调参数 */
  callback_param: string | null;
  create_time: string;
  update_time: string | null;
  /** 渠道参考号 */
  channel_reference_no: string | null;
  /** 请求ip */
  request_ip: string | null;
}

export interface OrderPaymentTaxRecord {
  /** 主键id */
  id: number;
  server_id?: number | null;
  /** order_payment 表主键id */
  order_payment_id: number;
  /** 应税销售额 */
  vatable_sales: number | null;
  /** 税费 */
  tax_amount: number | null;
  /** 免税商品税前、折前价格 */
  vat_exempt_sales: number;
  /** 免除税费 */
  vat_exemption: number | null;
  /** 零税率销售额 */
  zero_rated_sales: number;
  create_time: string;
  update_time: string | null;
  /** PWD折扣金额 */
  pwd_discount: number | null;
  /** 减免 VAT */
  less_vat: number | null;
  /** 普通折扣金额 */
  promo_discount: number | null;
  /** vat注册状态 */
  vat_register_status: number | null;
}

export interface OrderSummaryRecord {
  id: number;
  server_id?: number | null;
  /** 餐厅主键ID */
  restaurant_id: number;
  /** 总金额 */
  total_amount: number | null;
  /** 总订单数 */
  total_orders: number | null;
  /** 线上金额 */
  online_amount: number | null;
  /** 线上订单数 */
  online_orders: number | null;
  /** 手续费 */
  fee: number | null;
  /** 线下金额 */
  cash_amount: number | null;
  /** 线下订单数 */
  cash_orders: number | null;
  /** 结算金额 */
  net_settlement: number | null;
  /** 未含税销售额 */
  vat_sales: number | null;
  /** 税费 */
  vat_amount: number | null;
  /** 免税商品税前、折前价格 */
  vat_exempt_sales: number | null;
  /** 免除税费 */
  vat_exemption: number | null;
  /** 零税率销售额 */
  zero_rated_sales: number | null;
  /** PWD折扣金额 */
  pwd_discount: number | null;
  /** 减免 VAT */
  less_vat: number | null;
  /** 普通折扣金额 */
  promo_discount: number | null;
  /** 订单渠道 1线下订单 2线上订单 3.all */
  order_channel: number;
  /** 统计日期 */
  trans_date: string | null;
  create_time: string | null;
  update_time: string | null;
  /** sc折扣 */
  sc_discount: number | null;
  /** 三方服务费（目前就grab配送费） */
  third_party_fee: number;
  /** 服务费统计 */
  service_fee: number;
  /** 旧汇总记录来源 POS，仅用于兼容历史数据 */
  device_no: string | null;
}

export interface OrderStatusChangeRecord {
  id: number;
  server_id?: number | null;
  /** 内部订单编号 */
  order_inner_no: string;
  /** 状态类型 1桌码 2外卖 3排队点餐 */
  status_type: number;
  /** 订单操作 1顾客下单 2商家接单 3开始配送 4到达 5取消 6退款中 7退款成功 8退款失败 9等待骑手（grab）10待取货(grab) 11待取餐（排队点餐）12已支付 13支付失败 14已完成 */
  status: number;
  /** 展示类型 1展示 2不展示 */
  display_type: number;
  /** 操作人id */
  operator_id: number | null;
  /** 备注 */
  remark: string | null;
  /** 创建时间 */
  create_time: string;
  /** 订单编号 */
  order_no: string | null;
  /** 操作人名称 */
  operator_name: string | null;
}

export interface WaiterClockOrderRecord {
  id: number;
  server_id?: number | null;
  /** 餐厅主键ID */
  restaurant_id: number;
  /** 内部订单编号 */
  order_inner_no: string;
  /** 班次打卡记录id 默认0为Self-service */
  restaurant_waiter_clock_record_id: number;
  /** 记录订单类型 1正向订单 2退款订单 3取消订单 */
  record_the_order_type: number;
  /** 服务员类型 1.true waiter 2.Self-service */
  waiter_type: number;
  /** 新老报告状态 1老报告 2新报告 */
  new_old_report_status: number | null;
  /** 创建时间 */
  create_time: string;
  /** 更新时间 */
  update_time: string | null;
}
