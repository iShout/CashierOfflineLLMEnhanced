/**
 * 报表打印生成器
 * 根据 ShiftReportData 生成交班报表文本
 * 根据 ProductSummaryData 生成产品汇总报表文本
 */

import type {
  ShiftReportData,
  ProductSummaryData,
  EndOfDayReportData,
  LessWithdrawalReportData,
} from '@app-types/models/printReport'
import { calculateDisplayLength, centerAlign, formatWithNewline, wrapText } from '@shared/utils'
import { getTranslations } from './printReceiptTranslations'

/**
 * 格式化金额（分转元，保留2位小数）
 * @param amount 金额（分）
 * @returns 格式化后的金额字符串
 */
function formatAmount(amount: number): string {
  return (amount / 100).toFixed(2)
}

const ZERO_RECEIPT_NO = '00000000000000000000'
const ZERO_REFUND_RECEIPT_NO = '0000000000000000000'

const SWIFOOD_COMPANY_ADDRESS_LINES = [
  'Unit 9D, 9th Floor The Valero',
  'Tower, 122 Valero Street Salcedo',
  'Village, Bel-Air, City of',
  'Makati, NCR, Fourth District,',
  'Philippines',
]

const SWIFOOD_ACCREDITATION_NUMBER = '0506257486702024112145'
const SWIFOOD_ACCREDITATION_ISSUE_DATE = '2024/12/05'
const SWIFOOD_ACCREDITATION_VALID_UNTIL = '2029/12/05'
const SWIFOOD_PTU_NUMBER = '322233222111'
const SWIFOOD_PTU_ISSUE_DATE = '2025/02/08'

const formatReportDateTime = (value: string): string => value.replace(/-/g, '/')

const pushWrappedCentered = (lines: string[], text: string, width: number): void => {
  const safeText = String(text ?? '').trim()
  if (!safeText) {
    return
  }

  const wrappedLines = formatWithNewline(width, safeText, '').trimEnd().split('\n').filter(Boolean)
  for (const line of wrappedLines) {
    lines.push(centerAlign(line.trimEnd(), width))
  }
}

const pushReportMerchantHeader = (
  lines: string[],
  report: { restaurantName: string; tradeName?: string; taxpayerName?: string },
  width: number,
): void => {
  const tradeName = String(report.tradeName ?? '').trim()
  const taxpayerName = String(report.taxpayerName ?? '').trim()

  if (tradeName && taxpayerName) {
    pushWrappedCentered(lines, tradeName, width)

    if (tradeName !== taxpayerName) {
      // 与 Payment/Refund 一致：名称不同时展示经营主体，并在 TIN 前保留空行。
      pushWrappedCentered(lines, 'Owned and Operated By', width)
      pushWrappedCentered(lines, taxpayerName, width)
      lines.push('')
    }
    return
  }

  pushWrappedCentered(lines, tradeName || taxpayerName || report.restaurantName, width)
}

const pushReportReprintHeader = (
  lines: string[],
  report: { reprintCount?: number; reprintTime?: string; printTime: string },
  width: number,
  reprintText: (count: number) => string,
  timeLabel: string,
): void => {
  const reprintCount = Number(report.reprintCount ?? 0)
  if (reprintCount <= 0) {
    return
  }

  // 与 Payment/Refund 保持相同的居中方式和上下空行。
  lines.push(centerAlign(reprintText(reprintCount), width))
  lines.push('')
  lines.push(centerAlign(`${timeLabel}${formatReportDateTime(report.reprintTime || report.printTime)}`, width))
  lines.push('')
  lines.push('')
}

const pushCompanyAddressCentered = (lines: string[], address: string, width: number): void => {
  const safeAddress = String(address ?? '').trim()
  if (!safeAddress) {
    return
  }

  // 公司地址按单词边界自动换行，避免逗号强制断行或把 Village 等单词截成两行。
  wrapText(safeAddress.replace(/\s*\n\s*/g, ' '), width)
    .split('\n')
    .filter(Boolean)
    .forEach((line) => lines.push(centerAlign(line, width)))
}

const pushReportPair = (lines: string[], width: number, label: string, value: string): void => {
  lines.push(formatWithNewline(width, label, value).trimEnd())
}

