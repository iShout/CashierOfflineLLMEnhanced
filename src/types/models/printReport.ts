/**
 * 报表打印数据接口
 */

/**
 * 商品明细
 */
export interface ProductItem {
  /** 商品名称 */
  itemName: string
  /** 数量 */
  quantity: number
  /** 单价（分） */
  price: number
  /** 总价（分） */
  totalAmount: number
}

/**
 * 支付方式汇总
 */
export interface PaymentSummary {
  /** 支付方式名称（如 Cash、GCash、Maya、Credit Card） */
  paymentMethod: string
  /** 金额（分） */
  amount: number
}

/**
 * 交班报表数据
 */
export interface ShiftReportData {
  /** 报表日期 */
  reportDate: string
  /** 报表时间 */
  reportTime: string
  /** 当前打印对应的重打印序号，0 表示首次打印 */
  reprintCount?: number
  /** 本次重打印时间 */
  reprintTime?: string
  /** 餐厅名称 */
  restaurantName: string
  /** BIR Trade Name */
  tradeName?: string
  /** BIR Tax Payer */
  taxpayerName?: string
  /** 旧报表来源 POS 名称 */
  posName: string
  /** 餐厅地址 */
  restaurantAddress?: string
  /** 是否中文 */
  chinese: boolean
  /** VAT 注册状态 */
  vatRegisterStatus: boolean
  /** TIN 号码 */
  tinNumber: string
  /** MIN 号码 */
  minNumber: string
  /** SERIAL 号码 */
  serialNumber: string
  /** 报表编号（X Count） */
  reportNumber: string
  /** 打印时间 */
  printTime: string
  /** 开始时间 */
  startTime: string
  /** 结束时间 */
  endTime: string
  /** 收银员名称 */
  cashierName: string
  /** 开始 SI 号 */
  begSiNumber: string
  /** 结束 SI 号 */
  endSiNumber: string
  /** 开始退款号 */
  begRefundNumber: string
  /** 结束退款号 */
  endRefundNumber: string
  /** 开户基金（分） */
  openingFund: number
  /** 支付方式汇总列表 */
  paymentSummaries: PaymentSummary[]
  /** 总支付金额（分） */
  totalPayments: number
  /** 取消订单金额（分） */
  cancelledAmount: number
  /** 退款金额（分） */
  refundAmount: number
  /** 取款金额（分） */
  withdrawalAmount: number
  /** 现金在手（分） */
  cashOnHand: number
  /** 短缺/盈余（分）正数为盈余，负数为短缺 */
  shortOverAmount: number
  /** 公司名称 */
  companyName: string
  /** 公司地址 */
  companyAddress: string
  /** 公司 TIN */
  companyTin: string
  /** BIR 信息 */
  birInfo?: BirReportInfo
}

/**
 * BIR 报表信息
 */
export interface BirReportInfo {
  /** ACC 号码 */
  accNumber: string
  /** PTU 签发日期 */
  ptuIssueDate: string
  /** PTU 有效期 */
  ptuValidUntil: string
  /** PTU 号码 */
  ptuNumber: string
}

/**
 * 提款记录
 */
export interface WithdrawalRecord {
  /** 提款时间 */
  withdrawalTime: string
  /** 提款金额（分） */
  amount: number
  /** 提款人 */
  withdrawnBy: string
  /** 备注 */
  remark?: string
}

/**
 * 提现报告打印数据
 */
export interface LessWithdrawalReportData {
  /** 餐厅名称 */
  restaurantName: string
  /** 旧报表来源 POS 名称 */
  posName: string
  /** 打印时间 */
  printTime: string
  /** 开户基金/期初资金（分） */
  openingFund: number
  /** 提现现金总金额（分） */
  cashWithdrawalAmount: number
  /** 现金收款金额（分） */
  cashReceivedAmount: number
  /** 手头现金金额（分） */
  cashOnHandAmount: number
  /** 提款记录 */
  withdrawalRecords: WithdrawalRecord[]
}

/**
 * 渠道结算报告
 */
export interface ChannelSettlementReport {
  /** 支付渠道名称 */
  channelName: string
  /** 支付渠道 code，用于内部判断 */
  channelCode?: string
  /** 交易数量 */
  transactionCount: number
  /** 交易金额（分） */
  transactionAmount: number
}

