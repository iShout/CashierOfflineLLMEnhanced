/**
 * 打印小票格式化工具
 * 根据 PrintOrderBo 生成打印小票文本
 */

import { DiscountTypeEnum } from '@app-types/models/printEnums'
import type { KitchenItem, PrintOrderBo } from '@app-types/models/printOrder'
import { calculateDisplayLength, wrapText } from '@shared/utils'
import { getTranslations } from './printReceiptTranslations'

/**
 * 格式化时间为 yyyy-MM-dd HH:mm:ss
 * @param date 日期对象
 * @returns 格式化后的时间字符串
 */
export function formatDateTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function formatKitchenDateTime(date: Date): string {
  return formatDateTime(date).replace(/-/g, '/')
}

function formatKitchenTimeText(value?: string | null): string {
  const text = String(value ?? '').trim()
  return text ? text.replace(/-/g, '/') : formatKitchenDateTime(new Date())
}

function formatKitchenOrderCreateTime(order: PrintOrderBo): string {
  const orderTime = String(order.orderTime ?? '')
    .trim()
    .replace(/-/g, '/')
  const orderDate = String(order.orderDate ?? '')
    .trim()
    .replace(/-/g, '/')

  if (/\d{4}\/\d{1,2}\/\d{1,2}/.test(orderTime)) {
    return orderTime
  }

  if (orderDate && /^\d{1,2}:\d{2}/.test(orderTime)) {
    return `${orderDate} ${orderTime}`
  }

  if (orderDate) {
    return orderDate
  }

  return formatKitchenTimeText(orderTime)
}

function formatKitchenHeaderLine(leftText: string, itemNum: number, width: number): string {
  const left = String(leftText ?? '').trim()
  const right = `items:${itemNum}`
  const spaceCount = Math.max(1, width - calculateDisplayLength(left) - calculateDisplayLength(right))

  return `${left}${' '.repeat(spaceCount)}${right}`
}

function normalizeKitchenItems(order: PrintOrderBo): KitchenItem[] {
  const rawItems = order.kitchenItemList?.length ? order.kitchenItemList : order.itemList

  return rawItems.map((item) => {
    const itemName = String(item.itemName ?? '')
    const priceSeparatorIndex = itemName.lastIndexOf('@')

    return {
      ...item,
      itemName: priceSeparatorIndex >= 0 ? itemName.slice(0, priceSeparatorIndex) : itemName,
      number: String(item.number ?? ''),
      price: String(item.price ?? ''),
    }
  })
}

function getReceiptPosName(order: PrintOrderBo): string {
  return String(order.posName || order.deviceNo || '').trim()
}

// POS 仅是旧订单的展示信息；新订单为空时不再输出空标签。
function pushReceiptPosLine(lines: string[], order: PrintOrderBo, width?: number, label = 'POS#'): void {
  const posName = getReceiptPosName(order)
  if (!posName) return

  const line = `${label}: ${posName}`
  lines.push(width ? centerAlign(line, width) : line)
}

function buildKitchenItemLines(items: KitchenItem[], width: number, chinese: boolean): string[] {
  const lineStr = '-'.repeat(width)
  const lines: string[] = []

  items.forEach((item, index) => {
    if (String(item.number ?? '').trim()) {
      // 分隔线后直接打印菜品，避免厨房票在菜品上方多出一行空白。
      lines.push(lineStr)
    }

    lines.push(
      ...formatKitchenItem(item, width, chinese)
        .split('\n')
        .filter((line) => line.length > 0),
    )

    if (index === items.length - 1) {
      lines.push(lineStr)
      lines.push('')
    }
  })

  return lines
}

function formatKitchenItem(item: KitchenItem, width: number, chinese: boolean): string {
  const quantity = String(item.price ?? '')
    ? `x${String(item.number ?? '').padEnd(4, ' ')}`
    : String(item.number ?? '').padEnd(chinese ? 4 : 3, ' ')
  const chunks = splitByGbkBytes(String(item.itemName ?? ''), width === 48 ? 36 : 19)

  if (chunks.length <= 1) {
    return padKitchenItemLine(chunks[0] ?? '', quantity, width, chinese)
  }

  return chunks
    .map((chunk, index) =>
      index === 0 ? padKitchenItemLine(chunk, quantity, width, chinese) : padDisplayWidth(chunk, width, chinese),
    )
    .join('\n')
}

function padKitchenItemLine(itemName: string, quantity: string, width: number, chinese: boolean): string {
  const chineseOffset = chinese ? countHanChars(itemName) : 0
  const targetLength = Math.max(0, width - quantity.length - 1 - chineseOffset)

  return `${String(itemName).padEnd(targetLength, ' ')} ${quantity}`
}

function padDisplayWidth(text: string, width: number, chinese: boolean): string {
  const chineseOffset = chinese ? countHanChars(text) : 0
  return String(text).padEnd(Math.max(0, width - chineseOffset), ' ')
}

function splitByGbkBytes(text: string, bytes: number): string[] {
  if (!text) return []

  const result: string[] = []
  let length = 0
  let buffer = ''

  for (const char of text) {
    const charLength = isHanChar(char) ? 2 : 1

    if (length + charLength > bytes && buffer) {
      result.push(buffer)
      buffer = ''
      length = 0
    }

    buffer += char
    length += charLength
  }

  result.push(buffer)
  return result
}

function countHanChars(text: string): number {
  return Array.from(text).filter(isHanChar).length
}

function isHanChar(char: string): boolean {
  return /\p{Script=Han}/u.test(char)
}