const splitByDisplayWidth = (text: string, width: number): string[] => {
  const safeText = String(text ?? '')
  const lines: string[] = []
  let currentLine = ''
  let currentLength = 0

  for (const char of safeText) {
    const charLength = calculateDisplayLength(char)

    if (currentLine && currentLength + charLength > width) {
      lines.push(currentLine)
      currentLine = ''
      currentLength = 0
    }

    currentLine += char
    currentLength += charLength
  }

  if (currentLine || lines.length === 0) {
    lines.push(currentLine)
  }

  return lines
}

const rightAlignWithinWidth = (text: string, width: number): string => {
  const safeText = String(text ?? '')
  const padding = Math.max(0, width - calculateDisplayLength(safeText))

  return `${' '.repeat(padding)}${safeText}`
}

const pushEndOfDayLeftLabelRightValue = (lines: string[], width: number, label: string, value: string): void => {
  const safeLabel = String(label ?? '')
  const safeValue = String(value ?? '')
  const labelLength = calculateDisplayLength(safeLabel)
  const valueLength = calculateDisplayLength(safeValue)
  const remainingWidth = width - labelLength

  // EOD 特殊排版：字段永远完整靠左；只有值在放不下时换到第二行靠右。
  if (safeValue && remainingWidth > valueLength) {
    lines.push(`${safeLabel}${' '.repeat(remainingWidth - valueLength)}${safeValue}`)
    return
  }

  lines.push(safeLabel)
  if (safeValue) {
    splitByDisplayWidth(safeValue, width).forEach((valueLine) => {
      lines.push(rightAlignWithinWidth(valueLine, width))
    })
  }
}

const centerReportAmount = (lines: string[], width: number, label: string, amount: number): void => {
  pushEndOfDayLeftLabelRightValue(lines, width, `${label}:`, formatAmount(amount))
}

const pushReportAmount = (lines: string[], width: number, label: string, amount: number): void => {
  pushEndOfDayLeftLabelRightValue(lines, width, label, formatAmount(amount))
}

const pushReceiptRange = (lines: string[], width: number, label: string, value: string): void => {
  const safeValue = value || ZERO_RECEIPT_NO

  pushEndOfDayLeftLabelRightValue(lines, width, label, safeValue)
}

const pushSectionTitle = (lines: string[], width: number, title: string): void => {
  lines.push('-'.repeat(width))
  lines.push(centerAlign(title, width))
  lines.push('')
}

const pushPosLine = (lines: string[], width: number, posName: string): void => {
  // POS 仅作为旧报表展示信息保留，新报表为空时不输出该行。
  if (!String(posName ?? '').trim()) return
  lines.push(centerAlign(`POS#: ${posName}`, width))
}

function applyReceiptBlockMargin(lines: string[], contentWidth: number, printColumns: number): string[] {
  const margin = ' '.repeat(Math.max(0, Math.floor((printColumns - contentWidth) / 2)))

  return lines.map((line) => (line ? `${margin}${line}` : line))
}

/**
 * 生成交班报表文本
 * @param report 报表数据对象
 * @param width 小票内容宽度，默认32
 * @param printColumns 打印纸宽列数，58mm 为32，80mm 为48
 * @returns 报表文本
 */
