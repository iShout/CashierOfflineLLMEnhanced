import {
  PrintAssociationType,
  PrintType,
  PrinterTypeEnum,
  DiscountTypeEnum,
  DeliveryTypeEnum,
  CustomerDiningStyleEnum,
} from './printEnums'

/**
 * 点餐项目
 */
export interface Item {
  /** 编号 */
  number: string
  /** 项目名称 */
  itemName: string
  /** 后端已格式化的主币金额字符串，例如 1245.00 */
  price: string
  /** 分类ID */
  categoryId: number
  /** 是否中文 */
  chinese: boolean
  /** 是否80mm纸张 */
  is80Paper: boolean
}

/**
 * 后厨点餐项目
 */
export interface KitchenItem {
  /** 编号 */
  number: string
  /** 项目名称 */
  itemName: string
  /** 价格 */
  price: string
  /** 分类ID */
  categoryId: number
  /** 是否中文 */
  chinese: boolean
  /** 是否80mm纸张 */
  is80Paper: boolean
}

/**
 * BIR 打印信息
 */
export interface BirPrintInfo {
  /** tinNumber */
  tinNumber: string
  /** 商户地址 */
  merchantAddress: string
  /** minNumber */
  minNumber: string
  /** serialNumber */
  serialNumber: string
  /** ptuNumber */
  ptuNumber: string
  /** ptu签发日期 */
  ptuIssueDate: string
  /** ptu有效日期 */
  ptuValidUntil: string
  /** swifood地址 */
  swifoodAddress: string
  /** 认证编号 */
  accreditationNumber: string
  /** 纳税人姓名 */
  taxpayerName: string
  /** 到期时间 ptuIssueDate+5年 */
  validUntil: string
  /** 贸易名称 */
  tradeName: string
}

/**
 * 寄件人信息
 */
export interface SenderInfo {
  /** awb */
  awb: string
  /** 名称 */
  name: string
  /** 手机号 */
  mobile: string
  /** 地址 */
  address: string
  /** tin */
  tin: string
}

/**
 * 打印订单业务对象
 */
export interface PrintOrderBo {
  /** 餐厅号 */
  restaurantNo: string

  /** 订单id */
  orderId: string

  /** 订单内部No */
  orderInnerNo: string

  /** 关联类型 */
  associationType: PrintAssociationType

  /** 打印类型 */
  printType: PrintType

  /** 餐厅名称 */
  restaurantName: string

  /** 餐厅地址 */
  restaurantAddress: string

  /** 订单日期 */
  orderDate: string

  /** 订单时间 */
  orderTime: string

  /** waiter名称 */
  waiterName: string

  /** 支付订单waiter */
  paymentWaiterName: string

  /** 退款订单waiter */
  refundWaiterName: string

  /** 桌号 */
  tableNo: string

  /** 顾客数量 */
  customerNum: number

  /** 备注信息 */
  note: string

  /** 餐位费 */
  serviceFee: number

  /** 菜 总数 */
  itemNum: number

  /** 价格总数 */
  totalAmount: number

  /** pwd少掉的金额 */
  discountAmount: number

  /** 持卡人数 */
  discountNumber: number

  /** 支付渠道 */
  paymentChannel: string

  /** 是否是中文 */
  chinese: boolean

  /** 打印份数 */
  copy: number

  /** 显示订单号 */
  showOrderNo: string

  /** 支付金额 */
  paymentAmount: number

  /** 交易手续费 */
  transactionFee: number

  /** 点餐列表 */
  itemList: Item[]

  /** 后厨点餐列表 */
  kitchenItemList: KitchenItem[]

  /** 旧订单来源设备编号 */
  deviceNo: string
  /** 旧订单来源 POS 名称 */
  posName: string

  /** order是否打印餐厅名称 1：打印 2：不打印 */
  restaurantNameOrderType: number

  /** order是否打印餐厅名称 1：主订单 2：厨房 */
  printerType: PrinterTypeEnum

  /** 税收 */
  taxAmount: number

  /** 优惠类型 */
  discountType: DiscountTypeEnum

  /** 税收 - 应税销售 */
  vatableSales: number

  /** 税收 - 免税销售 */
  vatExemptSales: number

  /** 税收 - 豁免 */
  vatExemption: number

  /** 税收 - 零税率销售 */
  zeroRatedSales: number

  /** 减免税费 */
  lessVat: number

  /** PWD/SC 折扣额 */
  pwdDiscount: number

  /** 其他折扣金额 */
  promoDiscount: number

  /** 是否计算展示税费信息 1、打开  2、关闭 */
  taxFee: number

  /** 配送地址 */
  userAddress: string

  /** 客户联系方式 */
  userPhone: string

  /** 送餐备注 */
  deliveryNote: string

