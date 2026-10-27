/**
 * 打印小票多语言配置
 */

export interface PrintReceiptTranslations {
  // 头部
  time: string
  reprint: (count: number) => string

  // 餐厅信息
  ownedAndOperatedBy: (name: string) => string
  vatRegTin: (tin: string) => string
  minNumber: (min: string) => string
  serialNumber: (serial: string) => string

  // 订单信息
  orderId: (id: string) => string
  orderTime: (time: string) => string
  table: (tableNo: string) => string
  custCnt: (count: number) => string
  cashier: string
  printTime: string

  // 分隔标题
  orderTitle: string
  paymentReceiptTitle: string
  kitchenOrderTitle: string
  billReceiptTitle: string

  // 商品列表
  qtyItem: string
  subtotal: string

  // 金额汇总
  numberOfItems: string
  subTotal: string
  serviceFee: string
  discount: string
  tax: string
  totalAmount: string

  // 支付信息
  totalAmountLabel: string
  paidAmount: string
  change: string

  // 底部
  companyName: string
  companyAddress: string
  thisDoesNotServeAsInvoice: string
  poweredBy: string

  // 厨房小票
  qty: string
  category: string
  note: string

  // BIR信息
  acc: (ptu: string) => string
  dateIssued: (date: string) => string
  validUntil: (date: string) => string
  ptu: (number: string) => string

  // 其他
  tbl: string
  cust: string
  paymentChannel: string

  // 用餐方式
  dineIn: string
  takeaway: string

  // Bill小票
  waiter: string
  userInfo: string
  pwdName: (name: string, id: string) => string
  validThru: (date: string) => string
  pwdId: (id: string) => string
  signature: string
  signHere: string

  // Payment小票
  paymentTitle: string
  invoiceTitle: string
  siNumber: (id: string) => string
  transNumber: (id: string) => string
  deliveryFee: string
  deliveryFeeDiscount: string
  promoDiscount: string
  channelReference: (ref: string) => string
  notValidForInputTax: string
  salesSubToTax: string
  percentTax: string
  exemptSales: string
  lessVat: string
  zeroRatedSales: string

  // Refund小票
  refundTitle: string
  origSiNumber: (id: string) => string
  refundNumber: (id: string) => string
  refundTime: string

  // 报表
  reportTitle: string
  reportDate: string
  reportTime: string
  xCount: (count: string) => string
  begSiNumber: (id: string) => string
  endSiNumber: (id: string) => string
  begRefundNumber: (id: string) => string
  endRefundNumber: (id: string) => string
  openingFund: string
  totalPayments: string
  cancelled: string
  refund: string
  withdrawal: string
  transactionSummary: string
  cashOnHand: string
  lessWithdrawal: string
  paymentsReceived: string
  shortOver: string

  // 产品汇总报表
  productSummaryTitle: string
  qtyOfItems: string
  vouchersDiscount: string
  pwdDiscount: string
  scDiscount: string

  // 日终报告
  endOfDayReportTitle: string
  zCount: (count: string) => string
  begCancelledNumber: (id: string) => string
  endCancelledNumber: (id: string) => string
  presentAccumulatedSales: string
  previousAccumulatedSales: string
  salesOfTheDay: string
  grossAmount: string
  lessDiscount: string
  lessRefund: string
  lessCancelled: string
  lessVatAdjustment: string
  netAmount: string
  serviceChargeAmount: string
  totalServiceCharge: string
  naacDiscount: string
  soloParentDiscount: string
  otherDiscounts: string
  pwdTransCount: string
  scTransCount: string
  regularDiscTransCount: string
  zeroRatedTransCount: string
  vatOnRefund: string
  otherVatAdjustments: string
}

/**
 * 英文翻译
 */