export function generateShiftReport(report: ShiftReportData, width: number = 32, printColumns: number = 32): string {
  const t = getTranslations(report.chinese)
  const lines: string[] = []

  // ============= 1. 餐厅与 BIR 头部信息 =============
  pushReportReprintHeader(lines, report, width, t.reprint, t.time)
  pushReportMerchantHeader(lines, report, width)

  if (!report.vatRegisterStatus && report.tinNumber) {
    pushWrappedCentered(lines, `NON-VAT REG TIN: ${report.tinNumber}`, width)
  } else if (report.vatRegisterStatus && report.tinNumber) {
    pushWrappedCentered(lines, `VAT REG TIN: ${report.tinNumber}`, width)
  }

  if (report.minNumber) {
    pushWrappedCentered(lines, `MIN #: ${report.minNumber}`, width)
  }

  if (report.serialNumber) {
    pushWrappedCentered(lines, `SERIAL #: ${report.serialNumber}`, width)
  }

  pushPosLine(lines, width, report.posName)

  if (report.reportNumber) {
    lines.push(centerAlign(t.xCount(report.reportNumber), width))
  }

  // X Count 后按 BIR 样式保留空行、分隔线、空行，再进入标题。
  lines.push('')
  lines.push('-'.repeat(width))
  lines.push('')

  // ============= 2. 报表标题 =============
  lines.push(centerAlign(t.reportTitle, width))
  lines.push('')

  // ============= 3. 班次时间信息 =============
  pushReportPair(lines, width, t.printTime, formatReportDateTime(report.printTime))
  pushReportPair(lines, width, 'START TIME', formatReportDateTime(report.startTime))
  pushReportPair(lines, width, 'END TIME', formatReportDateTime(report.endTime))
  pushReportPair(lines, width, t.cashier, report.cashierName)

  // 分隔线
  lines.push('-'.repeat(width))

  // ============= 4. SI 号范围 =============
  if (report.begSiNumber) {
    pushReportPair(lines, width, 'BEG. SI #', report.begSiNumber)
  }
  if (report.endSiNumber) {
    pushReportPair(lines, width, 'END. SI #', report.endSiNumber)
  }

  // ============= 5. REFUND 号范围 =============
  pushReportPair(lines, width, 'BEG. REFUND #', report.begRefundNumber || ZERO_REFUND_RECEIPT_NO)
  pushReportPair(lines, width, 'END. REFUND #', report.endRefundNumber || ZERO_REFUND_RECEIPT_NO)

  // 分隔线
  lines.push('-'.repeat(width))

  // ============= 6. 开户基金 =============
  lines.push(formatWithNewline(width, t.openingFund, formatAmount(report.openingFund)).trimEnd())

  // 分隔线
  lines.push('-'.repeat(width))

  // ============= 7. 支付方式汇总 =============
  lines.push(centerAlign(t.paymentsReceived, width))
  for (const payment of report.paymentSummaries) {
    lines.push(formatWithNewline(width, payment.paymentMethod, formatAmount(payment.amount)).trimEnd())
  }

  // ============= 8. 总支付金额 =============
  // 班次报告 PAYMENT RECEIVED 区块按产品要求使用简化汇总标签。
  lines.push(formatWithNewline(width, 'TOTAL', formatAmount(report.totalPayments)).trimEnd())

  // ============= 13. 已取消 =============
  if (report.cancelledAmount > 0) {
    lines.push('-'.repeat(width))
    lines.push(formatWithNewline(width, t.cancelled, formatAmount(report.cancelledAmount)).trimEnd())
  }

  // 分隔线
  lines.push('-'.repeat(width))

  // ============= 14. 退款 =============
  lines.push(formatWithNewline(width, t.refund, formatAmount(report.refundAmount)).trimEnd())

  // 分隔线
  lines.push('-'.repeat(width))

  // ============= 15. 取款 =============
  lines.push(formatWithNewline(width, t.withdrawal, formatAmount(report.withdrawalAmount)).trimEnd())

  // 分隔线
  lines.push('-'.repeat(width))

  // ============= 12. 交易汇总 =============
  lines.push('')
  lines.push(centerAlign(t.transactionSummary, width))
  lines.push('')

  lines.push(formatWithNewline(width, t.cashOnHand, formatAmount(report.cashOnHand)).trimEnd())
  lines.push(formatWithNewline(width, t.openingFund, formatAmount(report.openingFund)).trimEnd())
  lines.push(formatWithNewline(width, t.lessWithdrawal, formatAmount(-report.withdrawalAmount)).trimEnd())
  lines.push(formatWithNewline(width, t.paymentsReceived, formatAmount(report.totalPayments)).trimEnd())

  // 分隔线
  lines.push('-'.repeat(width))

  // ============= 17. 短缺/盈余 =============
  const shortOverText =
    report.shortOverAmount >= 0 ? `+${formatAmount(report.shortOverAmount)}` : formatAmount(report.shortOverAmount)
  lines.push(formatWithNewline(width, t.shortOver, shortOverText).trimEnd())

  // 分隔线
  lines.push('')

  // ============= 14. 底部公司信息 =============
  pushWrappedCentered(lines, report.companyName, width)
  pushCompanyAddressCentered(lines, report.companyAddress, width)
  pushWrappedCentered(lines, t.vatRegTin(report.companyTin), width)

  if (report.birInfo) {
    if (report.birInfo.accNumber) {
      pushWrappedCentered(lines, `ACC: ${report.birInfo.accNumber}`, width)
    }

    if (report.birInfo.ptuIssueDate) {
      pushWrappedCentered(lines, t.dateIssued(report.birInfo.ptuIssueDate), width)
    }

    if (report.birInfo.ptuValidUntil) {
      pushWrappedCentered(lines, t.validUntil(report.birInfo.ptuValidUntil), width)
    }

    if (report.birInfo.ptuNumber) {
      pushWrappedCentered(lines, `PTU: ${report.birInfo.ptuNumber}`, width)
    }

    if (report.birInfo.ptuIssueDate) {
      pushWrappedCentered(lines, t.dateIssued(report.birInfo.ptuIssueDate), width)
    }
  }

  lines.push('')
  lines.push(centerAlign(t.poweredBy, width))

  return applyReceiptBlockMargin(lines, width, printColumns).join('\n')
}