/**
 * 服务员结算报表数据
 */
export interface WaiterSettlementReportData {
  /** 报表日期 */
  reportDate: string
  /** 报表时间 */
  reportTime: string
  /** 餐厅名称 */
  restaurantName: string
  /** 旧报表来源 POS 名称 */
  posName: string
  /** 是否中文 */
  chinese: boolean
  /** VAT 注册状态 */
  vatRegisterStatus: boolean
  /** TIN 号码 */
  tinNumber: string
  /** MIN 号码 */
  minNumber: string
  /** SERIAL 号码 */
  serialNumber: string
  /** 报表编号（X Count） */
  reportNumber: string
  /** 打印时间 */
  printTime: string
  /** 开始时间 */
  startTime: string
  /** 结束时间 */
  endTime: string
  /** 收银员/服务员名称 */
  cashierName: string
  /** 服务员编号 */
  waiterNo: string
  /** 是否是新报告逻辑 */
  isNewReport: boolean

  // ============= 订单号列表 =============
  /** 销售订单号列表 */
  orderNos: string[]
  /** 取消订单号列表 */
  cancelOrderNos: string[]
  /** 退款订单号列表 */
  refundOrderNos: string[]

  // ============= 支付汇总 =============
  /** 支付方式汇总列表 */
  paymentSummaries: PaymentSummary[]
  /** 总收款金额（分） */
  paymentReceived: number
  /** 当前报表交易总金额（分） */
  totalAmount: number
  /** 总退款金额（分） */
  refundAmount: number
  /** 总取消金额（分） */
  cancelledAmount: number

  // ============= 现金计算 =============
  /** 开户基金/期初资金（分） */
  openingFund: number
  /** 额外支出/减去提款（分） */
  lessWithdrawal: number
  /** 现金在手（分）= openingFund + cashPayments - lessWithdrawal */
  cashOnHand: number
  /** 现金支付总额（分） */
  cashPayments: number
  /** 提现金额（分） */
  withdrawal: number
  /** 是否需要输结业资金 */
  isCashOnHand: boolean

  // ============= 短溢款 =============
  /** 短溢款（分）正数为盈余，负数为短缺 = cashOnHand - (openingFund + cashPayments - lessWithdrawal) */
  shortOrOver: number

  // ============= 提款记录 =============
  /** 提款记录列表 */
  withdrawalRecords: WithdrawalRecord[]

  // ============= 渠道结算报告 =============
  /** 按支付渠道分类的交易汇总报告 */
  channelSettlementReports: ChannelSettlementReport[]

  // ============= 公司信息 =============
  /** 公司名称 */
  companyName: string
  /** 公司地址 */
  companyAddress: string
  /** 公司 TIN */
  companyTin: string
  /** BIR 信息 */
  birInfo?: BirReportInfo
}

/**
 * 产品汇总报表数据
 */
export interface ProductSummaryData {
  /** 餐厅名称 */
  restaurantName: string
  /** BIR Trade Name */
  tradeName?: string
  /** BIR Tax Payer */
  taxpayerName?: string
  /** 当前打印对应的重打印序号，0 表示首次打印 */
  reprintCount?: number
  /** 本次重打印时间 */
  reprintTime?: string
  /** 旧报表来源 POS 名称 */
  posName: string
  /** 是否中文 */
  chinese: boolean
  /** VAT 注册状态 */
  vatRegisterStatus: boolean
  /** TIN 号码 */
  tinNumber: string
  /** MIN 号码 */
  minNumber: string
  /** SERIAL 号码 */
  serialNumber: string
  /** 报表编号（X Count） */
  reportNumber: string
  /** 打印时间 */
  printTime: string
  /** 开始时间 */
  startTime: string
  /** 结束时间 */
  endTime: string
  /** 收银员名称 */
  cashierName: string
  /** 商品列表 */
  productList: ProductItem[]
  /** 商品总数量 */
  totalQty: number
  /** 小计（分） */
  subTotal: number
  /** 促销折扣（分） */
  promoDiscount: number
  /** 优惠券折扣（分） */
  vouchersDiscount: number
  /** PWD折扣（分） */
  pwdDiscount: number
  /** SC折扣（分） */
  scDiscount: number
  /** LESS VAT，单位：分 */
  lessVat: number
  /** 总金额（分） */
  totalAmount: number
  /** 公司名称 */
  companyName: string
  /** 公司地址 */
  companyAddress: string
  /** 公司 TIN */
  companyTin: string
  /** BIR 信息 */
  birInfo?: BirReportInfo
}