export const enTranslations: PrintReceiptTranslations = {
  time: 'TIME: ',
  reprint: (count) => `** REPRINT ${count} **`,

  ownedAndOperatedBy: (name) => `Owned and Operated By ${name}`,
  vatRegTin: (tin) => `VAT REG TIN: ${tin}`,
  minNumber: (min) => `MIN #: ${min}`,
  serialNumber: (serial) => `SERIAL #: ${serial}`,

  orderId: (id) => `ORDER ID: ${id}`,
  orderTime: (time) => `ORDER TIME: ${time}`,
  table: (tableNo) => `TABLE: ${tableNo}`,
  custCnt: (count) => `CUST CNT: ${count}`,
  cashier: 'CASHIER',
  printTime: 'PRINT TIME',

  orderTitle: '***** ORDER *****',
  paymentReceiptTitle: '*** PAYMENT RECEIPT ***',
  kitchenOrderTitle: '** KITCHEN ORDER **',
  billReceiptTitle: '******* BILL ******',

  qtyItem: 'QTY ITEM',
  subtotal: 'SUBTOTAL',

  numberOfItems: 'Number of Items',
  subTotal: 'SubTotal',
  serviceFee: 'Service Fee',
  discount: 'Discount',
  tax: 'Tax',
  totalAmount: '** Total Amount **',

  totalAmountLabel: 'Total Amount',
  paidAmount: 'Paid Amount',
  change: 'Change',

  companyName: 'Swifood Innovation, Inc',
  companyAddress:
    'Unit 9D, 9th Floor The Valero Tower, 122 Valero Street Salcedo Village, Bel-Air, City of Makati, NCR, Fourth District, Philippines',
  thisDoesNotServeAsInvoice: 'This does not serve as INVOICE.',
  poweredBy: 'Powered by Swifood',

  qty: 'Qty',
  category: 'Category',
  note: 'Note',

  acc: (ptu) => `ACC: ${ptu}`,
  dateIssued: (date) => `DATE ISSUED: ${date}`,
  validUntil: (date) => `VALID UNTIL: ${date}`,
  ptu: (number) => `PTU: ${number}`,

  tbl: 'TBL',
  cust: 'CUST',
  paymentChannel: 'PAYMENT CHANNEL',

  dineIn: 'DINE-IN No:',
  takeaway: 'TAKE-OUT No:',

  // Bill小票
  waiter: 'Waiter',
  userInfo: 'User Info:',
  pwdName: (name, id) => `PWD NAME: ${name}(${id})`,
  validThru: (date) => `VALID THRU: ${date}`,
  pwdId: (id) => `PWD ID: ${id}`,
  signature: 'Signature',
  signHere: 'Sign Here',

  // Payment小票
  paymentTitle: '***** PAYMENT *****',
  invoiceTitle: '***** INVOICE *****',
  siNumber: (id) => `SI #: ${id}`,
  transNumber: (id) => `TRANS #: ${id}`,
  deliveryFee: 'Delivery Fee',
  deliveryFeeDiscount: 'Delivery Fee Discount',
  promoDiscount: 'Promo Discount',
  channelReference: (ref) => `Channel Reference No: ${ref}`,
  notValidForInputTax: 'THIS DOCUMENT IS NOT VALID FOR\nCLAIM OF INPUT TAX',
  salesSubToTax: 'Sales Sub. to % Tax',
  percentTax: '% Tax',
  exemptSales: 'Exempt Sales',
  lessVat: 'Less VAT',
  zeroRatedSales: 'Zero Rated Sales',

  // Refund小票
  refundTitle: '***** REFUND *****',
  origSiNumber: (id) => `ORIG.SI #: ${id}`,
  refundNumber: (id) => `REFUND #: ${id}`,
  refundTime: 'REFUND TIME',

  // 报表
  reportTitle: '***** END-OF-SHIFT REPORT *****',
  reportDate: 'DATE',
  reportTime: 'TIME',
  xCount: (count) => `X Count: ${count}`,
  begSiNumber: (id) => `BEG. SI #         ${id}`,
  endSiNumber: (id) => `END. SI #         ${id}`,
  begRefundNumber: (id) => `BEG. REFUND #     ${id}`,
  endRefundNumber: (id) => `END. REFUND #     ${id}`,
  openingFund: 'OPENING FUND',
  totalPayments: 'TOTAL PAYMENTS',
  cancelled: 'CANCELLED',
  refund: 'REFUND',
  withdrawal: 'WITHDRAWAL',
  transactionSummary: 'TRANSACTION SUMMARY',
  cashOnHand: 'CASH ON HAND',
  lessWithdrawal: 'LESS WITHDRAWAL',
  paymentsReceived: 'PAYMENTS RECEIVED',
  shortOver: 'SHORT/OVER',

  // 产品汇总报表
  productSummaryTitle: '****  SUMMARY OF PRODUCTS  *****',
  qtyOfItems: 'QTY OF ITEMS',
  vouchersDiscount: 'VOUCHERS DISCOUNT',
  pwdDiscount: 'PWD DISCOUNT',
  scDiscount: 'SC DISCOUNT',

  // 日终报告
  endOfDayReportTitle: '***** END-OF-DAY REPORT *****',
  zCount: (count) => `Z Count: ${count}`,
  begCancelledNumber: (id) => `BEG. CANCELLED #  ${id}`,
  endCancelledNumber: (id) => `END. CANCELLED #  ${id}`,
  presentAccumulatedSales: 'PRESENT ACCUMULATED SALES',
  previousAccumulatedSales: 'PREVIOUS ACCUMULATED SALES',
  salesOfTheDay: 'SALES OF THE DAY',
  grossAmount: 'GROSS AMOUNT',
  lessDiscount: 'LESS DISCOUNT',
  lessRefund: 'LESS REFUND',
  lessCancelled: 'LESS CANCELLED',
  lessVatAdjustment: 'LESS VAT ADJUSTMENT',
  netAmount: 'NET AMOUNT',
  serviceChargeAmount: 'SERVICE CHARGE AMOUNT',
  totalServiceCharge: 'TOTAL SERVICE CHARGE',
  naacDiscount: 'NAAC DISCOUNTS',
  soloParentDiscount: 'SOLO PARENT DISCOUNT',
  otherDiscounts: 'OTHER DISCOUNTS',
  pwdTransCount: 'PWD_TRANS_',
  scTransCount: 'SC_TRANS_',
  regularDiscTransCount: 'REGULAR_DISC__TRANS_',
  zeroRatedTransCount: 'ZERO_RATED_TRANS',
  vatOnRefund: 'VAT ON REFUND',
  otherVatAdjustments: 'OTHER VAT ADJUSTMENTS',
}