/**
 * 生成提现报告文本，对齐后端 /order-print/print/lessWithdrawal 的打印内容。
 */
export function generateLessWithdrawalReport(
  report: LessWithdrawalReportData,
  width: number = 32,
  printColumns: number = width,
): string {
  const lines: string[] = []
  const delimiter = '-'.repeat(width)

  lines.push(centerAlign(report.restaurantName, width))
  pushPosLine(lines, width, report.posName)
  lines.push(delimiter)
  lines.push(centerAlign('***** WITHDRAWAL REPORT *****', width))
  lines.push(formatWithNewline(width - 1, 'Print Time', formatReportDateTime(report.printTime)).trimEnd())
  lines.push(delimiter)
  lines.push(formatWithNewline(width - 1, 'OPENNING FUND', formatAmount(report.openingFund)).trimEnd())
  lines.push(formatWithNewline(width - 1, 'CASH WITHDRAWAL', formatAmount(report.cashWithdrawalAmount)).trimEnd())
  lines.push(formatWithNewline(width - 1, 'CASH RECEIVED', formatAmount(report.cashReceivedAmount)).trimEnd())
  lines.push(formatWithNewline(width - 1, 'CASH ON HAND', formatAmount(report.cashOnHandAmount)).trimEnd())
  lines.push(delimiter)
  lines.push('WITHDRAWAL DETAIL')

  for (const item of report.withdrawalRecords) {
    lines.push(formatWithNewline(width - 1, item.remark || '', formatAmount(item.amount)).trimEnd())
  }

  lines.push(delimiter)
  lines.push(centerAlign('Powered by Swifood', width))

  return applyReceiptBlockMargin(lines, width, printColumns).join('\n')
}

function formatProductSummaryLine(width: number, qty: string, item: string, price: string, amount: string): string {
  // 产品表使用固定列宽，让金额列贴齐小票内容宽度右侧。
  const qtyWidth = Math.max(3, calculateDisplayLength(qty))
  const priceWidth = Math.max(7, calculateDisplayLength(price))
  const amountWidth = Math.max(8, calculateDisplayLength(amount))
  const itemWidth = Math.max(1, width - qtyWidth - 1 - 2 - priceWidth - 1 - amountWidth)
  let currentLength = 0
  let firstItemPart = ''
  let remainingItem = ''

  for (let i = 0; i < item.length; i++) {
    const char = item[i]
    const charLen = isChineseChar(char) ? 2 : 1

    if (currentLength + charLen > itemWidth && firstItemPart.length > 0) {
      remainingItem = item.substring(i)
      break
    }

    firstItemPart += char
    currentLength += charLen
  }

  const itemPadding = Math.max(0, itemWidth - calculateDisplayLength(firstItemPart))
  const lines = [
    `${qty.padEnd(qtyWidth)} ${firstItemPart}${' '.repeat(itemPadding)}  ${price.padStart(priceWidth)} ${amount.padStart(amountWidth)}`,
  ]

  // 长 ITEM 剩余文案只放到第二行居中，不再继续占用价格和金额列。
  if (remainingItem.trim()) {
    lines.push(centerAlign(remainingItem.trim(), width))
  }

  return lines.join('\n')
}