function toInt(value: string): number {
  const parsed = Number.parseInt(String(value), 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * 添加重打印信息到行列表
 * @param lines 行数组
 * @param order 订单对象
 * @param printCount 打印次数（orderPrintCount 或 paymentPrintCount）
 * @param reprintTime 重打印时间
 */
function addReprintInfo(lines: string[], order: PrintOrderBo, printCount: number, reprintTime: string): void {
  if (order.isReprint) {
    const t = getTranslations(order.chinese)
    lines.push(t.reprint(printCount))
    lines.push('')
    lines.push(`${t.time}: ${reprintTime}`)
    lines.push('') // 空行
  }
}

/**
 * 添加取餐码和用餐方式信息到行列表
 * @param lines 行数组
 * @param order 订单对象
 */
function addPickupCodeInfo(lines: string[], order: PrintOrderBo): void {
  if (order.tableFoodNo) {
    const t = getTranslations(order.chinese)

    // 根据用餐方式枚举值获取对应文本
    let diningStyleText = ''
    if (order.customerDiningStyle === 1) {
      diningStyleText = t.dineIn
    } else if (order.customerDiningStyle === 2) {
      diningStyleText = t.takeaway
    }

    if (diningStyleText) {
      lines.push(`${diningStyleText} ${order.tableFoodNo}`)
    }
  }
}

function getQueuePickupNoText(order: PrintOrderBo): string {
  const takeFoodNo = String(order.tableFoodNo ?? '').trim()
  const t = getTranslations(order.chinese)

  if (!takeFoodNo) {
    return ''
  }

  if (order.customerDiningStyle === 1) {
    return `${t.dineIn}${takeFoodNo}`
  }

  if (order.customerDiningStyle === 2) {
    return `${t.takeaway}${takeFoodNo}`
  }

  return ''
}

function pushQueuePickupNoHeader(lines: string[], order: PrintOrderBo, width: number): void {
  const pickupNoText = getQueuePickupNoText(order)

  if (!pickupNoText) {
    return
  }

  // 排队点餐的堂食/外带取餐号需要在商户名称上方单独突出展示。
  lines.push('')
  lines.push(centerAlign(pickupNoText, width))
  lines.push('')
}

/**
 * 添加餐厅名称信息到行列表
 * @param lines 行数组
 * @param order 订单对象
 */
function addRestaurantName(lines: string[], order: PrintOrderBo, width: number): void {
  if (order.birPrintInfo?.taxpayerName) {
    if (order.birPrintInfo.tradeName && order.birPrintInfo.tradeName !== order.birPrintInfo.taxpayerName) {
      // 显示贸易名称 + "Owned and Operated By" + 纳税人姓名
      lines.push(wrapText(order.birPrintInfo.tradeName, width))
      lines.push(`Owned and Operated By`)
      lines.push(wrapText(order.birPrintInfo.taxpayerName, width))
    } else {
      // 只显示纳税人姓名
      lines.push(wrapText(order.birPrintInfo.taxpayerName, width))
    }
  } else if (order.restaurantName) {
    lines.push(wrapText(order.restaurantName, width))
  }
}

/**
 * 生成订单小票文本
 * @param order 打印订单对象
 * @param width 小票宽度，默认32，对齐 Payment BIR 版式
 * @returns 小票文本
 */
export function generateOrderReceipt(order: PrintOrderBo, width: number = 32, printColumns: number = 32): string {
  return generatePaymentLikeReceiptSingle(order, getOrderReceiptConfig(order), width, printColumns)
}

/**
 * 生成厨房小票文本
 * @param order 打印订单对象
 * @param width 小票宽度，默认48
 * @returns 小票文本
 */
export function generateKitchenReceipt(order: PrintOrderBo, width: number = 48, printColumns: number = width): string {
  const printTime = formatKitchenDateTime(new Date())
  const orderCreateTime = formatKitchenOrderCreateTime(order)
  const kitchenItems = normalizeKitchenItems(order)
  const itemNum = kitchenItems.reduce((total, item) => total + toInt(item.number), 0)
  const kitchenPrintCount = Number(order.kitchenPrintCount ?? 0)
  const lines: string[] = []

  // 厨房票只在手动补打时展示已成功打印次数，自动首打不带该标题。
  if (order.isReprint && kitchenPrintCount > 0) {
    lines.push(order.chinese ? `**\u91cd\u6253\u5370${kitchenPrintCount}**` : `**Reprint${kitchenPrintCount}**`)
    lines.push('')
  }

  lines.push(`${order.chinese ? '\u65f6\u95f4' : 'TIME'}: ${orderCreateTime}`)

  if (order.restaurantName) {
    lines.push(wrapText(order.restaurantName, width))
  }

  lines.push('')
  lines.push('')

  pushReceiptPosLine(lines, order)

  if (order.orderSerialNumber || order.orderId) {
    lines.push(`ORDER ID: ${order.orderSerialNumber || order.orderId}`)
  }

  lines.push(`${order.chinese ? '\u6253\u5370\u65f6\u95f4' : 'PRINT TIME'}: ${printTime}`)
  lines.push('')

  let diningStyleText = ''
  if (order.customerDiningStyle === 1) {
    diningStyleText = order.chinese ? '\u5802\u98df:' : 'DINE-IN No:'
  } else if (order.customerDiningStyle === 2) {
    diningStyleText = order.chinese ? '\u6253\u5305:' : 'TAKE-OUT No:'
  }

  // Header left side is table/pickup code; items count stays on the right side.
  let headerLeftText = ''
  if (order.tableNo) {
    headerLeftText = String(order.tableNo)
  } else if (order.tableFoodNo) {
    headerLeftText = `${diningStyleText ? `${diningStyleText} ` : ''}${order.tableFoodNo}`
  } else {
    headerLeftText = 'Delivery'
  }

  lines.push(formatKitchenHeaderLine(headerLeftText, itemNum, width))

  if (order.note?.trim()) {
    lines.push(order.chinese ? '\u5907\u6ce8:' : 'SPCL NOTE:')
    lines.push('')
    lines.push(wrapText(order.note, width))
  }

  for (const line of buildKitchenItemLines(kitchenItems, width, order.chinese)) {
    lines.push(line)
  }

  lines.push('-'.repeat(width))

  const finalLine = '-'.repeat(width)
  if (lines[lines.length - 1] === finalLine && lines[lines.length - 2] === '') {
    lines.pop()
  }

  return applyPaymentReceiptBlockMargin(lines, width, printColumns).join('\n')
}

/**
 * 生成支付小票文本
 * @param order 打印订单对象
 * @param width 小票宽度，默认32，对齐后端 58mm 支付小票定义
 * @returns 小票文本
 */
export function generatePaymentReceipt(
  order: PrintOrderBo,
  width: number = 32,
  printColumns: number = 32,
  enableDiscountCopies: boolean = true,
): string {
  const normalizedOrder = normalizePaymentReceiptOrder(order)

  // 自动打印的折扣交易按 BIR 规则打印商户联和顾客联；手动补打只打一张且不展示联次文案。
  if (
    enableDiscountCopies &&
    hasPaymentDiscount(normalizedOrder) &&
    !normalizedOrder.isReprint &&
    !normalizedOrder.discountFirstPrint
  ) {
    return [
      generatePaymentLikeReceiptSingle(
        { ...normalizedOrder, discountFirstPrint: 2 },
        getPaymentReceiptConfig(normalizedOrder),
        width,
        printColumns,
      ),
      generatePaymentLikeReceiptSingle(
        { ...normalizedOrder, discountFirstPrint: 1 },
        getPaymentReceiptConfig(normalizedOrder),
        width,
        printColumns,
      ),
    ].join('\n\f\n')
  }

  return generatePaymentLikeReceiptSingle(
    normalizedOrder,
    getPaymentReceiptConfig(normalizedOrder),
    width,
    printColumns,
  )
}

type PaymentLikeReceiptConfig = {
  title: string
  timeLabel: string
  timeValue?: string | null
  siLabel?: string
  showReprint?: boolean
  showSi?: boolean
  showTrans?: boolean
  showRefundNumber?: boolean
  showBirSerialNumber?: boolean
  posLabel?: string
  showTaxRows?: boolean
  showCustomerInfo?: boolean
  showCopyLabel?: boolean
  showSpecialNote?: boolean
  amountRowsType?: 'payment' | 'order'
  amountSignMode?: 'normal' | 'refund'
  orderIdSource?: 'payment' | 'serial'
  transactionNoSource?: 'payment' | 'refund'
  footerStatement?: string
  reprintCount: number
  reprintCountAdjustment?: number
}

function getOrderReceiptConfig(order: PrintOrderBo): PaymentLikeReceiptConfig {
  return {
    title: '***** ORDER *****',
    timeLabel: 'ORDER TIME',
    showReprint: true,
    showSi: false,
    showTrans: false,
    showBirSerialNumber: true,
    showTaxRows: false,
    showCustomerInfo: false,
    showCopyLabel: false,
    showSpecialNote: true,
    amountRowsType: 'order',
    orderIdSource: 'serial',
    footerStatement: 'This does not serve as INVOICE.',
    reprintCount: Number(order.orderPrintCount ?? 0),
    reprintCountAdjustment: 0,
  }
}

function getPaymentReceiptConfig(order: PrintOrderBo): PaymentLikeReceiptConfig {
  return {
    title: '***** PAYMENT *****',
    timeLabel: 'ORDER TIME',
    siLabel: 'SI#',
    showReprint: true,
    showSi: true,
    showTrans: true,
    showBirSerialNumber: true,
    posLabel: 'POS #',
    showTaxRows: true,
    showCustomerInfo: true,
    showCopyLabel: true,
    amountRowsType: 'payment',
    orderIdSource: 'payment',
    transactionNoSource: 'payment',
    footerStatement: 'This serves as INVOICE.',
    reprintCount: Number(order.paymentPrintCount ?? 0),
  }
}

function getRefundReceiptConfig(order: PrintOrderBo): PaymentLikeReceiptConfig {
  return {
    title: '***** REFUND *****',
    timeLabel: 'REFUND TIME',
    timeValue: order.refundFirstPrintTime || order.firstPrintTime || order.orderTime,
    siLabel: 'ORIG.SI#',
    showReprint: true,
    showSi: true,
    showTrans: true,
    showRefundNumber: true,
    showBirSerialNumber: true,
    posLabel: 'POS #',
    showTaxRows: true,
    showCustomerInfo: true,
    showCopyLabel: true,
    amountRowsType: 'payment',
    amountSignMode: 'refund',
    orderIdSource: 'payment',
    transactionNoSource: 'refund',
    footerStatement: 'This serves as INVOICE.',
    reprintCount: Number(order.refundPrintCount ?? 0),
  }
}

function getPaymentLikeOrderId(order: PrintOrderBo, source: PaymentLikeReceiptConfig['orderIdSource']): string {
  // Order 小票沿用原 order receipt 的序列号作为 ORDER ID，支付/退款保持当前支付口径。
  if (source === 'serial') {
    return String(order.orderSerialNumber || order.orderId || order.orderInnerNo || '').trim()
  }

  return String(order.orderId || order.orderInnerNo || order.orderSerialNumber || '').trim()
}

function getLatestSystemTransactionNo(
  order: PrintOrderBo,
  source: PaymentLikeReceiptConfig['transactionNoSource'] = 'payment',
): string {
  // 退款小票优先读取退款支付行的流水，支付小票优先读取原支付流水。
  const systemTransactionNo =
    source === 'refund'
      ? order.refundSystemTransNo || order.paymentSystemTransNo
      : order.paymentSystemTransNo || order.refundSystemTransNo

  return (
    String(systemTransactionNo || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .at(-1) ?? ''
  )
}

function generatePaymentLikeReceiptSingle(
  order: PrintOrderBo,
  config: PaymentLikeReceiptConfig,
  width: number = 32,
  printColumns: number = 32,
): string {
  const lines: string[] = []
  const lineStr = '-'.repeat(width)
  const printTime = formatReceiptDateTime(formatDateTime(new Date()))
  const isNonVatPaymentLikeReceipt = config.showTaxRows !== false && !order.vatRegisterStatus
  const t = getTranslations(order.chinese)

  // 手动补打才展示 REPRINT；Order 使用已成功打印总数，Payment/Refund 使用本次补打序号。
  if (config.showReprint !== false && order.isReprint) {
    const reprintCount = config.reprintCount + (config.reprintCountAdjustment ?? 1)
    lines.push(centerAlign(t.reprint(reprintCount), width))
    lines.push('')
    lines.push(centerAlign(`${t.time}${printTime}`, width))
    lines.push('')
    lines.push('')
  }

  pushQueuePickupNoHeader(lines, order, width)
  pushRestaurantHeader(lines, order, width)
  pushCenteredWrapped(lines, order.restaurantAddress || order.birPrintInfo?.merchantAddress || '', width)
  if (isNonVatPaymentLikeReceipt) {
    // NON-VAT 抬头更长，按小票宽度安全换行，避免 TIN 超出打印区域。
    pushCenteredWrapped(lines, `NON-VAT REG TIN: ${order.birPrintInfo?.tinNumber ?? ''}`, width)
  } else {
    lines.push(centerAlign(`VAT REG TIN: ${order.birPrintInfo?.tinNumber ?? ''}`, width))
  }
  lines.push(centerAlign(`MIN #: ${order.birPrintInfo?.minNumber ?? ''}`, width))
  if (config.showBirSerialNumber) {
    // Payment/Refund 必须展示当前审核通过 BIR 配置中的设备序列号。
    lines.push(centerAlign(`SERIAL #: ${order.birPrintInfo?.serialNumber ?? ''}`, width))
  }
  const orderId = getPaymentLikeOrderId(order, config.orderIdSource)
  // 历史支付记录仍按原标签展示 POS，新支付记录不再输出该行。
  pushReceiptPosLine(lines, order, width, config.posLabel ?? 'POS#')
  if (orderId) {
    lines.push(centerAlign(`ORDER ID: ${orderId}`, width))
  }
  if (config.showSi !== false && config.siLabel) {
    lines.push(centerAlign(`${config.siLabel}: ${order.orderSerialNumber ?? ''}`, width))
  }
  if (config.showRefundNumber) {
    lines.push(centerAlign(`REFUND#: ${order.refundSerialNo ?? ''}`, width))
  }
  if (config.showTrans !== false) {
    lines.push(centerAlign(`TRANS#: ${getLatestSystemTransactionNo(order, config.transactionNoSource)}`, width))
  }
  lines.push(centerAlign(`${config.timeLabel}: ${formatPaymentLikeOrderTime(order, config.timeValue)}`, width))
  lines.push('')
  lines.push(lineStr)
  lines.push('')
  lines.push(
    centerAlign(
      order.isCrmOrder && config.title === '***** PAYMENT *****' ? '***** INVOICE *****' : config.title,
      width,
    ),
  )
  lines.push('')

  if (order.tableNo && Number(order.customerNum ?? 0) > 0) {
    // 后端中文模板只翻译业务字段，ORDER ID、SI、TRANS 等监管字段仍保持英文。
    lines.push(formatTwoSideText(`${t.tbl}: ${order.tableNo}`, `${t.cust}: ${order.customerNum}`, width))
  }

  const cashierName = order.paymentWaiterName || order.waiterName
  if (cashierName) {
    lines.push(centerAlign(`${t.cashier}: ${cashierName}`, width))
  }
  lines.push(centerAlign(`${t.printTime}: ${printTime}`, width))
  lines.push(lineStr)
  lines.push(formatPaymentItemHeader(width, order.chinese))

  order.itemList.forEach((item) => {
    lines.push(
      ...formatPaymentItemRows(
        width,
        String(item.number ?? ''),
        String(item.itemName ?? ''),
        formatPrintItemAmount(item.price, config.amountSignMode),
        config.amountSignMode,
      ),
    )
  })

  lines.push(lineStr)
  pushPaymentLikeAmountRows(lines, order, width, config.amountRowsType ?? 'payment', config.amountSignMode)

  if (config.showTaxRows !== false) {
    // Payment/Refund 的支付渠道与税费明细连续展示，不在二者之间插入横线。
    pushPaymentTaxRows(lines, order, width, config.amountSignMode)
    lines.push(lineStr)
  } else {
    lines.push(lineStr)
  }

  if (config.showCustomerInfo !== false) {
    lines.push(centerAlign(order.chinese ? '用户信息:' : 'CUSTOMER INFORMATION:', width))
    lines.push('')
    pushPaymentCustomerInfo(lines, order, width)
    lines.push(lineStr)
  }

  if (config.showSpecialNote) {
    // Order Receipt 的备注模块固定展示，空备注以短横线占位，内容换行后居中。
    lines.push('SPCL NOTE:')
    pushCenteredWrapped(lines, String(order.note ?? '').trim() || '-', width)
    lines.push(lineStr)
  }

  pushFixedPaymentFooter(
    lines,
    width,
    order.chinese,
    config.showCopyLabel === false ? undefined : order.discountFirstPrint,
    config.footerStatement,
    isNonVatPaymentLikeReceipt,
  )

  return applyPaymentReceiptBlockMargin(lines, width, printColumns).join('\n')
}

/**
 * 生成账单小票文本
 * @param order 打印订单对象
 * @param width 小票内容宽度，默认32，对齐 Order 小票表格
 * @returns 小票文本
 */
export function generateBillReceipt(order: PrintOrderBo, width: number = 32, printColumns: number = 32): string {
  const lines: string[] = []
  const lineStr = '-'.repeat(width)
  const printTime = formatReceiptDateTime(formatDateTime(new Date()))
  const cashierName = order.paymentWaiterName || order.waiterName
  const labels = order.chinese
    ? {
        billTitle: '******* BILL ******',
        cashier: '服务员',
        printTime: '打印时间',
      }
    : {
        billTitle: '******* BILL ******',
        cashier: 'CASHIER',
        printTime: 'PRINT TIME',
      }

  // Bill 小票是独立短模板，只展示商户名、账单标题、商品表、金额表和底部说明。
  pushCenteredWrapped(lines, getBillMerchantName(order), width)
  pushReceiptPosLine(lines, order, width)
  lines.push('')
  lines.push(centerAlign(labels.billTitle, width))
  lines.push('')
  if (cashierName) {
    lines.push(centerAlign(`${labels.cashier}: ${cashierName}`, width))
  }
  lines.push(centerAlign(`${labels.printTime}: ${printTime}`, width))
  lines.push(lineStr)
  lines.push(formatPaymentItemHeader(width, order.chinese))

  order.itemList.forEach((item) => {
    lines.push(
      ...formatPaymentItemRows(
        width,
        String(item.number ?? ''),
        String(item.itemName ?? ''),
        formatPrintItemAmount(item.price),
      ),
    )
  })

  lines.push(lineStr)
  pushBillAmountRows(lines, order, width)
  lines.push(lineStr)
  lines.push('')
  lines.push(centerAlign('This does not serve as INVOICE.', width))
  lines.push('')
  lines.push(centerAlign('Powered by Swifood', width))

  return applyPaymentReceiptBlockMargin(lines, width, printColumns).join('\n')
}

/**
 * 生成退款小票文本
 * @param order 打印订单对象
 * @param width 小票宽度，默认32，对齐支付小票 BIR 版式
 * @returns 小票文本
 */
export function generateRefundReceipt(order: PrintOrderBo, width: number = 32, printColumns: number = 32): string {
  const normalizedOrder = normalizePaymentReceiptOrder(order)
  return generatePaymentLikeReceiptSingle(normalizedOrder, getRefundReceiptConfig(normalizedOrder), width, printColumns)
}

/**
 * 居中对齐文本
 * @param text 文本
 * @param width 总宽度
 * @returns 居中后的文本
 */
function centerAlign(text: string, width: number): string {
  const textLength = calculateDisplayLength(text)
  if (textLength >= width) {
    return text
  }
  const padding = Math.floor((width - textLength) / 2)
  return ' '.repeat(padding) + text
}

function formatReceiptDateTime(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .replace(/-/g, '/')
}

function formatPaymentLikeOrderTime(order: PrintOrderBo, timeValue?: string | null): string {
  const formattedTime = formatReceiptDateTime(timeValue ?? order.orderTime)
  const formattedDate = formatReceiptDateTime(order.orderDate)

  // 后端兼容快照把订单日期和时间分开保存，小票展示时还原为完整时间。
  if (formattedDate && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(formattedTime)) {
    return `${formattedDate} ${formattedTime}`
  }

  return formattedTime
}

function applyPaymentReceiptBlockMargin(lines: string[], contentWidth: number, printColumns: number): string[] {
  const margin = ' '.repeat(Math.max(0, Math.floor((printColumns - contentWidth) / 2)))
  return lines.map((line) => (line ? `${margin}${line}` : line))
}

function toAmountNumber(value: string | number | null | undefined): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function toPrintItemMinorAmount(value: string | number | null | undefined): number {
  // 后端 PrintOrderBo.Item.price 已是主币金额字符串，参与本地合计前需还原成分。
  return Math.round(toAmountNumber(value) * 100)
}

function sumPaymentItemAmount(order: PrintOrderBo): number {
  return order.itemList.reduce((sum, item) => sum + toPrintItemMinorAmount(item.price), 0)
}

function hasStoredPaymentTax(order: PrintOrderBo): boolean {
  return [
    order.vatableSales,
    order.taxAmount,
    order.vatExemptSales,
    order.vatExemption,
    order.zeroRatedSales,
    order.lessVat,
  ].some((amount) => Number(amount ?? 0) !== 0)
}

function isSpecialDiscount(order: PrintOrderBo): boolean {
  return isPwdDiscount(order) || isScDiscount(order)
}

function calculateVatBreakdownFromGross(grossAmount: number): { netAmount: number; vatAmount: number } {
  const netAmount = Math.round(grossAmount / 1.12)
  return {
    netAmount,
    vatAmount: grossAmount - netAmount,
  }
}

function calculateSpecialDiscountAmount(netAmount: number): number {
  return Math.round(netAmount * 0.2)
}

function normalizePaymentReceiptOrder(order: PrintOrderBo): PrintOrderBo {
  const normalizedOrder = { ...order }
  const itemAmount = sumPaymentItemAmount(order)
  const isVatRegistered = Boolean(order.vatRegisterStatus)
  const specialDiscount = isSpecialDiscount(order)

  // 数据库没有最终税费时，按 BIR 文档从商品原价反算 12% VAT / PWD-SC 免税金额。
  if (isVatRegistered && itemAmount > 0 && !hasStoredPaymentTax(normalizedOrder)) {
    const { netAmount, vatAmount } = calculateVatBreakdownFromGross(itemAmount)

    if (specialDiscount) {
      normalizedOrder.vatableSales = 0
      normalizedOrder.taxAmount = 0
      normalizedOrder.vatExemptSales = netAmount
      normalizedOrder.vatExemption = vatAmount
      normalizedOrder.lessVat = Number(normalizedOrder.lessVat ?? 0) || vatAmount
    } else {
      normalizedOrder.vatableSales = netAmount
      normalizedOrder.taxAmount = vatAmount
      normalizedOrder.vatExemptSales = 0
      normalizedOrder.zeroRatedSales = 0
    }
  }

  if (specialDiscount) {
    const vatExemptSales = Number(normalizedOrder.vatExemptSales ?? 0)
    const vatExemption = Number(normalizedOrder.vatExemption ?? 0)

    if (!Number(normalizedOrder.lessVat ?? 0) && vatExemption > 0) {
      normalizedOrder.lessVat = vatExemption
    }

    if (!Number(normalizedOrder.pwdDiscount ?? 0) && vatExemptSales > 0) {
      normalizedOrder.pwdDiscount = calculateSpecialDiscountAmount(vatExemptSales)
    }
  }

  return normalizedOrder
}

function hasPaymentDiscount(order: PrintOrderBo): boolean {
  return (
    Number(order.promoDiscount ?? 0) > 0 ||
    Number(order.couponsAmount ?? 0) > 0 ||
    Number(order.pwdDiscount ?? 0) > 0 ||
    Number(order.discountAmount ?? 0) !== 0 ||
    Number(order.lessVat ?? 0) > 0 ||
    isSpecialDiscount(order)
  )
}

function pushRestaurantHeader(lines: string[], order: PrintOrderBo, width: number): void {
  const tradeName = String(order.birPrintInfo?.tradeName ?? '').trim()
  const taxpayerName = String(order.birPrintInfo?.taxpayerName ?? '').trim()

  if (tradeName && taxpayerName) {
    pushCenteredWrapped(lines, tradeName, width)

    if (tradeName !== taxpayerName) {
      // 两个 BIR 名称不同时连续展示三行，并在经营主体名称后与地址分隔。
      pushCenteredWrapped(lines, 'Owned and Operated By', width)
      pushCenteredWrapped(lines, taxpayerName, width)
      lines.push('')
    }
    return
  }

  pushCenteredWrapped(lines, tradeName || taxpayerName || order.restaurantName || '', width)
}

function getBillMerchantName(order: PrintOrderBo): string {
  // Bill 小票只需要商户显示名，不输出 BIR 的 Owned and Operated By 多行抬头。
  return String(order.restaurantName || order.birPrintInfo?.tradeName || order.birPrintInfo?.taxpayerName || '').trim()
}

function pushCenteredWrapped(lines: string[], text: string, width: number): void {
  const value = String(text ?? '').trim()

  if (!value) {
    return
  }

  value.split('\n').forEach((part) => {
    wrapText(part, width)
      .split('\n')
      .filter((line) => line.length > 0)
      .forEach((line) => lines.push(centerAlign(line, width)))
  })
}

function formatTwoSideText(left: string, right: string, width: number): string {
  const leftLength = calculateDisplayLength(left)
  const rightLength = calculateDisplayLength(right)
  const spaces = Math.max(1, width - leftLength - rightLength)
  return `${left}${' '.repeat(spaces)}${right}`
}

function formatPaymentRow(label: string, value: string, width: number): string {
  return formatTwoSideText(label, value, width)
}

function formatReceiptAmount(
  amount: number,
  amountSignMode: PaymentLikeReceiptConfig['amountSignMode'] = 'normal',
): string {
  // 退款小票金额按支付小票展示值取反：正向销售额变负，折扣/抵扣负数变正。
  const signedAmount = amountSignMode === 'refund' ? -amount : amount
  return formatAmount(signedAmount)
}

function formatPrintItemAmount(
  value: string | number | null | undefined,
  amountSignMode: PaymentLikeReceiptConfig['amountSignMode'] = 'normal',
): string {
  // 菜品价格已经由后端快照格式化，统一转回分后复用小票金额格式化，避免再次除以 100。
  return formatReceiptAmount(toPrintItemMinorAmount(value), amountSignMode)
}

function formatReceiptQuantity(
  qty: string,
  amountSignMode: PaymentLikeReceiptConfig['amountSignMode'] = 'normal',
): string {
  if (amountSignMode !== 'refund') {
    return qty
  }

  const quantity = Number(qty)
  if (!Number.isFinite(quantity) || quantity === 0) {
    return qty
  }

  // 商品数量也跟随退款方向取反，保持与商品金额同向。
  return String(-quantity)
}

function formatPaymentItemHeader(width: number, chinese = false): string {
  return formatPaymentRow(chinese ? '数量 商品' : 'QTY ITEM', chinese ? '小计' : 'SUBTOTAL', width)
}

function formatPaymentItemRows(
  width: number,
  qty: string,
  itemName: string,
  subtotal: string,
  amountSignMode: PaymentLikeReceiptConfig['amountSignMode'] = 'normal',
): string[] {
  const qtyText = formatReceiptQuantity(qty.trim() || '0', amountSignMode)
  const itemWidth = Math.max(1, width - calculateDisplayLength(qtyText) - 1 - 8)
  const chunks = wrapText(itemName.trim(), itemWidth).split('\n')
  const lines: string[] = []

  lines.push(formatPaymentRow(`${qtyText} ${chunks[0] ?? ''}`, subtotal, width))
  chunks.slice(1).forEach((chunk) => {
    lines.push(`${' '.repeat(calculateDisplayLength(qtyText) + 1)}${chunk}`)
  })

  return lines
}

function isCashPayment(order: PrintOrderBo): boolean {
  return (
    String(order.paymentChannel ?? '')
      .trim()
      .toUpperCase() === 'CASH'
  )
}

function getDiscountLabel(order: PrintOrderBo): string {
  const discountText = order.chinese ? '折扣' : 'Discount'

  if (isPwdDiscount(order)) {
    return Number(order.discountNumber ?? 0) > 0 && Number(order.discountType ?? 0) === DiscountTypeEnum.PWD_SC_PEOPLE
      ? `PWD ${discountText}(${order.discountNumber})`
      : `PWD ${discountText}`
  }

  if (isScDiscount(order)) {
    return Number(order.discountNumber ?? 0) > 0 && Number(order.discountType ?? 0) === DiscountTypeEnum.SC_PEOPLE
      ? `SC ${discountText}(${order.discountNumber})`
      : `SC ${discountText}`
  }

  return discountText
}

function pushDiscountRows(
  lines: string[],
  order: PrintOrderBo,
  width: number,
  amountSignMode: PaymentLikeReceiptConfig['amountSignMode'] = 'normal',
): void {
  const promoDiscount = getPaymentPromoDiscountAmount(order)

  if (promoDiscount > 0) {
    lines.push(
      formatPaymentRow(
        order.chinese ? '促销折扣' : 'Promo Discount',
        formatReceiptAmount(-Math.abs(promoDiscount), amountSignMode),
        width,
      ),
    )
  }

  if (isSpecialDiscount(order)) {
    const specialDiscount = getPaymentSpecialDiscountAmount(order)

    if (specialDiscount > 0) {
      lines.push(
        formatPaymentRow(
          getDiscountLabel(order),
          formatReceiptAmount(-Math.abs(specialDiscount), amountSignMode),
          width,
        ),
      )
    }
    return
  }

  if (Number(order.discountAmount ?? 0) !== 0) {
    const discountAmount =
      Number(order.discountAmount) < 0 ? Number(order.discountAmount) : -Math.abs(Number(order.discountAmount))
    lines.push(formatPaymentRow(getDiscountLabel(order), formatReceiptAmount(discountAmount, amountSignMode), width))
  }
}

function getPaymentPromoDiscountAmount(order: PrintOrderBo): number {
  return Math.abs(Number(order.promoDiscount ?? 0)) + Math.abs(Number(order.couponsAmount ?? 0))
}

function getPaymentSpecialDiscountAmount(order: PrintOrderBo): number {
  return Math.abs(Number(order.pwdDiscount ?? 0)) || Math.abs(Number(order.discountAmount ?? 0))
}

function getPaymentGeneralDiscountAmount(order: PrintOrderBo): number {
  return isSpecialDiscount(order) ? 0 : Math.abs(Number(order.discountAmount ?? 0))
}

function getPaymentDisplayedDiscountAmount(order: PrintOrderBo): number {
  return (
    getPaymentPromoDiscountAmount(order) +
    (isSpecialDiscount(order) ? getPaymentSpecialDiscountAmount(order) : getPaymentGeneralDiscountAmount(order)) +
    Math.abs(Number(order.lessVat ?? 0))
  )
}

function getPaymentGrossAmount(order: PrintOrderBo): number {
  const itemAmount = sumPaymentItemAmount(order)
  const deliveryFee = Number(order.deliveryFee ?? 0)
  const merchantDeliveryFee = Number(order.merchantDeliveryFee ?? 0)
  const deliveryTotal = deliveryFee - merchantDeliveryFee

  return itemAmount + Number(order.serviceFee ?? 0) + Number(order.packagingFee ?? 0) + deliveryTotal
}

function getPaymentTotalAmount(order: PrintOrderBo): number {
  // Total Amount 必须与本张小票已展示的金额行一致，不能直接取可能未扣折扣的 paymentAmount。
  return Math.max(0, getPaymentGrossAmount(order) - getPaymentDisplayedDiscountAmount(order))
}

function pushPaymentLikeAmountRows(
  lines: string[],
  order: PrintOrderBo,
  width: number,
  amountRowsType: 'payment' | 'order',
  amountSignMode: PaymentLikeReceiptConfig['amountSignMode'] = 'normal',
): void {
  if (amountRowsType === 'order') {
    pushOrderAmountRows(lines, order, width)
    return
  }

  pushPaymentAmountRows(lines, order, width, amountSignMode)
}

function pushOrderAmountRows(lines: string[], order: PrintOrderBo, width: number): void {
  const itemAmount = sumPaymentItemAmount(order)
  const totalAmount =
    itemAmount + Number(order.serviceFee ?? 0) + Number(order.packagingFee ?? 0) + Number(order.deliveryFee ?? 0)
  const labels = order.chinese
    ? { itemQty: '菜品数量', subTotal: '小计', totalAmount: '总金额' }
    : { itemQty: 'Qty of Items', subTotal: 'SubTotal', totalAmount: 'Total Amount' }

  // Order 小票只展示菜品数量、小计和总金额，不展示 Payment 的折扣/税费/签字信息。
  lines.push(formatPaymentRow(labels.itemQty, String(order.itemNum ?? 0), width))
  lines.push(formatPaymentRow(labels.subTotal, formatAmount(itemAmount), width))

  if (Number(order.serviceFee ?? 0) > 0) {
    lines.push(formatPaymentRow(order.chinese ? '服务费' : 'Serv Chrg', formatAmount(order.serviceFee), width))
  }

  if (Number(order.packagingFee ?? 0) > 0) {
    lines.push(formatPaymentRow(order.chinese ? '打包费' : 'Packaging Fee', formatAmount(order.packagingFee), width))
  }

  if (Number(order.deliveryFee ?? 0) > 0) {
    lines.push(formatPaymentRow(order.chinese ? '配送费' : 'Delivery Fee', formatAmount(order.deliveryFee), width))
  }

  lines.push(formatPaymentRow(labels.totalAmount, formatAmount(totalAmount), width))
}

function getBillPromoDiscountAmount(order: PrintOrderBo): number {
  const storedPromoDiscount = Math.abs(Number(order.promoDiscount ?? 0))
  const fallbackDiscount = isSpecialDiscount(order) ? 0 : Math.abs(Number(order.discountAmount ?? 0))

  // 普通 discount_amount 与 promo_discount 是同一笔折扣，二者按优先级取值，Voucher 再合并展示。
  return (storedPromoDiscount || fallbackDiscount) + Math.abs(Number(order.couponsAmount ?? 0))
}

function pushBillAmountRows(lines: string[], order: PrintOrderBo, width: number): void {
  const itemAmount = sumPaymentItemAmount(order)
  const grossAmount =
    itemAmount + Number(order.serviceFee ?? 0) + Number(order.packagingFee ?? 0) + Number(order.deliveryFee ?? 0)
  const promoDiscount = getBillPromoDiscountAmount(order)
  const specialDiscount = isSpecialDiscount(order) ? getPaymentSpecialDiscountAmount(order) : 0
  const lessVat = Math.abs(Number(order.lessVat ?? 0))
  const labels = order.chinese
    ? {
        itemQty: '菜品数量',
        subTotal: '小计',
        serviceFee: '服务费',
        packagingFee: '打包费',
        deliveryFee: '配送费',
        promoDiscount: '促销折扣',
        pwdDiscount: 'PWD 折扣',
        scDiscount: 'SC 折扣',
        totalAmount: '总金额',
      }
    : {
        itemQty: 'Qty of Items',
        subTotal: 'SubTotal',
        serviceFee: 'Serv Chrg',
        packagingFee: 'Packaging Fee',
        deliveryFee: 'Delivery Fee',
        promoDiscount: 'Promo Discount',
        pwdDiscount: 'PWD Discount',
        scDiscount: 'SC Discount',
        totalAmount: 'Total Amount',
      }

  // Bill 金额区块独立展示折扣，不能影响 Order Receipt 的原有金额结构。
  lines.push(formatPaymentRow(labels.itemQty, String(order.itemNum ?? 0), width))
  lines.push(formatPaymentRow(labels.subTotal, formatAmount(itemAmount), width))

  if (Number(order.serviceFee ?? 0) > 0) {
    lines.push(formatPaymentRow(labels.serviceFee, formatAmount(Number(order.serviceFee)), width))
  }

  if (Number(order.packagingFee ?? 0) > 0) {
    lines.push(formatPaymentRow(labels.packagingFee, formatAmount(Number(order.packagingFee)), width))
  }

  if (Number(order.deliveryFee ?? 0) > 0) {
    lines.push(formatPaymentRow(labels.deliveryFee, formatAmount(Number(order.deliveryFee)), width))
  }

  if (promoDiscount > 0) {
    lines.push(formatPaymentRow(labels.promoDiscount, formatAmount(-promoDiscount), width))
  }

  if (specialDiscount > 0) {
    lines.push(
      formatPaymentRow(
        isScDiscount(order) ? labels.scDiscount : labels.pwdDiscount,
        formatAmount(-specialDiscount),
        width,
      ),
    )
  }

  if (lessVat > 0) {
    lines.push(formatPaymentRow('LESS VAT', formatAmount(-lessVat), width))
  }

  const totalAmount = Math.max(0, grossAmount - promoDiscount - specialDiscount - lessVat)
  lines.push(formatPaymentRow(labels.totalAmount, formatAmount(totalAmount), width))
}

function pushPaymentAmountRows(
  lines: string[],
  order: PrintOrderBo,
  width: number,
  amountSignMode: PaymentLikeReceiptConfig['amountSignMode'] = 'normal',
): void {
  const itemAmount = sumPaymentItemAmount(order)
  const labels = order.chinese
    ? {
        itemQty: '菜品数量',
        subTotal: '小计',
        serviceFee: '服务费',
        packagingFee: '打包费',
        deliveryFee: '配送费',
        merchantDeliveryFee: '配送费优惠',
        lessVat: 'LESS VAT',
        totalAmount: '总金额',
        change: '找零',
      }
    : {
        itemQty: 'Number of Items',
        subTotal: 'SubTotal',
        serviceFee: 'Serv Chrg',
        packagingFee: 'Packaging Fee',
        deliveryFee: 'Delivery Fee',
        merchantDeliveryFee: 'Mch Dlv Subs',
        lessVat: 'LESS VAT',
        totalAmount: 'Total Amount',
        change: 'Change',
      }

  lines.push(formatPaymentRow(labels.itemQty, formatReceiptQuantity(String(order.itemNum ?? 0), amountSignMode), width))
  lines.push(formatPaymentRow(labels.subTotal, formatReceiptAmount(itemAmount, amountSignMode), width))

  if (Number(order.serviceFee ?? 0) > 0) {
    lines.push(
      formatPaymentRow(labels.serviceFee, formatReceiptAmount(Number(order.serviceFee), amountSignMode), width),
    )
  }

  if (Number(order.packagingFee ?? 0) > 0) {
    lines.push(
      formatPaymentRow(labels.packagingFee, formatReceiptAmount(Number(order.packagingFee), amountSignMode), width),
    )
  }

  if (Number(order.deliveryFee ?? 0) > 0) {
    lines.push(
      formatPaymentRow(labels.deliveryFee, formatReceiptAmount(Number(order.deliveryFee), amountSignMode), width),
    )
  }

  if (Number(order.merchantDeliveryFee ?? 0) > 0) {
    lines.push(
      formatPaymentRow(
        labels.merchantDeliveryFee,
        formatReceiptAmount(-Math.abs(Number(order.merchantDeliveryFee)), amountSignMode),
        width,
      ),
    )
  }

  pushDiscountRows(lines, order, width, amountSignMode)

  if (Number(order.lessVat ?? 0) > 0) {
    lines.push(
      formatPaymentRow(labels.lessVat, formatReceiptAmount(-Math.abs(Number(order.lessVat)), amountSignMode), width),
    )
  }

  const totalAmount = getPaymentTotalAmount(order)
  lines.push(formatPaymentRow(labels.totalAmount, formatReceiptAmount(totalAmount, amountSignMode), width))

  if (order.channelReferenceNo) {
    lines.push(formatPaymentRow(String(order.paymentChannel || 'Channel Ref'), `- ${order.channelReferenceNo}`, width))
  }

  if (order.paymentChannel) {
    const receivedAmount = Number(order.cashReceiptAmount ?? 0) > 0 ? Number(order.cashReceiptAmount) : totalAmount
    const displayedAmount = isCashPayment(order) ? -Math.abs(receivedAmount) : receivedAmount
    lines.push(formatPaymentRow(order.paymentChannel, formatReceiptAmount(displayedAmount, amountSignMode), width))
  }

  if (Number(order.change ?? 0) > 0) {
    lines.push(formatPaymentRow(labels.change, formatReceiptAmount(Number(order.change), amountSignMode), width))
  }
}

function pushPaymentTaxRows(
  lines: string[],
  order: PrintOrderBo,
  width: number,
  amountSignMode: PaymentLikeReceiptConfig['amountSignMode'] = 'normal',
): void {
  if (!order.vatRegisterStatus) {
    const isExemptDiscount = isSpecialDiscount(order)
    const salesSubjectToPercentageTax = isExemptDiscount ? 0 : sumPaymentItemAmount(order)
    const percentageTax = isExemptDiscount ? 0 : Math.round(salesSubjectToPercentageTax * 0.03)
    const exemptSales = isExemptDiscount ? getPaymentTotalAmount(order) : 0

    // NON-VAT 普通交易按商品 SubTotal 展示 3% 税；PWD/SC 只展示折后实付免税额。
    lines.push(
      formatPaymentRow('Sales Sub. to % Tax', formatReceiptAmount(salesSubjectToPercentageTax, amountSignMode), width),
    )
    lines.push(formatPaymentRow('%Tax', formatReceiptAmount(percentageTax, amountSignMode), width))
    lines.push(formatPaymentRow('Exempt Sales', formatReceiptAmount(exemptSales, amountSignMode), width))
    return
  }

  lines.push(
    formatPaymentRow('Vatable Sales', formatReceiptAmount(Number(order.vatableSales ?? 0), amountSignMode), width),
  )
  lines.push(formatPaymentRow('VAT', formatReceiptAmount(Number(order.taxAmount ?? 0), amountSignMode), width))
  lines.push(
    formatPaymentRow('VAT Exempt Sales', formatReceiptAmount(Number(order.vatExemptSales ?? 0), amountSignMode), width),
  )
  lines.push(
    formatPaymentRow('Zero Rated Sales', formatReceiptAmount(Number(order.zeroRatedSales ?? 0), amountSignMode), width),
  )
}

function isPwdDiscount(order: PrintOrderBo): boolean {
  const discountType = Number(order.discountType ?? 0)
  const hasDiscountIdentity = Boolean(order.discountId || order.discounterName || order.discountValidityPeriod)

  return (
    [DiscountTypeEnum.PWD_SC_ALL, DiscountTypeEnum.PWD_SC_PEOPLE].includes(discountType) ||
    // 兼容本地/外部支付记录中 discount_type=2 但携带 PWD 证件信息的历史数据。
    (discountType === DiscountTypeEnum.CUSTOM && hasDiscountIdentity)
  )
}

function isScDiscount(order: PrintOrderBo): boolean {
  return [DiscountTypeEnum.SC_ALL, DiscountTypeEnum.SC_PEOPLE].includes(Number(order.discountType ?? 0))
}

function formatFillLine(label: string, width: number): string {
  const safeLabel = label.endsWith(':') ? label : `${label}:`
  const fillWidth = Math.max(4, width - calculateDisplayLength(safeLabel))
  let fill = ''

  while (calculateDisplayLength(fill) < fillWidth) {
    fill += '_ '
  }

  return `${safeLabel}${fill.slice(0, fillWidth)}`
}

function parseFirstDiscountId(order: PrintOrderBo): string {
  const raw = String(order.discountId ?? '').trim()

  if (!raw) {
    return ''
  }

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return String(parsed[0] ?? '')
    }
  } catch {
    return raw
  }

  return raw
}

function getDiscountCustomerName(order: PrintOrderBo): string {
  const name = String(order.discounterName ?? '').trim()
  const serialNo = String(order.discountSerialNo ?? '').trim()

  return serialNo ? `${name}(${serialNo})` : name
}

function pushWrappedIndented(lines: string[], text: string, width: number, indent = 0): void {
  wrapText(text, Math.max(1, width - indent))
    .split('\n')
    .filter((line) => line.length > 0)
    .forEach((line) => lines.push(`${' '.repeat(indent)}${line}`))
}

function pushPaymentDiscountCustomerInfo(
  lines: string[],
  order: PrintOrderBo,
  width: number,
  discountLabel: 'PWD' | 'SC',
): void {
  const discountName = getDiscountCustomerName(order)
  const discountId = parseFirstDiscountId(order)

  // PWD/SC 姓名跟随标签同行展示，超出内容宽度时才从左侧继续换行。
  pushWrappedIndented(lines, `${discountLabel} NAME:${discountName ? ` ${discountName}` : ''}`, width, 0)

  if (discountLabel === 'PWD' && order.discountValidityPeriod) {
    lines.push(`VALID THRU: ${formatReceiptDateTime(order.discountValidityPeriod)}`)
  }

  lines.push(formatFillLine(order.chinese ? '地址:' : 'ADDRESS:', width))
  lines.push(formatFillLine('TIN:', width))

  if (discountId) {
    lines.push(`${discountLabel} ID: ${discountId}`)
  }

  lines.push(formatFillLine(order.chinese ? '签名:' : 'SIGNATURE:', width))
}

function pushPaymentCustomerInfo(lines: string[], order: PrintOrderBo, width: number): void {
  const discountType = Number(order.discountType ?? 0)
  const labels = order.chinese
    ? { name: '姓名:', address: '地址:', signature: '签名:' }
    : { name: 'NAME:', address: 'ADDRESS:', signature: 'SIGNATURE:' }

  // CUSTOMER INFORMATION 的姓名前缀只由明确的 PWD/SC 折扣类型决定。
  if ([DiscountTypeEnum.PWD_SC_ALL, DiscountTypeEnum.PWD_SC_PEOPLE].includes(discountType)) {
    pushPaymentDiscountCustomerInfo(lines, order, width, 'PWD')
    return
  }

  if ([DiscountTypeEnum.SC_ALL, DiscountTypeEnum.SC_PEOPLE].includes(discountType)) {
    pushPaymentDiscountCustomerInfo(lines, order, width, 'SC')
    return
  }

  lines.push(formatFillLine(labels.name, width))
  lines.push(formatFillLine(labels.address, width))
  lines.push(formatFillLine('TIN:', width))
  lines.push(formatFillLine(labels.signature, width))
}

function pushFixedPaymentFooter(
  lines: string[],
  width: number,
  chinese: boolean,
  discountFirstPrint?: number,
  statement = 'This serves as INVOICE.',
  showNonVatInputTaxStatement = false,
): void {
  // 后端中文 footer 不展示英文的 CUSTOMER/MERCHANT COPY 联次标题。
  const copyLine = chinese
    ? ''
    : discountFirstPrint === 1
      ? '*** CUSTOMER COPY ***'
      : discountFirstPrint === 2
        ? '*** MERCHANT COPY ***'
        : ''
  const footerLines = [
    'Swifood Innovation, Inc',
    'Unit 9D, 9th Floor The Valero',
    'Tower, 122 Valero Street Salcedo',
    'Village, Bel-Air, City of',
    'Makati, NCR, Fourth District,',
    'Philippines',
    'VAT REG TIN: 625-748-670-00000',
    'ACC:0506257486702024112145',
    'DATE ISSUED: 2024/12/05',
    'VALID UNTIL: 2029/12/05',
    'PTU: 3283289382',
    'DATE ISSUED: 2025/02/10',
    '',
    statement,
    '',
    ...(showNonVatInputTaxStatement
      ? [...(copyLine ? [copyLine, ''] : []), 'THIS DOCUMENT IS NOT VALID FOR', 'CLAIM OF INPUT TAX', '']
      : [copyLine, ...(copyLine ? [''] : [])]),
    'Powered by Swifood',
  ]

  footerLines.forEach((line) => {
    lines.push(line ? centerAlign(line, width) : '')
  })
}

/**
 * 格式化金额（分转元，保留2位小数）
 * @param amount 金额（分）
 * @returns 格式化后的金额字符串
 */
function formatAmount(amount: number): string {
  return (amount / 100).toFixed(2)
}