/**
 * 中文翻译
 */
export const zhTranslations: PrintReceiptTranslations = {
  time: '时间: ',
  reprint: (count) => `** 重打印 ${count} **`,

  ownedAndOperatedBy: (name) => `由 ${name} 拥有并运营`,
  vatRegTin: (tin) => `增值税注册号: ${tin}`,
  minNumber: (min) => `最小号: ${min}`,
  serialNumber: (serial) => `序列号: ${serial}`,

  orderId: (id) => `订单号: ${id}`,
  orderTime: (time) => `订单时间: ${time}`,
  table: (tableNo) => `桌号: ${tableNo}`,
  custCnt: (count) => `顾客数: ${count}`,
  cashier: '服务员',
  printTime: '打印时间',

  orderTitle: '***** 订单 *****',
  paymentReceiptTitle: '*** 支付小票 ***',
  kitchenOrderTitle: '** 厨房订单 **',
  billReceiptTitle: '******* 账单 ******',

  qtyItem: '数量 商品',
  subtotal: '小计',

  numberOfItems: '商品数量',
  subTotal: '小计',
  serviceFee: '服务费',
  discount: '折扣',
  tax: '税费',
  totalAmount: '** 总金额 **',

  totalAmountLabel: '总金额',
  paidAmount: '支付金额',
  change: '找零',

  companyName: 'Swifood Innovation, Inc',
  companyAddress:
    'Unit 9D, 9th Floor The Valero Tower, 122 Valero Street Salcedo Village, Bel-Air, City of Makati, NCR, Fourth District, Philippines',
  thisDoesNotServeAsInvoice: '此不作为正式发票',
  poweredBy: 'Swifood 提供技术支持',

  qty: '数量',
  category: '分类',
  note: '备注',

  acc: (ptu) => `账号: ${ptu}`,
  dateIssued: (date) => `签发日期: ${date}`,
  validUntil: (date) => `有效期至: ${date}`,
  ptu: (number) => `PTU: ${number}`,

  tbl: '桌号',
  cust: '顾客数量',
  paymentChannel: '支付渠道',

  dineIn: '堂食:',
  takeaway: '打包:',

  // Bill小票
  waiter: '服务员',
  userInfo: '用户信息:',
  pwdName: (name, id) => `PWD 姓名: ${name}(${id})`,
  validThru: (date) => `有效期至: ${date}`,
  pwdId: (id) => `PWD ID: ${id}`,
  signature: '签名',
  signHere: '在此签名',

  // Payment小票
  paymentTitle: '***** 支付 *****',
  invoiceTitle: '***** 发票 *****',
  siNumber: (id) => `SI号: ${id}`,
  transNumber: (id) => `交易号: ${id}`,
  deliveryFee: '配送费',
  deliveryFeeDiscount: '配送费优惠',
  promoDiscount: '促销折扣',
  channelReference: (ref) => `渠道参考号: ${ref}`,
  notValidForInputTax: '此文件不可用于\n增值税进项抵扣',
  salesSubToTax: '应税销售额',
  percentTax: '税率',
  exemptSales: '免税销售额',
  lessVat: '减免税费',
  zeroRatedSales: '零税率销售额',

  // Refund小票
  refundTitle: '***** 退款 *****',
  origSiNumber: (id) => `原SI号: ${id}`,
  refundNumber: (id) => `退款号: ${id}`,
  refundTime: '退款时间',

  // 报表
  reportTitle: '***** 交班报表  *****',
  reportDate: '日期',
  reportTime: '时间',
  xCount: (count) => `报表号: ${count}`,
  begSiNumber: (id) => `起始SI号         ${id}`,
  endSiNumber: (id) => `结束SI号         ${id}`,
  begRefundNumber: (id) => `起始退款号     ${id}`,
  endRefundNumber: (id) => `结束退款号     ${id}`,
  openingFund: '开户基金',
  totalPayments: '总支付',
  cancelled: '已取消',
  refund: '退款',
  withdrawal: '取款',
  transactionSummary: '交易汇总',
  cashOnHand: '现金在手',
  lessWithdrawal: '减取款',
  paymentsReceived: '收到款项',
  shortOver: '短缺/盈余',

  // 产品汇总报表
  productSummaryTitle: '****  产品汇总  *****',
  qtyOfItems: '商品总数量',
  vouchersDiscount: '优惠券折扣',
  pwdDiscount: 'PWD折扣',
  scDiscount: 'SC折扣',

  // 日终报告
  endOfDayReportTitle: '***** 日终报告 *****',
  zCount: (count) => `Z号: ${count}`,
  begCancelledNumber: (id) => `起始取消号  ${id}`,
  endCancelledNumber: (id) => `结束取消号  ${id}`,
  presentAccumulatedSales: '当前累计销售',
  previousAccumulatedSales: '前期累计销售',
  salesOfTheDay: '当日销售',
  grossAmount: '总金额',
  lessDiscount: '减折扣',
  lessRefund: '减退款',
  lessCancelled: '减取消',
  lessVatAdjustment: '减VAT调整',
  netAmount: '净额',
  serviceChargeAmount: '服务费金额',
  totalServiceCharge: '总服务费',
  naacDiscount: 'NAAC折扣',
  soloParentDiscount: '单亲折扣',
  otherDiscounts: '其他折扣',
  pwdTransCount: 'PWD交易数',
  scTransCount: 'SC交易数',
  regularDiscTransCount: '常规折扣交易数',
  zeroRatedTransCount: '零税率交易数',
  vatOnRefund: '退款VAT',
  otherVatAdjustments: '其他VAT调整',
}

/**
 * 根据是否中文获取翻译
 * @param chinese 是否中文
 * @returns 翻译对象
 */
export function getTranslations(chinese: boolean): PrintReceiptTranslations {
  return chinese ? zhTranslations : enTranslations
}