/**
 * 判断是否为中文字符
 * @param c 字符
 * @returns 是否为中文字符
 */
function isChineseChar(c: string): boolean {
  const code = c.charCodeAt(0)
  return (
    (code >= 0x4e00 && code <= 0x9fa5) || // 基本汉字
    (code >= 0x3000 && code <= 0x303f) || // 中文标点符号
    (code >= 0xff00 && code <= 0xffef) // 全角符号
  )
}

/**
 * 格式化商品列表行（QTY + ITEM + PRICE + AMOUNT）
 * @param width 总宽度
 * @param qty 数量
 * @param item 商品名称
 * @param price 单价
 * @param amount 总金额
 * @returns 格式化后的多行文本
 */
function formatProductLine(width: number, qty: string, item: string, price: string, amount: string): string {
  // 动态计算 PRICE 和 AMOUNT 需要的宽度
  const priceDisplayLength = calculateDisplayLength(price)
  const amountDisplayLength = calculateDisplayLength(amount)
  const priceWidth = Math.max(8, priceDisplayLength)
  const amountWidth = Math.max(8, amountDisplayLength)
  const spaceWidth = 1

  // 计算 ITEM 可用的最大显示宽度
  const qtyDisplayLength = calculateDisplayLength(qty)
  const availableWidthForItem = width - priceWidth - amountWidth - spaceWidth * 2 - qtyDisplayLength

  if (availableWidthForItem <= 0) {
    // 空间不够，PRICE 和 AMOUNT 单独换行显示
    const lines: string[] = []
    lines.push(`${qty} ${item}`)
    lines.push(`${' '.repeat(width - priceWidth - amountWidth)}${price} ${amount}`)
    return lines.join('\n')
  }

  const lines: string[] = []

  // 计算 ITEM 第一部分能显示多少
  let currentItem = item
  let currentLength = 0
  let firstItemPart = ''
  let remainingItem = ''

  for (let i = 0; i < currentItem.length; i++) {
    const char = currentItem[i]
    const charLen = isChineseChar(char) ? 2 : 1

    if (currentLength + charLen > availableWidthForItem && firstItemPart.length > 0) {
      remainingItem = currentItem.substring(i)
      break
    }

    firstItemPart += char
    currentLength += charLen

    if (i === currentItem.length - 1) {
      remainingItem = ''
    }
  }

  // 构建第一行：QTY + 空格 + ITEM第一部分 + 填充空格 + PRICE + 空格 + AMOUNT
  const itemPartLength = calculateDisplayLength(firstItemPart)
  const paddingSpaces = width - qtyDisplayLength - spaceWidth - itemPartLength - priceWidth - spaceWidth - amountWidth
  const firstLine = `${qty} ${firstItemPart}${' '.repeat(Math.max(0, paddingSpaces))}${price} ${amount}`
  lines.push(firstLine)

  // 处理 ITEM 的剩余部分（换行）
  if (remainingItem && remainingItem.length > 0) {
    const indent = ' '.repeat(qtyDisplayLength + spaceWidth)
    const wrappedLines = remainingItem.match(/.{1,20}/g) || []
    for (const line of wrappedLines) {
      if (line.trim()) {
        lines.push(`${indent}${line}`)
      }
    }
  }

  return lines.join('\n')
}

/**
 * 生成产品汇总报表文本
 * @param report 报表数据对象
 * @param width 小票宽度，默认48
 * @returns 报表文本
 */