  /** 配送费 */
  deliveryFee: number

  /** 配送类型  1grab配送 2自配送 */
  deliveryType: DeliveryTypeEnum

  /** 商家减免金额 */
  merchantDeliveryFee: number

  /** 打包费 */
  packagingFee: number

  /** 取餐号 */
  tableFoodNo: string

  /** 支付小票票据id */
  paymentReceiptId: string

  /** 支付小票系统号 */
  paymentSystemTransNo: string

  /** 退款小票票据id */
  refundReceiptId: string

  /** 退款系统号 */
  refundSystemTransNo: string

  /** 订单序号 */
  orderSerialNumber: string

  /** 支付打印次数 */
  paymentPrintCount: number

  /** order小票打印次数 */
  orderPrintCount: number

  /** kitchen小票打印次数 */
  kitchenPrintCount: number

  /** bill小票打印次数 */
  billPrintCount: number

  /** 退款打印次数 */
  refundPrintCount: number

  /** 找零 */
  change: number

  /** 现金收据金额 */
  cashReceiptAmount: number

  /** nonVat打印 ture打印 */
  nonVat: string

  /** 国家名 */
  timeZoneCode: string

  /** 国家名称 */
  countryName: string

  /** 渠道参考号 */
  channelReferenceNo: string

  /** 折扣人名称 */
  discounterName: string

  /** 折扣有效期 */
  discountValidityPeriod: string

  /** 折扣id */
  discountId: string

  /** 折扣序列号 */
  discountSerialNo: string

  /** 商户自定义内容 */
  customizeInfo: string

  /** 是否重打印 */
  isReprint: boolean

  /** 小票声明 */
  receiptStatement: string

  /** vat 注册状态 */
  vatRegisterStatus: boolean

  /** 退款序号 */
  refundSerialNo: string

  /** 订单小票首次打印时间 */
  orderFirstPrintTime: string

  /** bill小票首次打印时间 */
  billFirstPrintTime: string

  /** 支付小票首次打印时间 */
  paymentFirstPrintTime: string

  /** 退款小票首次打印时间 */
  refundFirstPrintTime: string

  /** 首次打印时间 */
  firstPrintTime: string

  /** 外卖渠道 */
  takeoutChannel: string

  /** 优惠券金额 */
  couponsAmount: number

  /** 二维码内容 */
  qrCodeContent: string

  /** 是否为CRM订单 */
  isCrmOrder: boolean

  /** 公司名称 */
  companyName: string

  /** 公司tin */
  companyTin: string

  /** 重打印文案 */
  rePrintContent: string

  /** bir状态 true 打开 false关闭 */
  birStatus: boolean

  /** bir 相关信息 */
  birPrintInfo: BirPrintInfo

  /** 寄件人信息 */
  senderInfo: string

  /** 支付小票（使用折扣） 1顾客 2商品 */
  discountFirstPrint: number

  /** 顾客用餐方式  1堂食 2打包带走 */
  customerDiningStyle: CustomerDiningStyleEnum

  /** 打印机字体大小 1.常规默认 2.大号 */
  printerFontSize: number

  /** 寄件人信息 */
  senderInfoReq: SenderInfo
}

/**
 * 获取订单号
 * @param order 打印订单对象
 * @returns 订单号
 */
export function getOrderNo(order: PrintOrderBo): string {
  if (order.associationType === PrintAssociationType.ORDER_NO || !order.printType) {
    return order.orderId
  }
  return order.orderInnerNo
}

/**
 * 创建默认的打印订单对象
 */
export function createDefaultPrintOrder(): Partial<PrintOrderBo> {
  return {
    chinese: true,
    copy: 1,
    itemList: [],
    kitchenItemList: [],
    printerType: PrinterTypeEnum.REGISTER,
    vatRegisterStatus: false,
    isCrmOrder: false,
    paymentPrintCount: 0,
    orderPrintCount: 0,
    kitchenPrintCount: 0,
    billPrintCount: 0,
    refundPrintCount: 0,
    companyName: 'Swifood Innovation, Inc',
    companyTin: '625-748-670-00000',
    serviceFee: 0,
    itemNum: 0,
    totalAmount: 0,
    discountAmount: 0,
    discountNumber: 0,
    paymentAmount: 0,
    transactionFee: 0,
    taxAmount: 0,
    vatableSales: 0,
    vatExemptSales: 0,
    vatExemption: 0,
    zeroRatedSales: 0,
    lessVat: 0,
    pwdDiscount: 0,
    promoDiscount: 0,
    taxFee: 0,
    deliveryFee: 0,
    merchantDeliveryFee: 0,
    packagingFee: 0,
    change: 0,
    cashReceiptAmount: 0,
    couponsAmount: 0,
    customerNum: 0,
    printerFontSize: 1,
  }
}