/**
 * 日终报告数据
 */
export interface EndOfDayReportData {
  /** 报表日期 */
  reportDate: string
  /** 报表时间 */
  reportTime: string
  /** 当前打印对应的重打印序号，0 表示首次打印 */
  reprintCount?: number
  /** 本次重打印时间 */
  reprintTime?: string
  /** 餐厅名称 */
  restaurantName: string
  /** BIR Trade Name */
  tradeName?: string
  /** BIR Tax Payer */
  taxpayerName?: string
  posName: string
  /** 是否中文 */
  chinese: boolean
  /** VAT 注册状态 */
  vatRegisterStatus: boolean
  /** TIN 号码 */
  tinNumber: string
  /** MIN 号码 */
  minNumber: string
  /** SERIAL 号码 */
  serialNumber: string
  /** Z Count */
  zCount: string
  /** Reset Counter No. */
  resetCounterNo?: string
  /** 打印时间 */
  printTime: string
  /** 开始时间 */
  startTime: string
  /** 结束时间 */
  endTime: string
  /** 开始 SI 号 */
  begSiNumber: string
  /** 结束 SI 号 */
  endSiNumber: string
  /** 开始取消号 */
  begCancelledNumber: string
  /** 结束取消号 */
  endCancelledNumber: string
  /** 开始退款号 */
  begRefundNumber: string
  /** 结束退款号 */
  endRefundNumber: string
  /** 开户基金（分） */
  openingFund: number
  /** 支付方式汇总列表 */
  paymentSummaries: PaymentSummary[]
  /** 总支付金额（分） */
  totalPayments: number
  /** 取消订单金额（分） */
  cancelledAmount: number
  /** 退款金额（分） */
  refundAmount: number
  /** 取款金额（分） */
  withdrawalAmount: number
  /** 当日累计销售（分） */
  presentAccumulatedSales: number
  /** 前期累计销售（分） */
  previousAccumulatedSales: number
  /** 当日销售（分） */
  salesOfTheDay: number
  /** 应税销售额（分） */
  vatableSales: number
  /** VAT金额（分） */
  vatAmount: number
  /** 免税销售额（分） */
  vatExemptSales: number
  /** 零税率销售额（分） */
  zeroRatedSales: number
  /** NON-VAT 3% 税销售额（分） */
  salesSubTax: number
  /** NON-VAT 3% 税额（分） */
  percentageTax: number
  /** NON-VAT 免税销售额（分） */
  exemptSales: number
  /** 总金额（分） */
  grossAmount: number
  /** 折扣（分） */
  lessDiscount: number
  /** 退款（分） */
  lessRefund: number
  /** 取消（分） */
  lessCancelled: number
  /** VAT调整（分） */
  lessVatAdjustment: number
  /** 净额（分） */
  netAmount: number
  /** 服务费金额（分） */
  serviceChargeAmount: number
  /** 服务费税费（分） */
  serviceChargeTax: number
  /** 总服务费（分） */
  totalServiceCharge: number
  /** PWD折扣（分） */
  pwdDiscount: number
  /** SC折扣（分） */
  scDiscount: number
  /** NAAC折扣（分） */
  naacDiscount: number
  /** 单亲折扣（分） */
  soloParentDiscount: number
  /** 其他折扣（分） */
  otherDiscount: number
  /** PWD交易次数 */
  pwdTransCount: number
  /** SC交易次数 */
  scTransCount: number
  /** 常规折扣交易次数 */
  regularDiscTransCount: number
  /** 零税率交易次数 */
  zeroRatedTransCount: number
  /** 退款VAT（分） */
  vatOnRefund: number
  /** 其他VAT调整（分） */
  otherVatAdjustments: number
  /** 公司名称 */
  companyName: string
  /** 公司地址 */
  companyAddress: string
  /** 公司 TIN */
  companyTin: string
  /** BIR 信息 */
  birInfo?: BirReportInfo
}