export function generateProductSummary(
  report: ProductSummaryData,
  width: number = 32,
  printColumns: number = 32,
): string {
  const t = getTranslations(report.chinese)
  const lines: string[] = []

  pushReportReprintHeader(lines, report, width, t.reprint, t.time)

  // ============= 1. 日期时间 =============
  // 产品汇总沿用 End-of-Shift 的餐厅与 BIR 头部，仅替换报表标题和中间内容。

  // ============= 2. 餐厅名称 =============
  pushReportMerchantHeader(lines, report, width)

  // ============= 3. VAT 信息 =============
  if (!report.vatRegisterStatus && report.tinNumber) {
    pushWrappedCentered(lines, `NON-VAT REG TIN: ${report.tinNumber}`, width)
  } else if (report.vatRegisterStatus && report.tinNumber) {
    pushWrappedCentered(lines, `VAT REG TIN: ${report.tinNumber}`, width)
  }

  // ============= 4. MIN 和 SERIAL =============
  if (report.minNumber) {
    pushWrappedCentered(lines, `MIN #: ${report.minNumber}`, width)
  }

  if (report.serialNumber) {
    pushWrappedCentered(lines, `SERIAL #: ${report.serialNumber}`, width)
  }

  pushPosLine(lines, width, report.posName)

  // ============= 5. X Count =============
  if (report.reportNumber) {
    lines.push(centerAlign(t.xCount(report.reportNumber), width))
  }

  // 分隔线
  lines.push('')
  lines.push('-'.repeat(width))

  // ============= 6. 报表标题 =============
  lines.push(centerAlign(t.productSummaryTitle, width))
  lines.push('')

  // ============= 7. 班次时间信息 =============
  pushReportPair(lines, width, t.printTime, formatReportDateTime(report.printTime))
  pushReportPair(lines, width, 'START TIME', formatReportDateTime(report.startTime))
  pushReportPair(lines, width, 'END TIME', formatReportDateTime(report.endTime))
  pushReportPair(lines, width, t.cashier, report.cashierName)

  // 分隔线
  lines.push('')
  lines.push('-'.repeat(width))

  // ============= 8. 商品列表 =============
  lines.push(formatProductSummaryLine(width, 'QTY', 'ITEM', 'PRICE', 'AMOUNT'))

  for (const product of report.productList) {
    const qtyStr = String(product.quantity)
    const priceStr = formatAmount(product.price)
    const amountStr = formatAmount(product.totalAmount)
    const formattedProduct = formatProductSummaryLine(width, qtyStr, product.itemName, priceStr, amountStr)
    // 产品名换行时拆成独立小票行，确保第二行也按整张表格宽度加边距和居中。
    lines.push(...formattedProduct.split('\n'))
  }

  // 分隔线
  lines.push('-'.repeat(width))

  // ============= 9. 金额汇总 =============
  // 替代 Transaction Summary / Short Over；按需求即使金额为 0 也展示。
  lines.push(formatWithNewline(width, t.qtyOfItems, String(report.totalQty)).trimEnd())
  lines.push(formatWithNewline(width, t.subTotal, formatAmount(report.subTotal)).trimEnd())
  lines.push(formatWithNewline(width, 'PROMO DISCOUNT', formatAmount(report.promoDiscount)).trimEnd())
  lines.push(formatWithNewline(width, t.vouchersDiscount, formatAmount(report.vouchersDiscount)).trimEnd())
  lines.push(formatWithNewline(width, t.pwdDiscount, formatAmount(report.pwdDiscount)).trimEnd())
  lines.push(formatWithNewline(width, t.scDiscount, formatAmount(report.scDiscount)).trimEnd())
  lines.push(formatWithNewline(width, 'LESS VAT', formatAmount(report.lessVat)).trimEnd())
  lines.push(formatWithNewline(width, 'TOTAL AMOUNT', formatAmount(report.totalAmount)).trimEnd())

  // 分隔线
  lines.push('')

  // ============= 10. 底部公司信息 =============
  pushWrappedCentered(lines, report.companyName, width)
  pushCompanyAddressCentered(lines, report.companyAddress, width)
  pushWrappedCentered(lines, t.vatRegTin(report.companyTin), width)

  if (report.birInfo) {
    if (report.birInfo.accNumber) {
      pushWrappedCentered(lines, `ACC: ${report.birInfo.accNumber}`, width)
    }

    if (report.birInfo.ptuIssueDate) {
      pushWrappedCentered(lines, t.dateIssued(report.birInfo.ptuIssueDate), width)
    }

    if (report.birInfo.ptuValidUntil) {
      pushWrappedCentered(lines, t.validUntil(report.birInfo.ptuValidUntil), width)
    }

    if (report.birInfo.ptuNumber) {
      pushWrappedCentered(lines, `PTU: ${report.birInfo.ptuNumber}`, width)
    }

    if (report.birInfo.ptuIssueDate) {
      pushWrappedCentered(lines, t.dateIssued(report.birInfo.ptuIssueDate), width)
    }
  }

  lines.push('')
  lines.push(centerAlign(t.poweredBy, width))

  return applyReceiptBlockMargin(lines, width, printColumns).join('\n')
}

/**
 * 生成日终报表文本
 * @param report 报表数据对象
 * @param width 小票宽度，默认48
 * @returns 报表文本
 */
export function generateEndOfDayReport(
  report: EndOfDayReportData,
  width: number = 32,
  printColumns: number = 32,
): string {
  const t = getTranslations(report.chinese)
  const lines: string[] = []

  // ============= 1. 餐厅与 BIR 基础信息 =============
  pushReportReprintHeader(lines, report, width, t.reprint, t.time)
  pushReportMerchantHeader(lines, report, width)

  if (!report.vatRegisterStatus && report.tinNumber) {
    pushWrappedCentered(lines, `NON-VAT REG TIN: ${report.tinNumber}`, width)
  } else if (report.vatRegisterStatus && report.tinNumber) {
    pushWrappedCentered(lines, `VAT REG TIN: ${report.tinNumber}`, width)
  }

  if (report.minNumber) {
    pushWrappedCentered(lines, `MIN #: ${report.minNumber}`, width)
  }

  if (report.serialNumber) {
    pushWrappedCentered(lines, `SERIAL #: ${report.serialNumber}`, width)
  }

  pushPosLine(lines, width, report.posName)

  if (report.zCount) {
    pushWrappedCentered(lines, t.zCount(report.zCount), width)
  }
  pushWrappedCentered(lines, `Reset Counter No.: ${report.resetCounterNo || '0'}`, width)

  lines.push('')
  lines.push(centerAlign('-'.repeat(Math.max(30, width - 14)), width))
  lines.push('')
  pushWrappedCentered(lines, t.endOfDayReportTitle, width)
  lines.push('')

  // ============= 2. 生成时间与周期 =============
  lines.push(formatWithNewline(width, t.printTime, formatReportDateTime(report.printTime)).trimEnd())
  lines.push(formatWithNewline(width, 'START TIME', formatReportDateTime(report.startTime)).trimEnd())
  lines.push(formatWithNewline(width, 'END TIME', formatReportDateTime(report.endTime)).trimEnd())

  lines.push('')
  lines.push(centerAlign('-'.repeat(Math.max(30, width - 14)), width))

  // ============= 3. 票据号范围 =============
  pushReceiptRange(lines, width, 'BEG. SI #', report.begSiNumber)
  pushReceiptRange(lines, width, 'END. SI #', report.endSiNumber)
  pushReceiptRange(lines, width, 'BEG. CANCELLED #', report.begCancelledNumber)
  pushReceiptRange(lines, width, 'END. CANCELLED #', report.endCancelledNumber)
  pushReceiptRange(lines, width, 'BEG. REFUND #', report.begRefundNumber)
  pushReceiptRange(lines, width, 'END. REFUND #', report.endRefundNumber)

  lines.push('')
  lines.push(centerAlign('-'.repeat(Math.max(30, width - 14)), width))

  // ============= 4. 累计销售 =============
  centerReportAmount(lines, width, t.presentAccumulatedSales, report.presentAccumulatedSales)
  centerReportAmount(lines, width, t.previousAccumulatedSales, report.previousAccumulatedSales)
  centerReportAmount(lines, width, t.salesOfTheDay, report.salesOfTheDay)

  // 日终收款明细复用 Report Summary 的支付渠道数据，并在销售汇总与销售拆分之间独立分段。
  lines.push('')
  pushSectionTitle(lines, width, t.paymentsReceived)
  for (const payment of report.paymentSummaries) {
    pushReportAmount(lines, width, payment.paymentMethod, payment.amount)
  }
  lines.push('')
  pushReportAmount(lines, width, 'TOTAL', report.totalPayments)

  lines.push('')
  pushSectionTitle(lines, width, 'SALES BREAKDOWN')
  if (report.vatRegisterStatus) {
    pushReportAmount(lines, width, 'VATABLE SALES', report.vatableSales)
    pushReportAmount(lines, width, 'VAT AMOUNT', report.vatAmount)
    pushReportAmount(lines, width, 'VAT EXEMPT SALES', report.vatExemptSales)
    pushReportAmount(lines, width, 'ZERO-RATED SALES', report.zeroRatedSales)
  } else {
    // NON-VAT 日终报告以 3% 税销售额、税额和 PWD/SC 免税销售额替代 VAT 四字段。
    pushReportAmount(lines, width, 'Sales Sub. to % Tax', report.salesSubTax)
    pushReportAmount(lines, width, '%Tax', report.percentageTax)
    pushReportAmount(lines, width, 'Exempt Sales', report.exemptSales)
  }
  pushReportAmount(lines, width, t.grossAmount, report.grossAmount)
  pushReportAmount(lines, width, t.lessDiscount, report.lessDiscount)
  pushReportAmount(lines, width, t.lessRefund, report.lessRefund)
  pushReportAmount(lines, width, t.lessCancelled, report.lessCancelled)
  pushReportAmount(lines, width, t.lessVatAdjustment, report.lessVatAdjustment)
  pushReportAmount(lines, width, t.netAmount, report.netAmount)

  lines.push('')
  pushSectionTitle(lines, width, 'SERVICE CHARGE')
  pushReportAmount(lines, width, t.serviceChargeAmount, report.serviceChargeAmount)
  pushReportAmount(lines, width, 'SERVICE CHARGE TAX', report.serviceChargeTax)
  pushReportAmount(lines, width, t.totalServiceCharge, report.totalServiceCharge)

  lines.push('')
  pushSectionTitle(lines, width, 'DISCOUNT SUMMARY')
  pushReportAmount(lines, width, 'PWD DISCOUNTS(20%)', report.pwdDiscount)
  pushReportAmount(lines, width, 'SC DISCOUNTS(20%)', report.scDiscount)
  pushReportAmount(lines, width, t.naacDiscount, report.naacDiscount)
  pushReportAmount(lines, width, t.soloParentDiscount, report.soloParentDiscount)
  pushReportAmount(lines, width, t.otherDiscounts, report.otherDiscount)

  lines.push('')
  pushSectionTitle(lines, width, 'SALES ADJUSTMENT')
  pushReportAmount(lines, width, t.cancelled, report.cancelledAmount)
  pushReportAmount(lines, width, t.refund, report.refundAmount)

  lines.push('')
  lines.push(centerAlign('-'.repeat(Math.max(30, width - 14)), width))

  // ============= 5. 固定服务商认证信息 =============
  pushWrappedCentered(lines, report.companyName || 'Swifood Innovation Inc.', width)
  SWIFOOD_COMPANY_ADDRESS_LINES.forEach((line) => pushWrappedCentered(lines, line, width))
  pushWrappedCentered(lines, t.vatRegTin(report.companyTin), width)
  pushWrappedCentered(lines, `ACC:${SWIFOOD_ACCREDITATION_NUMBER}`, width)
  pushWrappedCentered(lines, t.dateIssued(SWIFOOD_ACCREDITATION_ISSUE_DATE), width)
  pushWrappedCentered(lines, t.validUntil(SWIFOOD_ACCREDITATION_VALID_UNTIL), width)
  pushWrappedCentered(lines, `PTU: ${SWIFOOD_PTU_NUMBER}`, width)
  pushWrappedCentered(lines, t.dateIssued(SWIFOOD_PTU_ISSUE_DATE), width)

  if (!report.vatRegisterStatus) {
    lines.push('')
    pushWrappedCentered(lines, 'THIS DOCUMENT IS NOT VALID FOR', width)
    pushWrappedCentered(lines, 'CLAIM OF INPUT TAX', width)
    lines.push('')
  } else {
    // VAT 日终报告保留原有的双空行页脚间距。
    lines.push('')
    lines.push('')
  }

  pushWrappedCentered(lines, t.poweredBy, width)

  return applyReceiptBlockMargin(lines, width, printColumns).join('\n')
}
