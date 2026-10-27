/**
 * 服务员结算报表业务逻辑
 * 从订单数据生成服务员结算报表
 * 对应后端 RestaurantReportBusinessImpl.querySettlementReport 方法
 * 全部使用新报告逻辑（通过 waiter_clock_order 表）
 */

import { getDB } from '../../db'
import iconv from 'iconv-lite'
import dayjs from 'dayjs'
import { ORDER_STATUS, ORDER_TYPE, PAYMENT_STATUS } from '../../db/constants/order'
import { AUDIT_STATUS, RECORD_THE_ORDER_TYPE, WAITER_TYPE } from '../constants/order'
import { getCurrentSession } from '@main/authManager'

import { app } from 'electron'
import fs from 'fs'
import path from 'path'

import type {
  WaiterSettlementReportData,
  PaymentSummary,
  WithdrawalRecord,
  ChannelSettlementReport,
  BirReportInfo,
  EndOfDayReportData,
  ProductSummaryData,
  ShiftReportData,
} from '@app-types/models/printReport'
import type {
  FoodOrderRecord,
  OrderPaymentRecord,
  OrderPaymentTaxRecord,
  WaiterClockOrderRecord,
} from '@app-types/models/orders'
import type { RestaurantOperationConfigRecord, RestaurantRecord } from '@app-types/models/settings'
import type { RestaurantReportPrintRecord } from '@app-types/models/report'
import {
  generateEndOfDayReport,
  generateProductSummary,
  generateShiftReport,
} from '@main/services/printReportGenerator'
import { renderReceiptTextToImageDataUrl } from '@main/services/receiptImageRenderer'
import { buildOrderReceiptTextForEJournal } from './order-nonsync'
import { fillBirReportWorkbook } from '@main/services/birReportExcel'
import {
  generateMegaworldFiles,
  generateParqalFile,
  MALL_TYPE,
  readMallCertificationSettings,
} from '@main/services/mallCertification'
import { nextLocalReceiptId, resetLocalTakeFoodNo } from './local-setting'
import { normalizeEndOfDayReportOrderNosText } from './report-json-normalizers'
import { MAX_RECEIPT_REPRINT_COUNT } from '@shared/constants/print'

// 对齐后端 ReportTypeEnum，用于报表快照、打印和 E-Journal 复用。
const END_OF_SHIFT_REPORT_TYPE = 1
const END_OF_DAY_REPORT_TYPE = 2
const SUMMARY_OF_PRODUCT_REPORT_TYPE = 3
const MANUAL_BUILD_TYPE = 1
const AUTOMATIC_BUILD_TYPE = 2
const PUSHED_STATUS = 1
const NOT_PUSHED_STATUS = 2

const UNSYNCED_STATUS = 2
const MAX_REPORT_JSON_LENGTH = 65535
const MAX_AUTO_GENERATE_DAYS = 31

const VAT_REGISTER_ON = 1
const VAT_REGISTER_OFF = 2
const AUDIT_STATUS_PASS = 3

const PAYMENT_RECEIPT_TYPE = 3
const REFUND_RECEIPT_TYPE = 1

const RECEIPT_CONTENT_COLUMNS = 32
const RECEIPT_COLUMNS_58MM = 32
const RECEIPT_COLUMNS_80MM = 48
const BIR_VAT_REGISTER_TYPE = 'VAT REG TIN: '
const BIR_NON_VAT_REGISTER_TYPE = 'NON-VAT REG TIN: '
const XLSX_EXTENSION = '.xlsx'
const BIR_XLSX_TEMPLATE_DIR = 'xlsxTemplate'
const BIR_VAT_TEMPLATE = 'BIRReports.xlsx'
const BIR_NON_VAT_TEMPLATE = 'BIRNotVatReports.xlsx'
// BIR 报表首行是监管要求的固定标识，不跟随应用版本或生成日期变化。
const BIR_REPORT_VERSION = 'Swifood 1.0.4 2024-05-01'
const CUSTOM_DISCOUNT_TYPE = 2
const PWD_SC_ALL_DISCOUNT_TYPE = 1
const PWD_SC_PEOPLE_DISCOUNT_TYPE = 3
const SC_ALL_DISCOUNT_TYPE = 4
const SC_PEOPLE_DISCOUNT_TYPE = 5
const ORDER_APP_MANUAL_ORDER = 7

/**
 * 查询服务员结算报表
 *
 * @param params 查询参数
 * @returns 服务员结算报表数据
 */
export async function queryWaiterSettlementReport(
  params: WaiterSettlementReportParams,
): Promise<WaiterSettlementReportData> {
  const db = getDB()
  const { restaurantId, startTime, endTime, waiterNo } = params

  // ============= 1. 时间范围验证 =============
  validateTimeRange(startTime, endTime)

  // ============= 2. 服务员编号检查 =============
  if (!waiterNo || waiterNo.trim() === '') {
    throw new Error('Waiter number is required')
  }

  // ============= 3. 时区和 BIR 审计时间处理 =============
  const adjustedTimeRange = handleQueryTime(
    db,
    params.restaurantId,
    startTime,
    endTime,
    params.isCashierReport || false,
  )

  const startTimeStr = formatDateTime(adjustedTimeRange.startTime)
  const endTimeStr = formatDateTime(adjustedTimeRange.endTime)

  // ============= 4. 获取订单数据（全部走新报告逻辑）============
  const orderData = await handleNewWaiterOrder(db, restaurantId, waiterNo, startTimeStr, endTimeStr)

  // ============= 5. 获取提款记录 =============
  const withdrawalRecords = await getWithdrawalRecords(db, restaurantId, waiterNo, startTimeStr, endTimeStr)

  // ============= 6. 计算餐厅津贴信息（期初资金、现金在手等）============
  const allowanceInfo = await calculateRestaurantAllowance(
    db,
    restaurantId,
    waiterNo,
    startTimeStr,
    endTimeStr,
    orderData.saleOrders,
    orderData.payments,
    orderData.refundOrders, // 传入退款订单列表
  )

  // ============= 7. 处理销售订单并计算金额 =============
  const salesCalculation = handleSaleOrder(
    orderData.saleOrders,
    orderData.refundOrders,
    orderData.cancelOrders,
    orderData.payments,
  )

  // ============= 8. 生成渠道结算报告 =============
  const paymentChannelNameMap = getPaymentChannelNameMap(db)
  const channelReports = generateChannelSettlementReports(
    orderData.saleOrders,
    orderData.payments,
    paymentChannelNameMap,
  )
  // Payment Received 与支付类型表格的 Total Amount 共用实付金额口径，折扣不计入收款。
  const totalAmount = channelReports.reduce((sum, report) => sum + report.transactionAmount, 0)

  // ============= 9. 计算短溢款 =============
  // 对应后端: resp.setShortOrOver(resp.getCashOnHand() - (cashAmount - restaurantAllowance.getNoCurryRefund() + resp.getOpeningFund()) + resp.getLessWithdrawal());
  const lessWithdrawal = withdrawalRecords.reduce((sum, r) => sum + r.amount, 0)
  const cashPayments = salesCalculation.cashAmount
  const cashOnHand = allowanceInfo.openingFund + cashPayments - lessWithdrawal

  // 短溢款 = 实际现金在手 - (现金销售 - 非当前周期退款 + 期初资金) + 提款
  // 注意：前端当前没有计算非当前周期退款 (noCurryRefund)，这里假设为0
  const noCurryRefund = 0
  let shortOrOver = cashOnHand - (cashPayments - noCurryRefund + allowanceInfo.openingFund) + lessWithdrawal

  // 自助服务 (waiterNo === '0') 的短溢款始终为 0
  if (waiterNo === '0') {
    shortOrOver = 0
  }

  // ============= 10. 设置订单号列表 =============
  const orderNos = setOrderNos(orderData.saleOrders, orderData.refundOrders, orderData.cancelOrders, orderData.payments)

  // ============= 11. 构建 BIR 信息 =============
  const birInfo: BirReportInfo | undefined = params.birInfo
    ? {
        accNumber: params.birInfo.accNumber || '',
        ptuIssueDate: params.birInfo.ptuIssueDate || '',
        ptuValidUntil: params.birInfo.ptuValidUntil || '',
        ptuNumber: params.birInfo.ptuNumber || '',
      }
    : undefined

  // ============= 12. 构建报表数据 =============
  return {
    // 基本信息
    reportDate: formatDate(adjustedTimeRange.startTime),
    reportTime: formatTime(new Date()),
    restaurantName: params.restaurantName,
    // POS 仅保留在旧报表快照中，新报表不再依赖终端绑定。
    posName: '',
    chinese: params.chinese || false,
    vatRegisterStatus: params.vatRegisterStatus || false,
    tinNumber: params.tinNumber || '',
    minNumber: params.minNumber || '',
    serialNumber: params.serialNumber || '',
    reportNumber: params.reportNumber || '',
    printTime: formatTime(new Date()),
    startTime: formatDateTime(adjustedTimeRange.startTime),
    endTime: formatDateTime(adjustedTimeRange.endTime),
    cashierName: params.cashierName || waiterNo,
    waiterNo: waiterNo,
    isNewReport: true, // 全部走新报告逻辑

    // 订单号列表
    orderNos: orderNos.saleOrderNos,
    cancelOrderNos: orderNos.cancelOrderNos,
    refundOrderNos: orderNos.refundOrderNos,

    // 支付汇总
    paymentSummaries: salesCalculation.paymentSummaries,
    paymentReceived: totalAmount,
    totalAmount: totalAmount,
    refundAmount: salesCalculation.refundAmount,
    cancelledAmount: salesCalculation.cancelledAmount,

    // 现金计算
    openingFund: allowanceInfo.openingFund,
    lessWithdrawal: lessWithdrawal,
    cashOnHand: cashOnHand,
    cashPayments: cashPayments,
    withdrawal: lessWithdrawal, // 提现金额 = lessWithdrawal
    isCashOnHand: false, // 固定为 false，与后端收银员报告快照保持一致

    // 短溢款
    shortOrOver: shortOrOver,

    // 提款记录
    withdrawalRecords: withdrawalRecords,

    // 渠道结算报告
    channelSettlementReports: channelReports,

    // 公司信息
    companyName: params.companyName || '',
    companyAddress: params.companyAddress || '',
    companyTin: params.companyTin || '',
    birInfo: birInfo,
  }
}

/**
 * 产品汇总信息
 * 对应后端 ProductSummaryInfo
 */
export interface ProductSummaryInfo {
  /** sku的No */
  skuNo?: string
  /** 菜品No */
  productNo?: string
  /** 菜品名称 */
  productName: string
  /** 规格No */
  specItemNo?: string
  /** 规格名称 */
  specName: string
  /** 数量 */
  quantity: number
  /** 单价 */
  price: number
  /** 总金额 */
  totalAmount: number
  /** 类目 */
  categoryName: string
}

/**
 * 产品汇总报告响应
 * 对应后端 RestaurantSummaryReportResp
 */
export interface SummaryReportResponse {
  /** 菜品总金额 */
  subAmount: number
  /** 支付总金额 */
  totalAmount: number
  /** 优惠金额 */
  discountAmount: number
  /** 菜品数量 */
  productCount: number
  /** 普通折扣 */
  promoDiscountAmount: number
  /** 优惠价金额 */
  couponAmount: number
  /** pwd折扣 */
  pwdDiscountAmount: number
  /** sc折扣 */
  scDiscountAmount: number
  /** lessVat */
  lessVat: number
  /** 菜品汇总信息 */
  productSummaryInfos: ProductSummaryInfo[]
}

const SUMMARY_ORDER_PAYMENT_STATUSES = [
  PAYMENT_STATUS.PAY_SUCCESS,
  PAYMENT_STATUS.REFUNDING,
  PAYMENT_STATUS.REFUND_PENDING,
  PAYMENT_STATUS.REFUND_FAILED,
  PAYMENT_STATUS.REFUND_CANCEL,
] as const

// 累计 Gross Sales 必须保留已退款订单的原销售额，退款金额由 Less Refund 单独体现。
const END_OF_DAY_ACCUMULATED_SALES_PAYMENT_STATUSES = [
  ...SUMMARY_ORDER_PAYMENT_STATUSES,
  PAYMENT_STATUS.REFUNDED,
] as const

const buildNamedInClause = (values: Array<string | number>, prefix: string) => {
  const params: Record<string, string | number> = {}
  const placeholders = values.map((value, index) => {
    const key = `${prefix}${index}`
    params[key] = value
    return `@${key}`
  })

  return {
    clause: placeholders.join(','),
    params,
  }
}

const querySummaryOrderInnerNosFromFoodOrder = (
  db: any,
  restaurantId: number,
  waiterNo: string | undefined,
  startTime: string,
  endTime: string,
): string[] => {
  const paymentStatusIn = buildNamedInClause([...SUMMARY_ORDER_PAYMENT_STATUSES], 'paymentStatus')
  const params: Record<string, string | number> = {
    restaurantId,
    startTime,
    endTime,
    completedStatus: ORDER_STATUS.COMPLETED,
    ...paymentStatusIn.params,
  }
  let waiterFilter = ''

  if (waiterNo === '0') {
    waiterFilter = 'AND waiter_no IS NULL'
  } else if (waiterNo) {
    waiterFilter = 'AND waiter_no = @waiterNo'
    params.waiterNo = waiterNo
  }

  const rows = db
    .prepare(
      `
      SELECT DISTINCT order_inner_no
      FROM food_order
      WHERE restaurant_id = @restaurantId
        ${waiterFilter}
        AND order_status = @completedStatus
        AND payment_status IN (${paymentStatusIn.clause})
        AND create_time BETWEEN @startTime AND @endTime
    `,
    )
    .all(params) as Array<{ order_inner_no: string }>

  return rows.map((row) => row.order_inner_no).filter(Boolean)
}

const querySummaryWaiterClockOrderInnerNos = (
  db: any,
  restaurantId: number,
  waiterNo: string | undefined,
  startTime: string,
  endTime: string,
): string[] => {
  const baseParams: Record<string, string | number> = {
    restaurantId,
    startTime,
    endTime,
    recordType: RECORD_THE_ORDER_TYPE.POSITIVE_ORDER,
  }

  if (!waiterNo) {
    const rows = db
      .prepare(
        `
        SELECT DISTINCT order_inner_no
        FROM waiter_clock_order
        WHERE restaurant_id = @restaurantId
          AND create_time BETWEEN @startTime AND @endTime
          AND record_the_order_type = @recordType
      `,
      )
      .all(baseParams) as Array<{ order_inner_no: string }>

    return rows.map((row) => row.order_inner_no).filter(Boolean)
  }

  if (waiterNo === '0') {
    const rows = db
      .prepare(
        `
        SELECT DISTINCT order_inner_no
        FROM waiter_clock_order
        WHERE restaurant_id = @restaurantId
          AND create_time BETWEEN @startTime AND @endTime
          AND waiter_type = @waiterType
          AND record_the_order_type = @recordType
      `,
      )
      .all({
        ...baseParams,
        waiterType: WAITER_TYPE.SELF_SERVICE,
      }) as Array<{ order_inner_no: string }>

    return rows.map((row) => row.order_inner_no).filter(Boolean)
  }

  const waiter = db
    .prepare(
      `
      SELECT id
      FROM restaurant_waiter
      WHERE restaurant_id = @restaurantId
        AND waiter_no = @waiterNo
      LIMIT 1
    `,
    )
    .get({
      restaurantId,
      waiterNo,
    }) as { id: number } | undefined

  if (!waiter) {
    return []
  }

  const clockRecords = db
    .prepare(
      `
      SELECT id
      FROM restaurant_waiter_clock_record
      WHERE restaurant_id = @restaurantId
        AND restaurant_waiter_id = @restaurantWaiterId
        AND working_time BETWEEN @startTime AND @endTime
        AND del_status = 1
    `,
    )
    .all({
      restaurantId,
      restaurantWaiterId: waiter.id,
      startTime,
      endTime,
    }) as Array<{ id: number }>

  if (clockRecords.length === 0) {
    return querySummaryOrderInnerNosFromFoodOrder(db, restaurantId, waiterNo, startTime, endTime)
  }

  const clockRecordIds = clockRecords.map((record) => record.id)
  const clockRecordIn = buildNamedInClause(clockRecordIds, 'clockRecordId')
  const rows = db
    .prepare(
      `
      SELECT DISTINCT order_inner_no
      FROM waiter_clock_order
      WHERE restaurant_id = @restaurantId
        AND restaurant_waiter_clock_record_id IN (${clockRecordIn.clause})
        AND create_time BETWEEN @startTime AND @endTime
        AND waiter_type = @waiterType
        AND record_the_order_type = @recordType
    `,
    )
    .all({
      ...baseParams,
      ...clockRecordIn.params,
      waiterType: WAITER_TYPE.REAL_WAITER,
    }) as Array<{ order_inner_no: string }>

  const supplementalRows = db
    .prepare(
      `
      SELECT DISTINCT wco.order_inner_no
      FROM waiter_clock_order wco
      INNER JOIN food_order fo
        ON fo.order_inner_no = wco.order_inner_no
      WHERE wco.restaurant_id = @restaurantId
        AND wco.create_time BETWEEN @startTime AND @endTime
        AND wco.waiter_type = @waiterType
        AND wco.record_the_order_type = @recordType
        AND wco.restaurant_waiter_clock_record_id NOT IN (${clockRecordIn.clause})
        AND fo.restaurant_id = @restaurantId
        AND fo.waiter_no = @waiterNo
        AND fo.create_time BETWEEN @startTime AND @endTime
    `,
    )
    .all({
      ...baseParams,
      ...clockRecordIn.params,
      waiterType: WAITER_TYPE.REAL_WAITER,
      waiterNo,
    }) as Array<{ order_inner_no: string }>

  // 兼容历史同步曾写入服务端 clock id 的 waiter_clock_order，当前 shift 仍按本地 waiter_no 补齐产品汇总。
  return [...new Set([...rows, ...supplementalRows].map((row) => row.order_inner_no).filter(Boolean))]
}

/**
 * 查询产品汇总报告
 * 对应后端 querySummaryReport 方法 (lines 282+)
 *
 * @param req 查询请求参数
 * @returns 产品汇总报告数据
 */
export async function querySummaryReport(req: {
  restaurantId: number
  startTime: Date
  endTime: Date
  categoryNo?: string // 分类编号，"0" 表示只看 Add-ons
  waiterNo?: string
}): Promise<SummaryReportResponse> {
  const db = getDB()

  try {
    // ============= 1. 初始化响应数据 =============
    const resp: SummaryReportResponse = {
      productCount: 0,
      totalAmount: 0,
      discountAmount: 0,
      subAmount: 0,
      promoDiscountAmount: 0,
      couponAmount: 0,
      pwdDiscountAmount: 0,
      scDiscountAmount: 0,
      lessVat: 0,
      productSummaryInfos: [],
    }

    const startTimeStr = formatDateTime(req.startTime)
    const endTimeStr = formatDateTime(req.endTime)

    // Summary of Products 对齐后端 handSummaryOrder：真实服务员按当前 clock record 归属找正向订单。
    const orderInnerNos = querySummaryWaiterClockOrderInnerNos(
      db,
      req.restaurantId,
      req.waiterNo,
      startTimeStr,
      endTimeStr,
    )

    if (orderInnerNos.length === 0) {
      return resp
    }

    // ============= 4. 用 order_inner_no 列表查询 food_order 表 =============
    const orderInnerNoIn = buildNamedInClause(orderInnerNos, 'orderInnerNo')
    const paymentStatusIn = buildNamedInClause([...SUMMARY_ORDER_PAYMENT_STATUSES], 'paymentStatus')
    const orderQuery = `
      SELECT
        id,
        order_inner_no,
        total_amount,
        service_fee,
        order_payment_id
      FROM food_order
      WHERE restaurant_id = @restaurantId
        AND order_inner_no IN (${orderInnerNoIn.clause})
        AND payment_status IN (${paymentStatusIn.clause})
    `

    const orders = db.prepare(orderQuery).all({
      restaurantId: req.restaurantId,
      ...orderInnerNoIn.params,
      ...paymentStatusIn.params,
    }) as Array<{
      id: number
      order_inner_no: string
      total_amount: number
      service_fee: number | null
      order_payment_id: number
    }>

    if (orders.length === 0) {
      return resp
    }

    const orderIds = orders.map((o) => o.id)
    const orderPaymentIds = orders.map((o) => o.order_payment_id).filter((id) => id != null)

    // ============= 3. 查询订单明细 =============
    const orderIdIn = buildNamedInClause(orderIds, 'orderId')
    const detailParams: Record<string, string | number> = {
      ...orderIdIn.params,
      increaseDetailType: 1,
    }
    let detailQuery = `
      SELECT *
      FROM order_detail
      WHERE order_id IN (${orderIdIn.clause})
        AND detail_type = @increaseDetailType
    `

    // 如果指定了分类，需要关联产品查询
    if (req.categoryNo && req.categoryNo !== '0') {
      // 查询分类ID
      const category = db
        .prepare(
          `
          SELECT id
          FROM dish_category
          WHERE restaurant_id = @restaurantId
            AND category_no = @categoryNo
        `,
        )
        .get({
          restaurantId: req.restaurantId,
          categoryNo: req.categoryNo,
        }) as { id: number } | undefined

      if (category) {
        // 查询该分类下的产品SKU
        const skus = db
          .prepare(
            `
          SELECT id
          FROM dish_product_sku
          WHERE product_id IN (
            SELECT id FROM dish_product WHERE category_id = @categoryId
          )
        `,
          )
          .all({ categoryId: category.id }) as Array<{ id: number }>

        const skuIds = skus.map((s) => s.id)
        if (skuIds.length > 0) {
          const skuIdIn = buildNamedInClause(skuIds, 'skuId')
          detailQuery += ` AND sku_id IN (${skuIdIn.clause})`
          Object.assign(detailParams, skuIdIn.params)
        } else {
          return resp
        }
      } else {
        return resp
      }
    }

    const orderDetails = db.prepare(detailQuery).all(detailParams) as Array<{
      id: number
      order_id: number
      sku_id: number
      count: number
      sku_amount: number
      detail_snapshot: string // JSON string containing options
    }>

    if (orderDetails.length === 0) {
      return resp
    }

    // ============= 6. 创建 detailMap（orderId -> orderDetail）============
    const detailMap = new Map<number, (typeof orderDetails)[0]>()
    orderDetails.forEach((detail) => {
      detailMap.set(detail.order_id, detail)
    })

    // ============= 7. 收集有订单明细的订单的 orderPaymentId =============
    // 对应后端：for (FoodOrder foodOrder : orderList) { if (Objects.nonNull(detailMap.get(foodOrder.getId()))) { ... } }
    const orderPaymentIdList: number[] = []
    orders.forEach((order) => {
      if (detailMap.has(order.id)) {
        if (order.order_payment_id != null) {
          orderPaymentIdList.push(order.order_payment_id)
        }
      }
    })

    // ============= 8. 按 SKU 分组统计 =============
    const orderDetailMap = new Map<number, (typeof orderDetails)[0][]>()

    orderDetails.forEach((detail) => {
      const list = orderDetailMap.get(detail.sku_id) || []
      list.push(detail)
      orderDetailMap.set(detail.sku_id, list)
    })

    const skuIds = Array.from(orderDetailMap.keys())
    const skus = db
      .prepare(
        `
        SELECT
          s.id,
          s.sku_no,
          s.spec_permutation,
          s.price,
          p.id as product_id,
          p.product_no,
          p.name as product_name,
          p.category_id,
          c.name as category_name
        FROM dish_product_sku s
        INNER JOIN dish_product p ON s.product_id = p.id
        LEFT JOIN dish_category c ON p.category_id = c.id
        WHERE s.id IN (${skuIds.map(() => '?').join(',')})
      `,
      )
      .all(...skuIds) as Array<{
      id: number
      sku_no: string
      spec_permutation: string
      price: number
      product_id: number
      product_no: string
      product_name: string
      category_id: number
      category_name: string
    }>

    // ============= 6. 查询规格信息 =============
    const specItemIds = skus.map((s) => s.spec_permutation).filter((id) => id != null)
    const specItems = new Map<number, { id: number; name: string }>()
    if (specItemIds.length > 0) {
      const items = db
        .prepare(
          `
          SELECT id, name
          FROM dish_product_spec_item
          WHERE id IN (${specItemIds.map(() => '?').join(',')})
        `,
        )
        .all(...specItemIds) as Array<{ id: number; name: string }>

      items.forEach((item) => {
        specItems.set(item.id, item)
      })
    }

    const skuMap = new Map(skus.map((s) => [s.id, s]))

    // ============= 7. 处理选项（Add-ons）=============
    const optionItemVoMap = new Map<string, Array<{ optionName: string; optionItemName: string; price: number }>>()

    orderDetails.forEach((detail) => {
      try {
        const options = JSON.parse(detail.detail_snapshot) as Array<{
          option_name?: string
          optionName?: string
          name?: string
          option_item_list?: Array<{
            option_item_name?: string
            optionItemName?: string
            name?: string
            price: number
          }>
          optionItemList?: Array<{ option_item_name?: string; optionItemName?: string; name?: string; price: number }>
        }>

        options.forEach((option) => {
          // 兼容后端快照 snake_case 与旧本地数据 camelCase/name 写法。
          const optionName = option.option_name ?? option.optionName ?? option.name ?? ''
          const optionItemList = option.option_item_list ?? option.optionItemList ?? []
          optionItemList.forEach((item) => {
            const optionItemName = item.option_item_name ?? item.optionItemName ?? item.name ?? ''
            const key = optionItemName
            const list = optionItemVoMap.get(key) || []
            list.push({
              optionName,
              optionItemName,
              price: item.price,
            })
            optionItemVoMap.set(key, list)
          })
        })
      } catch (e) {
        // 忽略解析错误
      }
    })

    // ============= 8. 生成产品汇总信息 =============
    const productSummaryInfos: ProductSummaryInfo[] = []

    // 按 SKU 统计
    const skuSummaryMap = new Map<number, { quantity: number; totalAmount: number }>()
    orderDetails.forEach((detail) => {
      const summary = skuSummaryMap.get(detail.sku_id) || {
        quantity: 0,
        totalAmount: 0,
      }
      summary.quantity += detail.count
      summary.totalAmount += detail.count * detail.sku_amount
      skuSummaryMap.set(detail.sku_id, summary)
    })

    skuSummaryMap.forEach((summary, skuId) => {
      const sku = skuMap.get(skuId)
      if (!sku) return

      const specItem = specItems.get(parseInt(sku.spec_permutation))

      productSummaryInfos.push({
        skuNo: sku.sku_no,
        productNo: sku.product_no,
        productName: sku.product_name,
        specItemNo: specItem?.id.toString(),
        specName: specItem?.name || '',
        quantity: summary.quantity,
        price: summary.totalAmount / summary.quantity,
        totalAmount: summary.totalAmount,
        categoryName: sku.category_name || '',
      })
    })

    // 处理 Add-ons
    optionItemVoMap.forEach((items, optionItemName) => {
      const firstItem = items[0]
      productSummaryInfos.push({
        productName: firstItem.optionName,
        specName: optionItemName,
        price: firstItem.price,
        quantity: items.length,
        totalAmount: firstItem.price * items.length,
        categoryName: 'Add-ons',
      })
    })

    // ============= 9. 排序（按数量降序）=============
    productSummaryInfos.sort((a, b) => b.quantity - a.quantity)

    // 如果 categoryNo = "0"，只返回 Add-ons
    if (req.categoryNo === '0') {
      resp.productSummaryInfos = productSummaryInfos.filter((info) => info.categoryName === 'Add-ons')
    } else {
      resp.productSummaryInfos = productSummaryInfos
    }

    // ============= 10. 计算统计金额 =============
    resp.productCount = resp.productSummaryInfos.reduce((sum, info) => sum + info.quantity, 0)
    resp.subAmount = resp.productSummaryInfos.reduce((sum, info) => sum + info.totalAmount, 0)

    // ============= 11. 查询支付信息统计各种折扣 =============
    if (orderPaymentIds.length > 0) {
      const payments = db
        .prepare(
          `
          SELECT
            id,
            real_amount,
            discount_type,
            discount_amount,
            coupon_amount,
            real_service_fee
          FROM order_payment
          WHERE id IN (${orderPaymentIds.map(() => '?').join(',')})
            AND final_payment_status = 1
        `,
        )
        .all(...orderPaymentIds) as Array<{
        id: number
        real_amount: number
        discount_type: number | null
        discount_amount: number | null
        coupon_amount: number | null
        real_service_fee: number | null
      }>

      // 当前班次所有支付都查询税务快照，确保任何支付上记录的 Less VAT 都进入 Discount。
      const paymentIds = payments.map((payment) => payment.id)

      const taxMap = new Map<
        number,
        { pwd_discount: number | null; less_vat: number | null; vat_exemption: number | null }
      >()
      if (paymentIds.length > 0) {
        const taxes = db
          .prepare(
            `
            SELECT order_payment_id, pwd_discount, less_vat, vat_exemption
            FROM order_payment_tax
            WHERE order_payment_id IN (${paymentIds.map(() => '?').join(',')})
          `,
          )
          .all(...paymentIds) as Array<{
          order_payment_id: number
          pwd_discount: number | null
          less_vat: number | null
          vat_exemption: number | null
        }>

        taxes.forEach((tax) => {
          taxMap.set(tax.order_payment_id, tax)
        })
      }

      // 产品报告汇总当前班次全部折扣：PWD、SC、普通/其他折扣、优惠券及 Less VAT。
      payments.forEach((payment) => {
        resp.totalAmount += payment.real_amount || 0
        resp.couponAmount += payment.coupon_amount || 0
        const tax = taxMap.get(payment.id)
        const isPwdScPayment = [
          PWD_SC_ALL_DISCOUNT_TYPE,
          PWD_SC_PEOPLE_DISCOUNT_TYPE,
          SC_ALL_DISCOUNT_TYPE,
          SC_PEOPLE_DISCOUNT_TYPE,
        ].includes(Number(payment.discount_type))
        // 兼容修复前本地 CASH 的 NULL：PWD/SC Less VAT 与 VAT exemption 使用同一金额。
        resp.lessVat += Number(tax?.less_vat ?? (isPwdScPayment ? tax?.vat_exemption : 0) ?? 0)

        if ([PWD_SC_ALL_DISCOUNT_TYPE, PWD_SC_PEOPLE_DISCOUNT_TYPE].includes(Number(payment.discount_type))) {
          resp.pwdDiscountAmount += Number(tax?.pwd_discount ?? payment.discount_amount ?? 0)
        } else if ([SC_ALL_DISCOUNT_TYPE, SC_PEOPLE_DISCOUNT_TYPE].includes(Number(payment.discount_type))) {
          resp.scDiscountAmount += Number(tax?.pwd_discount ?? payment.discount_amount ?? 0)
        } else {
          // 普通折扣及后续新增的非 PWD/SC 折扣类型统一计入其他折扣。
          resp.promoDiscountAmount += Number(payment.discount_amount ?? 0)
        }
      })

      resp.discountAmount =
        resp.pwdDiscountAmount + resp.scDiscountAmount + resp.promoDiscountAmount + resp.couponAmount + resp.lessVat

      const hasServiceFee =
        orders.some((order) => Number(order.service_fee ?? 0) !== 0) ||
        payments.some((payment) => Number(payment.real_service_fee ?? 0) !== 0)
      if (!hasServiceFee) {
        // 无服务费时，产品报告金额必须满足 Sub-total = Discount + Total Amount。
        resp.subAmount = resp.discountAmount + resp.totalAmount
      }
    }

    return resp
  } catch (error) {
    console.error('Failed to query summary report:', error)
    throw error
  }
}

/**
 * 日终报告响应
 * 对应后端 RestaurantEndOfDayReportResp
 */
export interface EndOfDayReportResponse {
  /** 订单号列表 */
  orderNos: string[]
  /** 退款订单号列表 */
  refundOrderNos: string[]

  // ============= 销售相关 =============
  /** 当日销售额 */
  salesOfTheDay: number
  /** 总销售额（销售+退款） */
  grossAmount: number
  /** 净销售额 = 总销售额 - 折扣 - 退款 - VAT调整 */
  netAmount: number
  /** 服务费 */
  serviceFee: number
  /** 服务费税额 */
  serviceFeeTax: number
  /** 总服务费 */
  totalServiceFee: number

  // ============= 累计销售 =============
  /** 当前累计销售额 */
  presentAccumulatedSales: number
  /** 过去累计销售额 */
  pastAccumulatedSales: number

  // ============= 折扣相关 =============
  /** SC折扣 */
  scDiscount: number
  /** PWD折扣 */
  pwdDiscount: number
  /** 其他折扣 */
  otherDiscount: number
  /** 减去折扣 */
  lessDiscount: number
  /** NAAC折扣 */
  naacDiscount: number
  /** Solo Parent折扣 */
  soloParentDiscount: number
  /** 常规折扣交易数 */
  regularDiscountTransactions: number
  /** 零税率交易数 */
  zeroRatedTransactions: number

  // ============= 退款相关 =============
  /** 退款金额 */
  refund: number
  /** 减去退款 */
  lessRefund: number
  /** 退款中的 PWD 折扣 */
  refundPwdDiscount: number
  /** 退款中的 SC 折扣 */
  refundScDiscount: number
  /** 退款中的其他折扣 */
  refundOtherDiscount: number
  /** 正向 SI 起止号 */
  receiptNoStart: string
  receiptNoEnd: string
  /** 退款 SI 起止号 */
  refundReceiptNoStart: string
  refundReceiptNoEnd: string
  /** 取消金额 */
  cancelled: number
  /** 减去取消 */
  lessCancelled: number

  // ============= VAT相关 =============
  /** 应税销售额 */
  salesSubTax: number
  /** 免税销售额 */
  exemptSales: number
  /** 税额 */
  tax: number
  /** 可征税销售额 */
  vatableSales: number
  /** VAT金额 */
  vatAmount: number
  /** VAT免税销售额 */
  vatExemptSales: number
  /** VAT免税额 */
  vatExemption: number
  /** 零税率销售额 */
  zeroRatedSales: number
  /** VAT调整额 */
  lessVatAdjustment: number
  /** 退款上的VAT */
  vatOnRefund: number
  /** 其他VAT调整 */
  otherVatAdjustments: number
  /** PWD交易数（lessVat） */
  pwdTransactions: number
  /** SC交易数（lessVat） */
  scTransactions: number

  // ============= 支付相关 =============
  /** 收款金额 */
  paymentReceived: number
  /** 渠道结算报告 */
  channelSettlementReports: any[]

  // ============= 现金相关 =============
  /** 期初资金 */
  openingFund: number
  /** 现金在手 */
  cashInDrawer: number
  /** 减去提款 */
  lessWithdrawal: number
  /** 短溢款 */
  shortOrOver: number
}

const numberValue = (value: unknown): number => Number(value ?? 0) || 0
const nullableNumber = (value: unknown): number | null =>
  value === undefined || value === null ? null : numberValue(value)

// restaurant_report_print.report_json 需要和线上 End-of-Day 快照字段保持一致，供后台同步下载解析。
function toOnlineEndOfDayReportJson(
  report: Partial<EndOfDayReportResponse> & Record<string, any>,
): Record<string, unknown> {
  const orderNos = Array.isArray(report.orderNos) ? report.orderNos : []
  const refundOrderNos = Array.isArray(report.refundOrderNos) ? report.refundOrderNos : []

  return {
    presentAccumulatedSales: numberValue(report.presentAccumulatedSales),
    pastAccumulatedSales: numberValue(report.pastAccumulatedSales),
    salesOfTheDay: numberValue(report.salesOfTheDay),
    channelSettlementReports: (Array.isArray(report.channelSettlementReports)
      ? report.channelSettlementReports
      : []
    ).map((channel: Record<string, unknown>) => ({
      channelName: channel.channelName ?? null,
      transactionCount: nullableNumber(channel.transactionCount),
      transactionAmount: nullableNumber(channel.transactionAmount),
    })),
    openingFund: nullableNumber(report.openingFund),
    cashInDrawer: nullableNumber(report.cashInDrawer),
    lessWithdrawal: nullableNumber(report.lessWithdrawal),
    paymentReceived: numberValue(report.paymentReceived),
    shortOrOver: nullableNumber(report.shortOrOver),
    vatableSales: numberValue(report.vatableSales),
    vatAmount: numberValue(report.vatAmount),
    vatExemptSales: numberValue(report.vatExemptSales),
    vatExemption: numberValue(report.vatExemption),
    zeroRatedSales: numberValue(report.zeroRatedSales),
    grossAmount: numberValue(report.grossAmount),
    lessDiscount: numberValue(report.lessDiscount),
    lessRefund: numberValue(report.lessRefund),
    // EOD 不统计取消金额，上传/持久化边界统一固定为 0。
    lessCancelled: 0,
    lessVatAdjustment: numberValue(report.lessVatAdjustment),
    netAmount: numberValue(report.netAmount),
    pwdDiscount: numberValue(report.pwdDiscount),
    scDiscount: numberValue(report.scDiscount),
    naacDiscount: numberValue(report.naacDiscount),
    soloParentDiscount: numberValue(report.soloParentDiscount),
    otherDiscount: numberValue(report.otherDiscount),
    cancelled: 0,
    refund: numberValue(report.refund),
    refundPwdDiscount: numberValue(report.refundPwdDiscount),
    refundScDiscount: numberValue(report.refundScDiscount),
    refundOtherDiscount: numberValue(report.refundOtherDiscount),
    receiptNoStart: String(report.receiptNoStart ?? ''),
    receiptNoEnd: String(report.receiptNoEnd ?? ''),
    refundReceiptNoStart: String(report.refundReceiptNoStart ?? ''),
    refundReceiptNoEnd: String(report.refundReceiptNoEnd ?? ''),
    pwdTransactions: numberValue(report.pwdTransactions),
    scTransactions: numberValue(report.scTransactions),
    regularDiscountTransactions: numberValue(report.regularDiscountTransactions),
    zeroRatedTransactions: numberValue(report.zeroRatedTransactions),
    vatOnRefund: numberValue(report.vatOnRefund),
    otherVatAdjustments: numberValue(report.otherVatAdjustments),
    serviceFee: numberValue(report.serviceFee),
    serviceFeeTax: numberValue(report.serviceFeeTax),
    totalServiceFee: numberValue(report.totalServiceFee),
    salesSubTax: numberValue(report.salesSubTax),
    tax: numberValue(report.tax),
    exemptSales: numberValue(report.exemptSales),
    orderNos,
    refundOrderNos,
  }
}

/**
 * 生成日终报告
 * 对应后端 generateCycleReport 方法
 *
 * @param req 查询请求参数
 * @returns 日终报告数据
 */
export async function generateCycleReport(req: {
  startTime: Date
  endTime: Date
  current?: boolean
  persistReportPrint?: boolean
  buildType?: number
  notifyStatus?: number
}): Promise<EndOfDayReportResponse> {
  const db = getDB()
  const { user } = getCurrentSession()
  const restaurantId = user.restaurant_id
  const waiterNo = user.waiter_no

  if (!restaurantId) {
    throw new Error('Current session user restaurant_id is missing.')
  }

  try {
    if (
      req.persistReportPrint &&
      req.buildType !== AUTOMATIC_BUILD_TYPE &&
      !dayjs(req.startTime).isSame(dayjs(req.endTime), 'day')
    ) {
      throw new Error('Only single day data can be printed.')
    }

    // ============= 1. 初始化响应数据 =============
    const resp: EndOfDayReportResponse = {
      orderNos: [],
      refundOrderNos: [],

      salesOfTheDay: 0,
      grossAmount: 0,
      netAmount: 0,
      serviceFee: 0,
      serviceFeeTax: 0,
      totalServiceFee: 0,

      presentAccumulatedSales: 0,
      pastAccumulatedSales: 0,

      scDiscount: 0,
      pwdDiscount: 0,
      otherDiscount: 0,
      lessDiscount: 0,
      naacDiscount: 0,
      soloParentDiscount: 0,
      regularDiscountTransactions: 0,
      zeroRatedTransactions: 0,

      refund: 0,
      lessRefund: 0,
      refundPwdDiscount: 0,
      refundScDiscount: 0,
      refundOtherDiscount: 0,
      receiptNoStart: '',
      receiptNoEnd: '',
      refundReceiptNoStart: '',
      refundReceiptNoEnd: '',
      cancelled: 0,
      lessCancelled: 0,

      salesSubTax: 0,
      exemptSales: 0,
      tax: 0,
      vatableSales: 0,
      vatAmount: 0,
      vatExemptSales: 0,
      vatExemption: 0,
      zeroRatedSales: 0,
      lessVatAdjustment: 0,
      vatOnRefund: 0,
      otherVatAdjustments: 0,
      pwdTransactions: 0,
      scTransactions: 0,

      paymentReceived: 0,
      channelSettlementReports: [],

      openingFund: 0,
      cashInDrawer: 0,
      lessWithdrawal: 0,
      shortOrOver: 0,
    }

    const restaurant = getRestaurantRecord(db, restaurantId)
    const birConfig = getApprovedOperationConfig(db, restaurantId)
    const effectiveRange = resolveEndOfDayReportTimeRange({
      db,
      restaurantId,
      restaurant,
      birConfig,
      startTime: req.startTime,
      endTime: req.endTime,
      current: Boolean(req.current),
      mode: 'query',
    })

    const reportReq = {
      ...req,
      startTime: effectiveRange.startTime,
      endTime: effectiveRange.endTime,
      restaurantId,
      vatRegisterStatus: birConfig?.vat_register_status,
    }

    // ============= 2. 处理销售总额（累计销售额）============
    const previousAccumulatedSales = await handlePresentSales(reportReq, birConfig)

    // ============= 3. 处理订单信息 =============
    const cashAmount = await handleEndOfDayReportOrder(reportReq, resp)

    // ============= 4. 获取打卡津贴信息 =============
    const restaurantAllowance = await calculateRestaurantAllowance(
      db,
      restaurantId,
      waiterNo || '',
      formatDateTime(effectiveRange.startTime),
      formatDateTime(effectiveRange.endTime),
      [], // saleOrders - 不需要
      [], // payments - 不需要
      [], // refundOrders - 不需要
    )

    // ============= 5. 计算各种统计值 =============
    resp.lessDiscount = resp.otherDiscount + resp.pwdDiscount + resp.scDiscount
    // 取消订单不计入 EOD，两个取消金额字段始终保持为 0。
    resp.cancelled = 0
    resp.lessCancelled = 0
    // 后端先将当日销售额归一为 grossAmount，再承接上一份日报的累计余额。
    resp.salesOfTheDay = resp.grossAmount
    resp.presentAccumulatedSales = previousAccumulatedSales + resp.salesOfTheDay
    resp.pastAccumulatedSales = previousAccumulatedSales
    resp.netAmount = resp.grossAmount - resp.lessDiscount - resp.refund - resp.lessVatAdjustment
    resp.openingFund = restaurantAllowance.openingFund
    resp.lessWithdrawal = restaurantAllowance.lessWithdrawal
    resp.cashInDrawer = restaurantAllowance.cashOnHand

    // 短溢款 = 现金在手 - (现金销售 - 非当前周期退款 + 期初资金) + 提款
    const noCurryRefund = 0 // TODO: 需要计算非当前周期的退款
    resp.shortOrOver = resp.cashInDrawer - (cashAmount - noCurryRefund + resp.openingFund) + resp.lessWithdrawal

    if (req.persistReportPrint) {
      saveEndOfDayReportPrint(db, {
        restaurantId,
        waiterNo: waiterNo || null,
        startTime: effectiveRange.startTime,
        endTime: effectiveRange.endTime,
        report: resp,
        buildType: req.buildType ?? MANUAL_BUILD_TYPE,
        notifyStatus: req.notifyStatus ?? PUSHED_STATUS,
      })
      // EOD 生成成功后重置当前餐厅的排队取餐号，下一个排队单重新从 001 开始。
      resetLocalTakeFoodNo(restaurantId, db)
      generateMallCertificationFilesAfterEndOfDay(db, restaurantId, effectiveRange.endTime)
    }

    return resp
  } catch (error) {
    console.error('Failed to generate cycle report:', error)
    throw error
  }
}

function generateMallCertificationFilesAfterEndOfDay(
  db: ReturnType<typeof getDB>,
  restaurantId: number,
  reportEndTime: Date,
): void {
  const settings = readMallCertificationSettings(db, restaurantId)

  if (settings.mall_type !== MALL_TYPE.PARQAL && settings.mall_type !== MALL_TYPE.MEGAWORLD) {
    return
  }

  try {
    const reportDate = dayjs(reportEndTime).format('YYYY-MM-DD')
    // EOD 快照落库后立即生成商场认证文件；失败只记录日志，避免阻断日终报表本身。
    const result =
      settings.mall_type === MALL_TYPE.PARQAL
        ? generateParqalFile(db, restaurantId, settings, reportDate)
        : generateMegaworldFiles(db, restaurantId, settings, reportDate)

    if (result.warnings.length > 0) {
      console.warn('Mall certification file generation completed with warnings after EOD:', result.warnings)
    }
  } catch (error) {
    console.error('Failed to generate mall certification files after EOD report:', error)
  }
}

export function checkEndOfDayReportGenerated(req: { startTime: Date; endTime: Date }): boolean {
  const db = getDB()
  const { user } = getCurrentSession()
  const restaurantId = user.restaurant_id

  if (!restaurantId) {
    throw new Error('Current session user restaurant_id is missing.')
  }

  // EOD 归属日期以 print_end_time 判断当天是否已生成。
  const existing = db
    .prepare(
      `
        SELECT id
        FROM restaurant_report_print
        WHERE restaurant_id = @restaurantId
          AND print_type = @printType
          AND datetime(create_time) BETWEEN datetime(@startTime) AND datetime(@endTime)
        ORDER BY datetime(create_time) DESC, id DESC
        LIMIT 1
      `,
    )
    .get({
      restaurantId,
      printType: END_OF_DAY_REPORT_TYPE,
      startTime: formatDateTime(req.startTime),
      endTime: formatDateTime(req.endTime),
    }) as { id: number } | undefined

  return Boolean(existing)
}

export async function autoGenerateMissingEndOfDayReports(params: { maxDays?: number } = {}): Promise<{
  generatedReports: Array<{ id: number; date: string }>
  skippedDays: number
}> {
  const db = getDB()
  const { user } = getCurrentSession()
  const restaurantId = user.restaurant_id

  if (!restaurantId) {
    throw new Error('Current session user restaurant_id is missing.')
  }

  const restaurant = getRestaurantRecord(db, restaurantId)
  const birConfig = getApprovedOperationConfig(db, restaurantId)
  const latestReportPrint = getLatestEndOfDayReportPrintByEndTime(db, restaurantId)
  const yesterday = dayjs().subtract(1, 'day').startOf('day')

  // 自动补生成周期必须承接上一张 EOD 的业务截止时间，不能使用实际建档时间。
  const baseline = latestReportPrint?.print_end_time
  const fallbackStart =
    birConfig?.audit_status === AUDIT_STATUS.PASS_THE_EXAMINATION && birConfig.audit_time
      ? birConfig.audit_time
      : restaurant?.create_time
  let rollingStartTime = baseline ? dayjs(baseline).add(1, 'second') : dayjs(fallbackStart || new Date())
  let startDay = rollingStartTime.startOf('day')
  const maxDays = Math.max(1, params.maxDays ?? MAX_AUTO_GENERATE_DAYS)
  const windowStartDay = yesterday.subtract(maxDays - 1, 'day')
  let skippedDays = 0

  // 自动补生成只补最近窗口，避免首次启动时历史跨度过大导致长时间阻塞。
  if (startDay.isBefore(windowStartDay)) {
    skippedDays = windowStartDay.diff(startDay, 'day')
    startDay = windowStartDay
    rollingStartTime = windowStartDay
  }

  if (startDay.isAfter(yesterday)) {
    return { generatedReports: [], skippedDays }
  }

  const generatedReports: Array<{ id: number; date: string }> = []

  for (let day = startDay; !day.isAfter(yesterday); day = day.add(1, 'day')) {
    // 自动补生成按目标自然日查询和生成报告，避免跨日数据混入。
    const dayStart = day.startOf('day').toDate()
    const dayEnd = day.endOf('day').toDate()
    const existing = getEndOfDayReportPrintByEndTime(db, restaurantId, dayStart, dayEnd)

    if (existing) {
      rollingStartTime = dayjs(existing.print_end_time).add(1, 'second')
      continue
    }

    // 历史自动日报按单日精确生成，并标记为“未提示”，供进入系统后的弹窗消费。
    if (rollingStartTime.isAfter(day.endOf('day'))) {
      rollingStartTime = day.add(1, 'day').startOf('day')
      continue
    }
    // 自动 EOD 每天一张，起始时间承接上一张 EOD，结束时间固定为目标日末。
    await generateCycleReport({
      startTime: dayStart,
      endTime: dayEnd,
      current: true,
      persistReportPrint: true,
      buildType: AUTOMATIC_BUILD_TYPE,
      notifyStatus: NOT_PUSHED_STATUS,
    })

    const generated = getEndOfDayReportPrintByEndTime(db, restaurantId, dayStart, dayEnd)

    if (generated) {
      generatedReports.push({ id: generated.id, date: formatDate(dayEnd) })
      rollingStartTime = dayjs(generated.print_end_time).add(1, 'second')
    } else {
      rollingStartTime = day.add(1, 'day').startOf('day')
    }
  }

  return { generatedReports, skippedDays }
}

function getLatestEndOfDayReportPrint(
  db: ReturnType<typeof getDB>,
  restaurantId: number,
): RestaurantReportPrintRecord | null {
  return (
    (db
      .prepare(
        `
          SELECT *
          FROM restaurant_report_print
          WHERE restaurant_id = @restaurantId
            AND print_type = @printType
          ORDER BY datetime(create_time) DESC, id DESC
          LIMIT 1
        `,
      )
      .get({
        restaurantId,
        printType: END_OF_DAY_REPORT_TYPE,
      }) as RestaurantReportPrintRecord | undefined) ?? null
  )
}

function getLatestEndOfDayReportPrintByEndTime(
  db: ReturnType<typeof getDB>,
  restaurantId: number,
): RestaurantReportPrintRecord | null {
  return (
    (db
      .prepare(
        `
          SELECT *
          FROM restaurant_report_print
          WHERE restaurant_id = @restaurantId
            AND print_type = @printType
          ORDER BY datetime(print_end_time) DESC, id DESC
          LIMIT 1
        `,
      )
      .get({
        restaurantId,
        printType: END_OF_DAY_REPORT_TYPE,
      }) as RestaurantReportPrintRecord | undefined) ?? null
  )
}

function getEndOfDayReportPrintByEndTime(
  db: ReturnType<typeof getDB>,
  restaurantId: number,
  startTime: Date,
  endTime: Date,
): RestaurantReportPrintRecord | null {
  return (
    (db
      .prepare(
        `
          SELECT *
          FROM restaurant_report_print
          WHERE restaurant_id = @restaurantId
            AND print_type = @printType
            AND datetime(print_end_time) BETWEEN datetime(@startTime) AND datetime(@endTime)
          ORDER BY datetime(create_time) DESC, id DESC
          LIMIT 1
        `,
      )
      .get({
        restaurantId,
        printType: END_OF_DAY_REPORT_TYPE,
        startTime: formatDateTime(startTime),
        endTime: formatDateTime(endTime),
      }) as RestaurantReportPrintRecord | undefined) ?? null
  )
}

function getEndOfDayReportPrintCreatedInRange(
  db: ReturnType<typeof getDB>,
  restaurantId: number,
  startTime: Date,
  endTime: Date,
): RestaurantReportPrintRecord | null {
  return (
    (db
      .prepare(
        `
          SELECT *
          FROM restaurant_report_print
          WHERE restaurant_id = @restaurantId
            AND print_type = @printType
            AND datetime(create_time) BETWEEN datetime(@startTime) AND datetime(@endTime)
          ORDER BY datetime(create_time) DESC, id DESC
          LIMIT 1
        `,
      )
      .get({
        restaurantId,
        printType: END_OF_DAY_REPORT_TYPE,
        startTime: formatDateTime(startTime),
        endTime: formatDateTime(endTime),
      }) as RestaurantReportPrintRecord | undefined) ?? null
  )
}

function resolveEndOfDayReportTimeRange(params: {
  db: ReturnType<typeof getDB>
  restaurantId: number
  restaurant: RestaurantRecord | null
  birConfig: RestaurantOperationConfigRecord | null
  startTime: Date
  endTime: Date
  current?: boolean
  mode?: 'query' | 'print'
}): { startTime: Date; endTime: Date; reportPrint: RestaurantReportPrintRecord | null } {
  const { db, restaurantId, restaurant, birConfig, startTime, endTime, current, mode = 'query' } = params

  if (!dayjs(startTime).isSame(dayjs(endTime), 'day')) {
    return { startTime, endTime, reportPrint: null }
  }

  if (!current) {
    const reportPrint =
      mode === 'query'
        ? getEndOfDayReportPrintByEndTime(db, restaurantId, startTime, endTime)
        : getEndOfDayReportPrintCreatedInRange(db, restaurantId, startTime, endTime)

    if (!reportPrint) {
      throw new Error('No Z-Reading/End of Day Report was generated in this period.')
    }

    return {
      startTime: new Date(reportPrint.print_start_time),
      endTime: new Date(reportPrint.print_end_time),
      reportPrint,
    }
  }

  if (!dayjs(endTime).isSame(dayjs(), 'day')) {
    return { startTime, endTime, reportPrint: null }
  }

  const latestReportPrint = getLatestEndOfDayReportPrint(db, restaurantId)

  if (!latestReportPrint) {
    const shouldUseAuditTime = birConfig?.audit_status === AUDIT_STATUS.PASS_THE_EXAMINATION && birConfig.audit_time
    const fallbackStartTime = shouldUseAuditTime
      ? birConfig.audit_time
      : restaurant?.create_time || formatDateTime(startTime)

    return {
      startTime: new Date(fallbackStartTime),
      endTime: new Date(),
      reportPrint: null,
    }
  }

  if (latestReportPrint.create_time && dayjs(latestReportPrint.create_time).isSame(dayjs(), 'day')) {
    return {
      startTime: new Date(latestReportPrint.print_start_time),
      endTime: new Date(latestReportPrint.print_end_time),
      reportPrint: latestReportPrint,
    }
  }

  const latestCreateTime = latestReportPrint.create_time
    ? dayjs(latestReportPrint.create_time)
    : dayjs(latestReportPrint.print_end_time)
  const shouldStartFromAuditTime =
    birConfig?.audit_status === AUDIT_STATUS.PASS_THE_EXAMINATION &&
    birConfig.audit_time &&
    latestCreateTime.isBefore(dayjs(birConfig.audit_time))

  return {
    startTime: shouldStartFromAuditTime
      ? new Date(birConfig.audit_time as string)
      : latestCreateTime.add(1, 'second').toDate(),
    endTime: new Date(),
    reportPrint: null,
  }
}

export async function previewEndOfDayReport(req: {
  startTime: Date
  endTime: Date
  current?: boolean
}): Promise<string> {
  const db = getDB()
  const { user } = getCurrentSession()
  const restaurantId = user.restaurant_id

  if (!restaurantId) {
    throw new Error('Current session user restaurant_id is missing.')
  }

  const restaurant = getRestaurantRecord(db, restaurantId)
  const birConfig = getApprovedOperationConfig(db, restaurantId)
  const receiptPrintColumns = RECEIPT_COLUMNS_58MM
  const effectiveRange = resolveEndOfDayReportTimeRange({
    db,
    restaurantId,
    restaurant,
    birConfig,
    startTime: req.startTime,
    endTime: req.endTime,
    current: Boolean(req.current),
    mode: 'print',
  })
  const report = await generateCycleReport({
    startTime: req.startTime,
    endTime: req.endTime,
    current: req.current,
  })
  const reportPrint =
    effectiveRange.reportPrint ??
    getEndOfDayReportPrint(db, restaurantId, effectiveRange.startTime, effectiveRange.endTime)
  const receiptText = buildEndOfDayReceiptText({
    report,
    restaurant,
    birConfig,
    reportPrint,
    startTime: effectiveRange.startTime,
    endTime: effectiveRange.endTime,
    printColumns: receiptPrintColumns,
  })

  return renderReceiptTextToImageDataUrl(receiptText, {
    width: 680,
    fontSize: 34,
    lineHeight: 50,
    paddingY: 34,
    forceBoldTotalAmount: false,
  })
}

type CashierReportType = typeof END_OF_SHIFT_REPORT_TYPE | typeof SUMMARY_OF_PRODUCT_REPORT_TYPE

export async function previewCashierReport(req: {
  restaurantId: number
  startTime: Date
  endTime: Date
  waiterNo?: string
  type: CashierReportType
}): Promise<string> {
  const result = await buildCashierReportReceiptText(req)

  return renderReceiptTextToImageDataUrl(result.receiptText, {
    width: 680,
    fontSize: 34,
    lineHeight: 50,
    paddingY: 34,
    forceBoldTotalAmount: false,
  })
}

export async function downloadTicketData(req: { beginTime: Date; endTime: Date }): Promise<{
  data: string[]
  txtName: string
  dataCutOffDate: string
  restaurantNo: string
  newDataFlag: boolean
}> {
  const db = getDB()
  const { user } = getCurrentSession()
  const restaurantId = user.restaurant_id

  if (!restaurantId) {
    throw new Error('Current session user restaurant_id is missing.')
  }

  const restaurant = getRestaurantRecord(db, restaurantId)
  const receiptPrintColumns = RECEIPT_COLUMNS_58MM
  if (!restaurant) {
    return {
      data: [],
      txtName: '',
      dataCutOffDate: formatDate(req.endTime),
      restaurantNo: '',
      newDataFlag: false,
    }
  }

  const daysDifference = dayjs(req.endTime).startOf('day').diff(dayjs(req.beginTime).startOf('day'), 'day')
  if (daysDifference > 30) {
    throw new Error('Please select a date within 31 days')
  }

  const reportPrints = db
    .prepare(
      `
        SELECT *
        FROM restaurant_report_print
        WHERE restaurant_id = @restaurantId
          AND print_type = @printType
          AND datetime(create_time) BETWEEN datetime(@beginTime) AND datetime(@endTime)
        ORDER BY datetime(create_time) DESC, id DESC
      `,
    )
    .all({
      restaurantId,
      printType: END_OF_DAY_REPORT_TYPE,
      beginTime: formatDateTime(req.beginTime),
      endTime: formatDateTime(req.endTime),
    }) as RestaurantReportPrintRecord[]

  const data: string[] = []
  for (const reportPrint of reportPrints) {
    const savedReport = reportPrint.report_json ? (JSON.parse(reportPrint.report_json) as EndOfDayReportResponse) : null
    if (!savedReport) {
      continue
    }

    const report = Array.isArray(savedReport.orderNos)
      ? savedReport
      : await generateCycleReport({
          startTime: new Date(reportPrint.print_start_time),
          endTime: new Date(reportPrint.print_end_time),
        })

    const receiptText = buildEndOfDayReceiptText({
      report,
      restaurant,
      birConfig: getApprovedOperationConfig(db, restaurantId),
      reportPrint,
      startTime: new Date(reportPrint.print_start_time),
      endTime: new Date(reportPrint.print_end_time),
      printColumns: receiptPrintColumns,
    })
    const orderReceiptHex = buildEJournalOrderReceiptHex({
      db,
      restaurantId,
      startTime: new Date(reportPrint.print_start_time),
      endTime: new Date(reportPrint.print_end_time),
    })

    // E-Journal 下载沿用后端 hex 文本格式，前端按 GBK 解码成 txt。
    data.push(
      `${receiptTextToHexString(`${genTimeDividingLine(new Date(reportPrint.print_end_time))}\n${receiptText}\n\n`)}${orderReceiptHex}`,
    )
  }

  const endTime = dayjs(req.endTime)

  return {
    data,
    txtName: `${restaurant.display_name || restaurant.name || 'restaurant'} Ejournal ${endTime.format('YYYY-MM-DD')} at ${endTime.format('HH.mm.ss')}.txt`,
    dataCutOffDate: endTime.format('YYYY-MM-DD'),
    restaurantNo: restaurant.restaurant_no ?? '',
    newDataFlag: data.length > 0,
  }
}

export async function downloadBirReport(req: { beginTime: Date; endTime: Date }): Promise<{
  fileName: string
  filePath: string
}> {
  const db = getDB()
  const { user } = getCurrentSession()
  const restaurantId = user.restaurant_id

  if (!restaurantId) {
    throw new Error('Current session user restaurant_id is missing.')
  }

  const daysDifference = dayjs(req.endTime).startOf('day').diff(dayjs(req.beginTime).startOf('day'), 'day')
  if (daysDifference > 30) {
    throw new Error('Please select a date within 31 days')
  }

  const restaurant = getRestaurantRecord(db, restaurantId)
  const birConfig = getApprovedOperationConfig(db, restaurantId)
  if (!restaurant || !birConfig) {
    throw new Error('bir files cannot be downloaded if they are not opened!')
  }

  // 后端 BIR 下载只允许审核通过后的数据，开始时间早于审核时间时自动截断。
  const auditTime = birConfig.audit_time ? new Date(birConfig.audit_time) : null
  if (auditTime && req.endTime < auditTime) {
    throw new Error(
      'Since you have enabled the BIR feature, you are currently unable to view or generate previous related reports.',
    )
  }
  const beginTime = auditTime && req.beginTime < auditTime ? auditTime : req.beginTime
  const endTime = req.endTime
  const vatRegisterType =
    birConfig.vat_register_status === VAT_REGISTER_ON ? BIR_VAT_REGISTER_TYPE : BIR_NON_VAT_REGISTER_TYPE
  const header = {
    restaurantName: birConfig.taxpayer_name || restaurant.name || '',
    restaurantAddress: birConfig.restaurant_address || '',
    vatRegisterType,
    restaurantTIN: birConfig.tin_number || '',
    birVersion: BIR_REPORT_VERSION,
    printerSerialNumber: birConfig.serial_number || '',
    printerMIN: birConfig.min_number || '',
    // BIR 模板继续兼容服务端已有的历史设备信息，但不再读取本机 POS 绑定。
    printerDeviceNo: String(birConfig.device_no ?? ''),
    downloadTime: formatDateTime(new Date()),
    downloadUser: user.name || user.waiter_no || '',
  }
  const salesSummary = buildBirSalesSummaryRows({ restaurantId, beginTime, endTime, birConfig })
  const pwdRows = buildBirPwdScRows({
    restaurantId,
    beginTime,
    endTime,
    birConfig,
    discountTypes: [PWD_SC_ALL_DISCOUNT_TYPE, PWD_SC_PEOPLE_DISCOUNT_TYPE],
  })
  const scRows = buildBirPwdScRows({
    restaurantId,
    beginTime,
    endTime,
    birConfig,
    discountTypes: [SC_ALL_DISCOUNT_TYPE, SC_PEOPLE_DISCOUNT_TYPE],
  })
  const startDate = dayjs(req.beginTime).format('YYYY-MM-DD')
  const endDate = dayjs(req.endTime).format('YYYY-MM-DD')
  const fileName = `BIR Reports ${startDate}-${endDate}_${Date.now()}${XLSX_EXTENSION}`
  // 先生成到系统临时目录，避免保存弹窗把中间文件误判为目标目录中的同名文件。
  const outputPath = path.join(app.getPath('temp'), fileName)
  const templateName = vatRegisterType === BIR_VAT_REGISTER_TYPE ? BIR_VAT_TEMPLATE : BIR_NON_VAT_TEMPLATE
  const templatePath = resolveBirTemplatePath(templateName)

  fillBirReportWorkbook({
    templatePath,
    outputPath,
    password: `${restaurant.restaurant_no ?? ''}A3B8D2F1`,
    scalar: header,
    sheets: {
      'E-1': salesSummary,
      'E-2': scRows,
      'E-3': pwdRows,
    },
  })

  return { fileName, filePath: outputPath }
}

function resolveBirTemplatePath(templateName: string): string {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'app.asar.unpacked', 'resources', BIR_XLSX_TEMPLATE_DIR, templateName),
    path.join(process.resourcesPath ?? '', 'app.asar', 'resources', BIR_XLSX_TEMPLATE_DIR, templateName),
    path.join(process.resourcesPath ?? '', BIR_XLSX_TEMPLATE_DIR, templateName),
    path.join(process.cwd(), 'resources', BIR_XLSX_TEMPLATE_DIR, templateName),
  ]
  const templatePath = candidates.find((candidate) => candidate && fs.existsSync(candidate))
  if (!templatePath) {
    throw new Error(`BIR report template not found: ${templateName}`)
  }
  return templatePath
}

function formatAmount(value: number | null | undefined): string {
  return (Number(value ?? 0) / 100).toFixed(2)
}

function roundMinor(value: number): number {
  return Math.round(value)
}

function stripDiscountNo(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\[/g, '')
    .replace(/\]/g, '')
    .replace(/"/g, '')
}

function parseReportJson(reportPrint: RestaurantReportPrintRecord): EndOfDayReportResponse {
  if (!reportPrint.report_json) {
    throw new Error('End of day report not generate.')
  }
  return JSON.parse(reportPrint.report_json) as EndOfDayReportResponse
}

function buildBirSalesSummaryRows(params: {
  restaurantId: number
  beginTime: Date
  endTime: Date
  birConfig: RestaurantOperationConfigRecord
}): Array<Record<string, unknown>> {
  const db = getDB()
  const rawReportPrints = db
    .prepare(
      `
        SELECT *
        FROM restaurant_report_print
        WHERE restaurant_id = @restaurantId
          AND print_type = @printType
          AND datetime(create_time) BETWEEN datetime(@beginTime) AND datetime(@endTime)
        ORDER BY datetime(create_time) ASC,
                 datetime(update_time) DESC,
                 datetime(create_time) DESC,
                 id DESC
      `,
    )
    .all({
      restaurantId: params.restaurantId,
      printType: END_OF_DAY_REPORT_TYPE,
      beginTime: formatDateTime(params.beginTime),
      endTime: formatDateTime(params.endTime),
    }) as RestaurantReportPrintRecord[]
  const reportPrints = dedupeEndOfDayReportPrintsByPeriod(rawReportPrints)

  if (!reportPrints.length) {
    return []
  }

  // E-1 金额全部读取已生成的 Z-Reading 快照，避免下载时重新计算导致历史数据漂移。
  return reportPrints.map((reportPrint) => {
    const savedReport = parseReportJson(reportPrint)
    const report: EndOfDayReportResponse = {
      ...savedReport,
      refundPwdDiscount: numberValue(savedReport.refundPwdDiscount),
      refundScDiscount: numberValue(savedReport.refundScDiscount),
      refundOtherDiscount: numberValue(savedReport.refundOtherDiscount),
      receiptNoStart: String(savedReport.receiptNoStart ?? ''),
      receiptNoEnd: String(savedReport.receiptNoEnd ?? ''),
      refundReceiptNoStart: String(savedReport.refundReceiptNoStart ?? ''),
      refundReceiptNoEnd: String(savedReport.refundReceiptNoEnd ?? ''),
    }
    const periodStart = new Date(reportPrint.print_start_time)
    const periodEnd = new Date(reportPrint.print_end_time)
    const cutoffDate = dayjs('2026-07-05 00:00:00')
    const useSnapshotReceipt = dayjs(reportPrint.create_time).isAfter(cutoffDate)
    const receiptNos = useSnapshotReceipt
      ? [report.receiptNoStart, report.receiptNoEnd]
      : getSystemReceiptNosByTransactionTime(db, params.restaurantId, periodStart, periodEnd)
    const [beginReceiptNo, endReceiptNo] = normalizeBirReceiptRange(receiptNos[0], receiptNos[receiptNos.length - 1])
    const manualReceiptNo = getManualOrderReceiptNosByPeriod(db, params.restaurantId, periodStart, periodEnd)

    return {
      date: dayjs(reportPrint.create_time).format('DD/MM/YYYY'),
      // BIR xlsx 与日终小票共用 EOD 快照里的 receipt_no 列表，保证 BEG/END SI# 含义和结果一致。
      beginNo: beginReceiptNo,
      endNo: endReceiptNo,
      grandAccumSalesEndingBalance: formatAmount(report.presentAccumulatedSales),
      grandAccumBegBalance: formatAmount(report.pastAccumulatedSales),
      salesIssued: manualReceiptNo || '-',
      grossSalesForTheDay: formatAmount(report.salesOfTheDay),
      vatAbleSales: formatAmount(report.vatableSales),
      vatAmount: formatAmount(report.vatAmount),
      vatExemptSales: formatAmount(report.vatExemptSales),
      zeroRatedSales: formatAmount(report.zeroRatedSales),
      scDiscount: formatAmount(report.scDiscount),
      pwdDiscount: formatAmount(report.pwdDiscount),
      naacDiscount: formatAmount(report.naacDiscount),
      soloParentDiscount: formatAmount(report.soloParentDiscount),
      othersDiscount: formatAmount(report.naacDiscount + report.soloParentDiscount + report.otherDiscount),
      returns: formatAmount(report.refund),
      voids: formatAmount(report.cancelled),
      totalDeductions: formatAmount(
        report.pwdDiscount + report.naacDiscount + report.soloParentDiscount + report.refund + report.scDiscount,
      ),
      adjScDiscount: formatAmount(report.refundScDiscount),
      adjPwdDiscount: formatAmount(report.refundPwdDiscount),
      adjOtherDiscount: formatAmount(report.refundOtherDiscount),
      adjReturn: formatAmount(report.vatOnRefund),
      adjOther: formatAmount(report.lessVatAdjustment),
      adjTotalVat: formatAmount(
        report.refundPwdDiscount +
          report.refundScDiscount +
          report.refundOtherDiscount +
          report.lessVatAdjustment +
          report.vatOnRefund,
      ),
      vatPayable: formatAmount(report.vatAmount),
      netSales: formatAmount(report.netAmount),
      totalIncome: formatAmount(report.netAmount - report.vatAmount),
      serviceFee: formatAmount(report.totalServiceFee),
      resetCounter: '0.00',
      zcounter: reportPrint.receipt_id,
      salesSubject: formatAmount(report.salesSubTax),
      percentageTax: formatAmount(report.tax),
      exemptSales: formatAmount(report.exemptSales),
    }
  })
}

// 后端仅在起止号同时为空或同时全 0 时，把整组范围显示为短横线。
function normalizeBirReceiptRange(
  beginValue: string | null | undefined,
  endValue: string | null | undefined,
): [string, string] {
  const begin = String(beginValue ?? '').trim()
  const end = String(endValue ?? '').trim()
  const emptyRange = (!begin && !end) || (/^0+$/.test(begin) && /^0+$/.test(end))
  return emptyRange ? ['-', '-'] : [begin, end]
}

function getSystemReceiptNosByTransactionTime(
  db: ReturnType<typeof getDB>,
  restaurantId: number,
  startTime: Date,
  endTime: Date,
): string[] {
  const rows = db
    .prepare(
      `
        SELECT op.receipt_no
        FROM order_payment op
        JOIN food_order fo
          ON fo.restaurant_id = op.restaurant_id
         AND fo.order_inner_no = op.order_inner_no
         AND fo.order_type = 1
        WHERE op.restaurant_id = @restaurantId
          AND COALESCE(fo.order_app, 0) <> @manualOrderApp
          AND op.final_payment_status = 1
          AND op.transaction_status IN (@successStatus, @refundStatus)
          AND datetime(op.transaction_return_time) BETWEEN datetime(@startTime) AND datetime(@endTime)
          AND op.receipt_no IS NOT NULL
          AND op.receipt_no <> ''
      `,
    )
    .all({
      restaurantId,
      manualOrderApp: ORDER_APP_MANUAL_ORDER,
      successStatus: PAYMENT_STATUS.PAY_SUCCESS,
      refundStatus: PAYMENT_STATUS.REFUNDED,
      startTime: formatDateTime(startTime),
      endTime: formatDateTime(endTime),
    }) as Array<{ receipt_no: string | null }>
  return normalizeSerialNoList(rows.map((row) => row.receipt_no))
}

function getManualOrderReceiptNosByPeriod(
  db: ReturnType<typeof getDB>,
  restaurantId: number,
  startTime: Date,
  endTime: Date,
): string {
  const rows = db
    .prepare(
      `
        SELECT op.receipt_no
        FROM order_payment op
        JOIN food_order fo
          ON fo.restaurant_id = op.restaurant_id
         AND fo.order_inner_no = op.order_inner_no
         AND fo.order_type = 1
        WHERE op.restaurant_id = @restaurantId
          AND fo.order_app = @manualOrderApp
          AND op.final_payment_status = 1
          AND op.transaction_status IN (@successStatus, @refundStatus)
          AND datetime(op.transaction_return_time) BETWEEN datetime(@startTime) AND datetime(@endTime)
          AND op.receipt_no IS NOT NULL
          AND op.receipt_no <> ''
        ORDER BY datetime(op.transaction_return_time) ASC, op.id ASC
      `,
    )
    .all({
      restaurantId,
      manualOrderApp: ORDER_APP_MANUAL_ORDER,
      successStatus: PAYMENT_STATUS.PAY_SUCCESS,
      refundStatus: PAYMENT_STATUS.REFUNDED,
      startTime: formatDateTime(startTime),
      endTime: formatDateTime(endTime),
    }) as Array<{ receipt_no: string | null }>
  return [...new Set(rows.map((row) => row.receipt_no).filter(Boolean))].join(',')
}

function dedupeEndOfDayReportPrintsByPeriod(
  reportPrints: RestaurantReportPrintRecord[],
): RestaurantReportPrintRecord[] {
  const reportByPeriod = new Map<string, RestaurantReportPrintRecord>()

  for (const reportPrint of reportPrints) {
    const periodKey = `${reportPrint.print_start_time}|${reportPrint.print_end_time}`
    if (!reportByPeriod.has(periodKey)) {
      // 同一日终周期可能因历史同步/补生成留下重复记录，BIR 只保留最新一条，避免 E-1 重复行。
      reportByPeriod.set(periodKey, reportPrint)
    }
  }

  return [...reportByPeriod.values()].sort((a, b) => {
    const endDiff = new Date(a.print_end_time).getTime() - new Date(b.print_end_time).getTime()
    if (endDiff !== 0) return endDiff
    return Number(a.id ?? 0) - Number(b.id ?? 0)
  })
}

function buildBirPwdScRows(params: {
  restaurantId: number
  beginTime: Date
  endTime: Date
  birConfig: RestaurantOperationConfigRecord
  discountTypes: number[]
}): Array<Record<string, unknown>> {
  const db = getDB()
  // 最新后端直接按支付完成时间查询 PWD/SC 最终成功支付。
  const payments = db
    .prepare(
      `
        SELECT op.*
        FROM order_payment op
        WHERE op.restaurant_id = ?
          AND op.final_payment_status = 1
          AND op.transaction_status = ?
          AND op.discount_type IN (${params.discountTypes.map(() => '?').join(',')})
          AND datetime(op.transaction_return_time) BETWEEN datetime(?) AND datetime(?)
          AND EXISTS (
            SELECT 1
            FROM food_order fo
            WHERE fo.restaurant_id = op.restaurant_id
              AND fo.order_inner_no = op.order_inner_no
              AND fo.order_type = 1
          )
        ORDER BY datetime(op.transaction_return_time) ASC, op.id ASC
      `,
    )
    .all(
      params.restaurantId,
      PAYMENT_STATUS.PAY_SUCCESS,
      ...params.discountTypes,
      formatDateTime(params.beginTime),
      formatDateTime(params.endTime),
    ) as OrderPaymentRecord[]
  if (!payments.length) return []

  const orderInnerNos = [...new Set(payments.map((payment) => payment.order_inner_no))]
  const successOrders = db
    .prepare(
      `
        SELECT *
        FROM food_order
        WHERE restaurant_id = ?
          AND order_inner_no IN (${orderInnerNos.map(() => '?').join(',')})
      `,
    )
    .all(params.restaurantId, ...orderInnerNos) as FoodOrderRecord[]

  const paymentIds = payments.map((payment) => payment.id)
  const taxes = db
    .prepare(
      `
        SELECT *
        FROM order_payment_tax
        WHERE order_payment_id IN (${paymentIds.map(() => '?').join(',')})
      `,
    )
    .all(...paymentIds) as OrderPaymentTaxRecord[]
  const taxMap = new Map(taxes.map((tax) => [tax.order_payment_id, tax]))
  const orderMap = new Map<string, FoodOrderRecord[]>()
  for (const order of successOrders) {
    orderMap.set(order.order_inner_no, [...(orderMap.get(order.order_inner_no) ?? []), order])
  }

  return payments.map((payment) => {
    const paymentTax = taxMap.get(payment.id)
    const orders = orderMap.get(payment.order_inner_no) ?? []
    const sales = orders.reduce(
      (sum, order) => sum + Number(order.total_amount ?? 0) - Number(order.service_fee ?? 0),
      0,
    )

    return {
      date: payment.transaction_return_time ? formatDateTime(new Date(payment.transaction_return_time)) : '',
      PWDName: payment.discounter_name ?? '',
      PWDNo: stripDiscountNo(payment.discount_no),
      PWDTin: params.birConfig.tin_number ?? '',
      SIORNumber: payment.receipt_no ?? '',
      sales: formatAmount(sales),
      VATAmount: formatAmount(paymentTax?.tax_amount ?? 0),
      VATExemptSales: formatAmount(paymentTax?.vat_exempt_sales ?? 0),
      discount: formatAmount(paymentTax?.pwd_discount ?? 0),
      netSales: formatAmount(payment.real_amount ?? 0),
    }
  })
}

function buildEJournalOrderReceiptHex(params: {
  db: ReturnType<typeof getDB>
  restaurantId: number
  startTime: Date
  endTime: Date
}): string {
  const startTime = formatDateTime(params.startTime)
  const endTime = formatDateTime(params.endTime)
  const paymentOrders = params.db
    .prepare(
      `
        SELECT order_inner_no
        FROM food_order
        WHERE restaurant_id = @restaurantId
          AND order_type = @orderType
          AND order_status = @completedStatus
          AND datetime(complete_time) BETWEEN datetime(@startTime) AND datetime(@endTime)
        ORDER BY datetime(complete_time) DESC, id DESC
      `,
    )
    .all({
      restaurantId: params.restaurantId,
      orderType: ORDER_TYPE.MASTER,
      completedStatus: ORDER_STATUS.COMPLETED,
      startTime,
      endTime,
    }) as Array<{ order_inner_no: string }>
  const refundOrders = params.db
    .prepare(
      `
        SELECT order_inner_no
        FROM food_order
        WHERE restaurant_id = @restaurantId
          AND order_type = @orderType
          AND payment_status = @refundedStatus
          AND datetime(refund_time) BETWEEN datetime(@startTime) AND datetime(@endTime)
        ORDER BY datetime(refund_time) DESC, id DESC
      `,
    )
    .all({
      restaurantId: params.restaurantId,
      orderType: ORDER_TYPE.MASTER,
      refundedStatus: PAYMENT_STATUS.REFUNDED,
      startTime,
      endTime,
    }) as Array<{ order_inner_no: string }>
  const receiptTexts: string[] = []

  for (const order of paymentOrders) {
    try {
      receiptTexts.push(
        buildOrderReceiptTextForEJournal({
          order_inner_no: order.order_inner_no,
          receipt_type: PAYMENT_RECEIPT_TYPE,
          print_source: 'auto',
        }),
      )
    } catch (error) {
      console.error('Failed to build E-Journal payment receipt:', error)
    }
  }

  for (const order of refundOrders) {
    try {
      receiptTexts.push(
        buildOrderReceiptTextForEJournal({
          order_inner_no: order.order_inner_no,
          receipt_type: REFUND_RECEIPT_TYPE,
          print_source: 'auto',
        }),
      )
    } catch (error) {
      console.error('Failed to build E-Journal refund receipt:', error)
    }
  }

  return receiptTexts.map((text) => receiptTextToHexString(`${text}\n\n`)).join('')
}

async function buildCashierReportReceiptText(req: {
  restaurantId: number
  startTime: Date
  endTime: Date
  waiterNo?: string
  type: CashierReportType
}): Promise<{
  receiptText: string
  reportPrint: RestaurantReportPrintRecord
  messagePrefix: string
}> {
  const db = getDB()
  const restaurant = getRestaurantRecord(db, req.restaurantId)
  const birConfig = getApprovedOperationConfig(db, req.restaurantId)
  const receiptPrintColumns = RECEIPT_COLUMNS_58MM

  if (req.type === END_OF_SHIFT_REPORT_TYPE) {
    if (!req.waiterNo) {
      throw new Error('Waiter number is required')
    }

    const waiterName = getWaiterNameByNo(db, req.restaurantId, req.waiterNo)
    const report = await queryWaiterSettlementReport({
      restaurantId: req.restaurantId,
      startTime: req.startTime,
      endTime: req.endTime,
      waiterNo: req.waiterNo,
      cashierName: waiterName || (req.waiterNo === '0' ? 'Self-service' : req.waiterNo),
      restaurantName: restaurant?.display_name || restaurant?.name || '',
      vatRegisterStatus: birConfig?.vat_register_status === VAT_REGISTER_ON,
      tinNumber: birConfig?.tin_number ?? '',
      minNumber: birConfig?.min_number ?? '',
      serialNumber: birConfig?.serial_number ?? '',
      companyName: 'Swifood Innovation Inc.',
      companyAddress:
        'Unit 9D, 9th Floor The Valero Tower, 122 Valero Street Salcedo Village, Bel-Air, City of Makati, NCR, Fourth District, Philippines',
      companyTin: '625-748-670-00000',
      birInfo: birConfig
        ? {
            accNumber: '',
            ptuIssueDate: birConfig.ptu_issue_date ?? '',
            ptuValidUntil: '',
            ptuNumber: birConfig.ptu_number ?? '',
          }
        : undefined,
    })
    const reportPrint = getOrCreateReportPrint({
      db,
      restaurantId: req.restaurantId,
      waiterNo: req.waiterNo,
      startTime: req.startTime,
      endTime: req.endTime,
      printType: END_OF_SHIFT_REPORT_TYPE,
      report,
    })

    // End-of-Shift 三种输出共用同一份小票文本，避免打印与预览排版不一致。
    return {
      receiptText: generateShiftReport(
        toShiftPrintData({ report, reportPrint, birConfig }),
        receiptPrintColumns,
        RECEIPT_COLUMNS_80MM,
      ),
      reportPrint,
      messagePrefix: 'X',
    }
  }

  const report = await querySummaryReport({
    restaurantId: req.restaurantId,
    startTime: req.startTime,
    endTime: req.endTime,
    waiterNo: req.waiterNo,
  })
  const reportPrint = getOrCreateReportPrint({
    db,
    restaurantId: req.restaurantId,
    waiterNo: req.waiterNo ?? null,
    startTime: req.startTime,
    endTime: req.endTime,
    printType: SUMMARY_OF_PRODUCT_REPORT_TYPE,
    report,
  })

  return {
    receiptText: generateProductSummary(
      toProductSummaryPrintData({
        report,
        restaurant,
        birConfig,
        reportPrint,
        startTime: req.startTime,
        endTime: req.endTime,
        cashierName: req.waiterNo ? getWaiterNameByNo(db, req.restaurantId, req.waiterNo) || req.waiterNo : 'All',
      }),
      receiptPrintColumns,
      RECEIPT_COLUMNS_80MM,
    ),
    reportPrint,
    messagePrefix: 'P',
  }
}

function getOrCreateReportPrint(params: {
  db: ReturnType<typeof getDB>
  restaurantId: number
  waiterNo?: string | null
  startTime: Date
  endTime: Date
  printType: number
  report: unknown
}): RestaurantReportPrintRecord {
  const { db, restaurantId, waiterNo = null, startTime, endTime, printType, report } = params
  const printStartTime = formatDateTime(startTime)
  const printEndTime = formatDateTime(endTime)
  const reportJson = JSON.stringify(report)
  const safeReportJson = reportJson.length < MAX_REPORT_JSON_LENGTH ? reportJson : null
  const now = formatDateTime(new Date())
  const waiterCondition = waiterNo ? 'AND waiter_no = @waiterNo' : 'AND waiter_no IS NULL'

  const existing = db
    .prepare(
      `
        SELECT *
        FROM restaurant_report_print
        WHERE restaurant_id = @restaurantId
          AND print_type = @printType
          AND print_start_time = @printStartTime
          AND print_end_time = @printEndTime
          ${waiterCondition}
        ORDER BY datetime(create_time) DESC, id DESC
        LIMIT 1
      `,
    )
    .get({
      restaurantId,
      printType,
      printStartTime,
      printEndTime,
      waiterNo,
    }) as RestaurantReportPrintRecord | undefined

  if (existing) {
    db.prepare(
      `
        UPDATE restaurant_report_print
        SET report_json = @reportJson,
            update_time = @updateTime,
            sync_status = @syncStatus
        WHERE id = @id
      `,
    ).run({
      id: existing.id,
      reportJson: safeReportJson,
      updateTime: now,
      syncStatus: UNSYNCED_STATUS,
    })

    return {
      ...existing,
      report_json: safeReportJson,
      update_time: now,
      sync_status: UNSYNCED_STATUS,
    }
  }

  const insertResult = db
    .prepare(
      `
        INSERT INTO restaurant_report_print (
          restaurant_id,
          waiter_no,
          print_start_time,
          print_end_time,
          print_type,
          receipt_id,
          print_count,
          create_time,
          update_time,
          report_json,
          build_type,
          push_status,
          sync_status
        ) VALUES (
          @restaurantId,
          @waiterNo,
          @printStartTime,
          @printEndTime,
          @printType,
          '',
          0,
          @createTime,
          @updateTime,
          @reportJson,
          @buildType,
          @pushStatus,
          @syncStatus
        )
      `,
    )
    .run({
      restaurantId,
      waiterNo,
      printStartTime,
      printEndTime,
      printType,
      createTime: now,
      updateTime: now,
      reportJson: safeReportJson,
      buildType: MANUAL_BUILD_TYPE,
      pushStatus: PUSHED_STATUS,
      syncStatus: UNSYNCED_STATUS,
    })
  const id = Number(insertResult.lastInsertRowid)
  const receiptId = String(id).padStart(20, '0')

  db.prepare(
    `
      UPDATE restaurant_report_print
      SET receipt_id = @receiptId
      WHERE id = @id
    `,
  ).run({ id, receiptId })

  return db
    .prepare(
      `
        SELECT *
        FROM restaurant_report_print
        WHERE id = @id
      `,
    )
    .get({ id }) as RestaurantReportPrintRecord
}

function getReportReprintCount(printCount: number | null | undefined): number {
  // 预览不会消耗次数，已达到上限时仍只展示最后一个合法重打序号。
  return Math.min(MAX_RECEIPT_REPRINT_COUNT, Math.max(0, Number(printCount ?? 0)))
}

function getRestaurantRecord(db: ReturnType<typeof getDB>, restaurantId: number): RestaurantRecord | null {
  return (
    (db
      .prepare(
        `
          SELECT *
          FROM restaurant
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(restaurantId) as RestaurantRecord | undefined) ?? null
  )
}

function getApprovedOperationConfig(
  db: ReturnType<typeof getDB>,
  restaurantId: number,
): RestaurantOperationConfigRecord | null {
  return (
    (db
      .prepare(
        `
          SELECT *
          FROM restaurant_operation_config
          WHERE restaurant_id = @restaurantId
            AND audit_status = @auditStatus
          ORDER BY update_time DESC, id DESC
          LIMIT 1
        `,
      )
      .get({
        restaurantId,
        auditStatus: AUDIT_STATUS_PASS,
      }) as RestaurantOperationConfigRecord | undefined) ?? null
  )
}

function getEndOfDayReportPrint(
  db: ReturnType<typeof getDB>,
  restaurantId: number,
  startTime: Date,
  endTime: Date,
): RestaurantReportPrintRecord | null {
  return (
    (db
      .prepare(
        `
          SELECT *
          FROM restaurant_report_print
          WHERE restaurant_id = @restaurantId
            AND print_type = @printType
            AND print_start_time = @printStartTime
            AND print_end_time = @printEndTime
          ORDER BY create_time DESC
          LIMIT 1
        `,
      )
      .get({
        restaurantId,
        printType: END_OF_DAY_REPORT_TYPE,
        printStartTime: formatDateTime(startTime),
        printEndTime: formatDateTime(endTime),
      }) as RestaurantReportPrintRecord | undefined) ?? null
  )
}

function receiptTextToHexString(receiptText: string): string {
  return iconv.encode(receiptText, 'gbk').toString('hex')
}

function genTimeDividingLine(date: Date): string {
  return `\n***** DATE: ${dayjs(date).format('MMM DD,YYYY')} *****\n`
}

function buildEndOfDayReceiptText(params: {
  report: EndOfDayReportResponse
  restaurant: RestaurantRecord | null
  birConfig: RestaurantOperationConfigRecord | null
  reportPrint: RestaurantReportPrintRecord | null
  startTime: Date
  endTime: Date
  printColumns?: number
}): string {
  const receiptColumns = params.printColumns ?? RECEIPT_CONTENT_COLUMNS

  return generateEndOfDayReport(toEndOfDayPrintData(params), receiptColumns, RECEIPT_COLUMNS_80MM)
}

function getWaiterNameByNo(db: ReturnType<typeof getDB>, restaurantId: number, waiterNo: string): string | null {
  if (waiterNo === '0') {
    return 'Self-service'
  }

  const waiter = db
    .prepare(
      `
        SELECT name
        FROM restaurant_waiter
        WHERE restaurant_id = @restaurantId
          AND waiter_no = @waiterNo
        LIMIT 1
      `,
    )
    .get({ restaurantId, waiterNo }) as { name: string | null } | undefined

  return waiter?.name ?? null
}

function toShiftPrintData(params: {
  report: WaiterSettlementReportData
  reportPrint: RestaurantReportPrintRecord
  birConfig: RestaurantOperationConfigRecord | null
}): ShiftReportData {
  const { report, reportPrint, birConfig } = params
  const paymentSummaries = (report.channelSettlementReports ?? [])
    .filter((item: any) => String(item.channelName ?? item.channel_name ?? '').toUpperCase() !== 'TOTAL')
    .map((item: any) => ({
      // End of Shift 打印的 PAYMENT RECEIVED 明细与 Cashier Report 支付类型表格保持同一口径。
      paymentMethod: String(item.channelName ?? item.channel_name ?? 'UNKNOWN'),
      amount: Number(item.transactionAmount ?? item.transaction_amount ?? 0),
    }))

  return {
    reportDate: report.reportDate,
    reportTime: report.reportTime,
    reprintCount: getReportReprintCount(reportPrint.print_count),
    reprintTime: formatDateTime(new Date()),
    restaurantName: report.restaurantName,
    tradeName: birConfig?.trade_name ?? '',
    taxpayerName: birConfig?.taxpayer_name ?? '',
    posName: report.posName || String(reportPrint.device_no ?? ''),
    restaurantAddress: '',
    chinese: report.chinese,
    vatRegisterStatus: report.vatRegisterStatus,
    tinNumber: report.tinNumber,
    minNumber: report.minNumber,
    serialNumber: report.serialNumber,
    reportNumber: reportPrint.receipt_id,
    printTime: reportPrint.create_time ?? report.printTime,
    startTime: report.startTime,
    endTime: report.endTime,
    cashierName: report.cashierName,
    begSiNumber: report.orderNos[0] ?? '',
    endSiNumber: report.orderNos[report.orderNos.length - 1] ?? '',
    begRefundNumber: report.refundOrderNos[0] ?? '',
    endRefundNumber: report.refundOrderNos[report.refundOrderNos.length - 1] ?? '',
    openingFund: report.openingFund,
    // 班次小票与页面 Transaction Summary 使用同一渠道名称，避免误显示 payment_platform（如 PayCools）。
    paymentSummaries,
    totalPayments: report.paymentReceived,
    cancelledAmount: report.cancelledAmount,
    refundAmount: report.refundAmount,
    withdrawalAmount: report.lessWithdrawal,
    cashOnHand: report.cashOnHand,
    shortOverAmount: report.shortOrOver,
    companyName: report.companyName,
    companyAddress: report.companyAddress,
    companyTin: report.companyTin,
    birInfo: report.birInfo,
  }
}

function toProductSummaryPrintData(params: {
  report: SummaryReportResponse
  restaurant: RestaurantRecord | null
  birConfig: RestaurantOperationConfigRecord | null
  reportPrint: RestaurantReportPrintRecord
  startTime: Date
  endTime: Date
  cashierName: string
}): ProductSummaryData {
  const { report, restaurant, birConfig, reportPrint, startTime, endTime, cashierName } = params

  return {
    restaurantName: restaurant?.display_name || restaurant?.name || '',
    tradeName: birConfig?.trade_name ?? '',
    taxpayerName: birConfig?.taxpayer_name ?? '',
    reprintCount: getReportReprintCount(reportPrint.print_count),
    reprintTime: formatDateTime(new Date()),
    posName: String(reportPrint.device_no ?? ''),
    chinese: false,
    vatRegisterStatus: birConfig?.vat_register_status === VAT_REGISTER_ON,
    tinNumber: birConfig?.tin_number ?? '',
    minNumber: birConfig?.min_number ?? '',
    serialNumber: birConfig?.serial_number ?? '',
    reportNumber: reportPrint.receipt_id,
    printTime: reportPrint.create_time ?? formatDateTime(new Date()),
    startTime: formatDateTime(startTime),
    endTime: formatDateTime(endTime),
    cashierName,
    productList: report.productSummaryInfos.map((item) => ({
      itemName: item.specName ? `${item.productName} (${item.specName})` : item.productName,
      quantity: item.quantity,
      price: item.price,
      totalAmount: item.totalAmount,
    })),
    totalQty: report.productCount,
    subTotal: report.subAmount,
    promoDiscount: report.promoDiscountAmount,
    vouchersDiscount: report.couponAmount,
    pwdDiscount: report.pwdDiscountAmount,
    scDiscount: report.scDiscountAmount,
    lessVat: report.lessVat,
    totalAmount: report.totalAmount,
    companyName: 'Swifood Innovation Inc.',
    companyAddress:
      'Unit 9D, 9th Floor The Valero Tower, 122 Valero Street Salcedo Village, Bel-Air, City of Makati, NCR, Fourth District, Philippines',
    companyTin: '625-748-670-00000',
    birInfo: birConfig
      ? {
          accNumber: '',
          ptuIssueDate: birConfig.ptu_issue_date ?? '',
          ptuValidUntil: '',
          ptuNumber: birConfig.ptu_number ?? '',
        }
      : undefined,
  }
}

function toEndOfDayPrintData(params: {
  report: EndOfDayReportResponse
  restaurant: RestaurantRecord | null
  birConfig: RestaurantOperationConfigRecord | null
  reportPrint: RestaurantReportPrintRecord | null
  startTime: Date
  endTime: Date
}): EndOfDayReportData {
  const { report, restaurant, birConfig, reportPrint, startTime, endTime } = params
  const now = new Date()
  const db = getDB()
  const storedOrderNos = report.orderNos ?? []
  const storedRefundOrderNos = report.refundOrderNos ?? []
  // report_json 保存 order_inner_no；打印 SI/退款范围时再转换为对应的小票流水号。
  const resolvedOrderNos = getSystemReceiptNosByOrderInnerNos(db, storedOrderNos)
  const resolvedRefundOrderNos = getRefundSerialNosByOrderInnerNos(db, storedRefundOrderNos)
  // 转换失败时保持为空，不能把 TB 开头的内部订单号显示成 SI/退款流水号。
  const orderNos = resolvedOrderNos
  const refundOrderNos = resolvedRefundOrderNos

  return {
    reportDate: formatDate(startTime),
    reportTime: formatTime(now),
    reprintCount: getReportReprintCount(reportPrint?.print_count),
    reprintTime: formatDateTime(now),
    restaurantName: restaurant?.display_name || restaurant?.name || '',
    tradeName: birConfig?.trade_name ?? '',
    taxpayerName: birConfig?.taxpayer_name ?? '',
    posName: String(reportPrint?.device_no ?? ''),
    restaurantAddress: birConfig?.restaurant_address ?? '',
    chinese: false,
    vatRegisterStatus: birConfig?.vat_register_status === VAT_REGISTER_ON,
    tinNumber: birConfig?.tin_number ?? '',
    minNumber: birConfig?.min_number ?? '',
    serialNumber: birConfig?.serial_number ?? '',
    zCount: reportPrint?.receipt_id ?? '',
    resetCounterNo: '0',
    printTime: reportPrint?.create_time ?? formatDateTime(now),
    startTime: formatDateTime(startTime),
    endTime: formatDateTime(endTime),
    begSiNumber: orderNos[0] ?? '',
    endSiNumber: orderNos[orderNos.length - 1] ?? '',
    begCancelledNumber: '',
    endCancelledNumber: '',
    begRefundNumber: refundOrderNos[0] ?? '',
    endRefundNumber: refundOrderNos[refundOrderNos.length - 1] ?? '',
    openingFund: report.openingFund,
    paymentSummaries: (report.channelSettlementReports ?? [])
      .filter((item: any) => String(item.channelName ?? item.channel_name ?? '').toUpperCase() !== 'TOTAL')
      .map((item: any) => ({
        paymentMethod: String(item.channelName ?? item.channel_name ?? 'UNKNOWN'),
        amount: Number(item.transactionAmount ?? item.transaction_amount ?? 0),
      })),
    totalPayments: report.paymentReceived,
    cancelledAmount: 0,
    refundAmount: report.refund,
    withdrawalAmount: report.lessWithdrawal,
    presentAccumulatedSales: report.presentAccumulatedSales,
    previousAccumulatedSales: report.pastAccumulatedSales,
    salesOfTheDay: report.salesOfTheDay,
    vatableSales: report.vatableSales || report.salesSubTax,
    vatAmount: report.vatAmount || report.tax,
    // EOD 小票的 VAT EXEMPT SALES 对应后端 VAT_EXEMPT_SALES，不能回退到 Exempt Sales。
    vatExemptSales: report.vatExemptSales ?? 0,
    zeroRatedSales: report.zeroRatedSales,
    salesSubTax: report.salesSubTax,
    percentageTax: report.tax,
    exemptSales: report.exemptSales,
    grossAmount: report.grossAmount,
    lessDiscount: report.lessDiscount,
    lessRefund: report.lessRefund || report.refund,
    lessCancelled: 0,
    lessVatAdjustment: report.lessVatAdjustment,
    netAmount: report.netAmount,
    serviceChargeAmount: report.serviceFee,
    // 服务费不参与计税，补打小票的 Service Charge Tax 始终为 0。
    serviceChargeTax: 0,
    totalServiceCharge: report.totalServiceFee,
    pwdDiscount: report.pwdDiscount,
    scDiscount: report.scDiscount,
    naacDiscount: report.naacDiscount,
    soloParentDiscount: report.soloParentDiscount,
    otherDiscount: report.otherDiscount,
    pwdTransCount: report.pwdTransactions,
    scTransCount: report.scTransactions,
    regularDiscTransCount: report.regularDiscountTransactions,
    zeroRatedTransCount: report.zeroRatedTransactions,
    vatOnRefund: report.vatOnRefund,
    otherVatAdjustments: report.otherVatAdjustments,
    companyName: 'Swifood Innovation Inc.',
    companyAddress:
      'Unit 9D, 9th Floor The Valero Tower, 122 Valero Street Salcedo Village, Bel-Air, City of Makati, NCR, Fourth District, Philippines',
    companyTin: '625-748-670-00000',
    birInfo: birConfig
      ? {
          accNumber: '',
          ptuIssueDate: birConfig.ptu_issue_date ?? '',
          ptuValidUntil: '',
          ptuNumber: birConfig.ptu_number ?? '',
        }
      : undefined,
  }
}

function saveEndOfDayReportPrint(
  db: ReturnType<typeof getDB>,
  params: {
    restaurantId: number
    waiterNo: string | null
    startTime: Date
    endTime: Date
    report: EndOfDayReportResponse
    buildType?: number
    notifyStatus?: number
  },
): void {
  const now = formatDateTime(new Date())
  const printStartTime = formatDateTime(params.startTime)
  const printEndTime = formatDateTime(params.endTime)
  const reportJson =
    normalizeEndOfDayReportOrderNosText(
      db,
      params.restaurantId,
      JSON.stringify(toOnlineEndOfDayReportJson(params.report)),
    ) ?? ''
  const safeReportJson = reportJson.length < MAX_REPORT_JSON_LENGTH ? reportJson : null

  // 日报快照写入与餐厅级 receipt id 取号必须在同一事务中完成，避免号码重复或空耗。
  const saveReportPrintTx = db.transaction(() => {
    const existing = db
      .prepare(
        `
          SELECT id
          FROM restaurant_report_print
          WHERE restaurant_id = @restaurantId
            AND print_type = @printType
            AND print_start_time = @printStartTime
            AND print_end_time = @printEndTime
          ORDER BY create_time DESC
          LIMIT 1
        `,
      )
      .get({
        restaurantId: params.restaurantId,
        printType: END_OF_DAY_REPORT_TYPE,
        printStartTime,
        printEndTime,
      }) as { id: number } | undefined

    if (existing) {
      db.prepare(
        `
          UPDATE restaurant_report_print
          SET waiter_no = @waiterNo,
              report_json = @reportJson,
              update_time = @updateTime,
              build_type = @buildType,
              push_status = @pushStatus,
              sync_status = @syncStatus
          WHERE id = @id
        `,
      ).run({
        id: existing.id,
        waiterNo: params.waiterNo,
        reportJson: safeReportJson,
        updateTime: now,
        buildType: params.buildType ?? MANUAL_BUILD_TYPE,
        pushStatus: params.notifyStatus ?? PUSHED_STATUS,
        syncStatus: UNSYNCED_STATUS,
      })
      return
    }

    const receiptId = nextLocalReceiptId(params.restaurantId, db)

    db.prepare(
      `
        INSERT INTO restaurant_report_print (
          restaurant_id,
          waiter_no,
          print_start_time,
          print_end_time,
          print_type,
          receipt_id,
          print_count,
          create_time,
          update_time,
          report_json,
          build_type,
          push_status,
          sync_status
        ) VALUES (
          @restaurantId,
          @waiterNo,
          @printStartTime,
          @printEndTime,
          @printType,
          @receiptId,
          0,
          @createTime,
          @updateTime,
          @reportJson,
          @buildType,
          @pushStatus,
          @syncStatus
        )
      `,
    ).run({
      restaurantId: params.restaurantId,
      waiterNo: params.waiterNo,
      printStartTime,
      printEndTime,
      printType: END_OF_DAY_REPORT_TYPE,
      receiptId,
      createTime: printEndTime,
      updateTime: now,
      reportJson: safeReportJson,
      buildType: params.buildType ?? MANUAL_BUILD_TYPE,
      pushStatus: params.notifyStatus ?? PUSHED_STATUS,
      syncStatus: UNSYNCED_STATUS,
    })
  })

  saveReportPrintTx.immediate()
}

/**
 * 处理销售总额（累计销售额）
 * 对应后端 handlePresentSales 方法
 */
async function handlePresentSales(
  req: { restaurantId: number; startTime: Date; endTime: Date },
  operationConfig: RestaurantOperationConfigRecord | null,
): Promise<number> {
  const db = getDB()
  const hasApprovedOperationConfig =
    operationConfig?.audit_status === AUDIT_STATUS.PASS_THE_EXAMINATION && Boolean(operationConfig.audit_time)

  // 最新后端不再回扫历史订单，而是直接承接当前周期之前最后一份有效 EOD 快照。
  const previousReport = db
    .prepare(
      `
        SELECT report_json, print_start_time
        FROM restaurant_report_print
        WHERE restaurant_id = @restaurantId
          AND print_type = @printType
          AND datetime(print_end_time) < datetime(@startTime)
          AND report_json IS NOT NULL
          ${hasApprovedOperationConfig ? 'AND datetime(print_start_time) >= datetime(@auditTime)' : ''}
        ORDER BY datetime(print_end_time) DESC, id DESC
        LIMIT 1
      `,
    )
    .get({
      restaurantId: req.restaurantId,
      printType: END_OF_DAY_REPORT_TYPE,
      startTime: formatDateTime(req.startTime),
      ...(hasApprovedOperationConfig
        ? { auditTime: formatDateTime(new Date(operationConfig.audit_time as string)) }
        : {}),
    }) as { report_json: string; print_start_time: string } | undefined

  if (!previousReport?.report_json) return 0

  try {
    const report = JSON.parse(previousReport.report_json) as Partial<EndOfDayReportResponse>
    return Number(report.presentAccumulatedSales ?? 0) || 0
  } catch (error) {
    console.error('Failed to parse previous end-of-day report snapshot:', error)
    return 0
  }
}

/**
 * 处理日终报告订单
 * 对应后端 handleEndOfDayReportOrder 方法
 */
async function handleEndOfDayReportOrder(
  req: { restaurantId: number; startTime: Date; endTime: Date; vatRegisterStatus?: number | null },
  resp: EndOfDayReportResponse,
): Promise<number> {
  const db = getDB()

  let cashAmount = 0

  // 最新后端以支付完成时间划分销售/退款周期，避免订单完成时间与支付回调时间不一致。
  const payments = db
    .prepare(
      `
        SELECT op.*
        FROM order_payment op
        WHERE op.restaurant_id = @restaurantId
          AND op.final_payment_status = 1
          AND op.transaction_status IN (@successStatus, @refundStatus)
          AND datetime(op.transaction_return_time) BETWEEN datetime(@startTime) AND datetime(@endTime)
          AND EXISTS (
            SELECT 1
            FROM food_order master_order
            WHERE master_order.restaurant_id = op.restaurant_id
              AND master_order.order_inner_no = op.order_inner_no
              AND master_order.order_type = 1
          )
        ORDER BY datetime(op.transaction_return_time) ASC, op.id ASC
      `,
    )
    .all({
      restaurantId: req.restaurantId,
      successStatus: PAYMENT_STATUS.PAY_SUCCESS,
      refundStatus: PAYMENT_STATUS.REFUNDED,
      startTime: formatDateTime(req.startTime),
      endTime: formatDateTime(req.endTime),
    }) as OrderPaymentRecord[]

  const orderInnerNos = [...new Set(payments.map((payment) => payment.order_inner_no).filter(Boolean))]
  if (orderInnerNos.length === 0) {
    resp.grossAmount = 0
    return cashAmount
  }

  const orders = db
    .prepare(
      `
      SELECT *
      FROM food_order
      WHERE restaurant_id = ?
        AND order_inner_no IN (${orderInnerNos.map(() => '?').join(',')})
    `,
    )
    .all(req.restaurantId, ...orderInnerNos) as Array<{
    id: number
    order_inner_no: string
    order_serial_number: string | null
    total_amount: number
    service_fee: number
    package_fee: number
    payment_status: number
    complete_time: string
    refund_time: string
  }>

  const successPayments = payments.filter((payment) => payment.transaction_status === PAYMENT_STATUS.PAY_SUCCESS)
  const refundPayments = payments.filter((payment) => payment.transaction_status === PAYMENT_STATUS.REFUNDED)
  const successNos = new Set(successPayments.map((payment) => payment.order_inner_no))
  const refundNos = new Set(refundPayments.map((payment) => payment.order_inner_no))
  const successOrderList = orders.filter((order) => successNos.has(order.order_inner_no))
  const refundOrderList = orders.filter((order) => refundNos.has(order.order_inner_no))

  // ============= 4. 处理成功订单 =============
  if (successOrderList.length > 0) {
    // 与后端 RestaurantEndOfDayReportResp 一致，快照中的 orderNos 保存 order_inner_no。
    resp.orderNos = [...new Set(successOrderList.map((order) => order.order_inner_no).filter(Boolean))]

    // 移除已退款的订单
    const refundInnerNos = new Set(refundOrderList.map((o) => o.order_inner_no))
    const filteredSuccessOrders = successOrderList.filter((o) => !refundInnerNos.has(o.order_inner_no))

    if (filteredSuccessOrders.length > 0) {
      cashAmount = await handleEndOfDayReportSuccessOrder(
        filteredSuccessOrders,
        resp,
        req.vatRegisterStatus,
        successPayments,
      )
    }
  }

  // ============= 5. 处理退款订单 =============
  if (refundOrderList.length > 0) {
    // refundOrderNos 与 orderNos 使用相同的内部订单号语义。
    resp.refundOrderNos = [...new Set(refundOrderList.map((order) => order.order_inner_no).filter(Boolean))]
    await handleEndOfDayReportRefundOrder(refundPayments, resp)
  }

  // ============= 6. 计算总销售额 =============
  // 退款金额已剔除退款服务费，因此 Gross Amount 始终只包含销售额。
  resp.grossAmount = resp.salesOfTheDay + resp.refund

  return cashAmount
}

// 查询 EOD SI 范围使用的系统 receipt_no，手工录单只参与金额，不参与 SI 起止号。

// 根据 report_json 中的 order_inner_no 还原 EOD 小票展示所需的 SI 流水号。
function getSystemReceiptNosByOrderInnerNos(db: ReturnType<typeof getDB>, orderInnerNos: string[]): string[] {
  const normalizedOrderInnerNos = [...new Set(orderInnerNos.filter(Boolean))]
  if (normalizedOrderInnerNos.length === 0) {
    return []
  }

  const receiptRows = db
    .prepare(
      `
      SELECT op.receipt_no
      FROM order_payment op
      JOIN food_order fo
        ON fo.restaurant_id = op.restaurant_id
       AND fo.order_inner_no = op.order_inner_no
       AND fo.order_type = 1
      WHERE op.order_inner_no IN (${normalizedOrderInnerNos.map(() => '?').join(',')})
        AND COALESCE(fo.order_app, 0) <> ?
        AND op.final_payment_status = 1
        AND op.transaction_status = ?
        AND op.receipt_no IS NOT NULL
        AND op.receipt_no <> ''
    `,
    )
    .all(...normalizedOrderInnerNos, ORDER_APP_MANUAL_ORDER, PAYMENT_STATUS.PAY_SUCCESS) as Array<{
    receipt_no: string | null
  }>

  return normalizeSerialNoList(receiptRows.map((row) => row.receipt_no))
}

/**
 * 处理成功订单
 * 对应后端 handleEndOfDayReportSuccessOrder 方法
 */
async function handleEndOfDayReportSuccessOrder(
  successOrderList: Array<{
    order_inner_no: string
    total_amount: number
    service_fee: number
  }>,
  resp: EndOfDayReportResponse,
  vatRegisterStatus?: number | null,
  successPaymentList: OrderPaymentRecord[] = [],
): Promise<number> {
  const db = getDB()

  // ============= 1. 计算当日销售额 =============
  // 后端最新版将 surcharge 加回销售额，服务费仍在 Service Charge 板块单独列示。
  const surcharge = successPaymentList.reduce((sum, payment) => sum + Number(payment.surcharge ?? 0), 0)
  resp.salesOfTheDay = surcharge + successOrderList.reduce((sum, o) => sum + (o.total_amount - (o.service_fee || 0)), 0)

  // ============= 2. 计算服务费 =============
  // 仅服务费税额为 0，服务费金额与总服务费正常汇总实际订单服务费。
  resp.serviceFee = successOrderList.reduce((sum, o) => sum + (o.service_fee || 0), 0)
  resp.serviceFeeTax = 0
  resp.totalServiceFee = resp.serviceFee

  const receiptNos = normalizeSerialNoList(successPaymentList.map((payment) => payment.receipt_no))
  resp.receiptNoStart = receiptNos[0] ?? ''
  resp.receiptNoEnd = receiptNos[receiptNos.length - 1] ?? ''

  // ============= 4. 处理未注册VAT信息 =============
  await handleEndOfDayVatNotRegister(successPaymentList, successOrderList, resp, vatRegisterStatus)

  // ============= 5. 处理现金支付 =============
  const cashPayments = successPaymentList.filter((p) => p.pay_product_type === 0 && p.channel_code === 'CASH')
  const cashAmount = cashPayments.reduce((sum, p) => sum + p.real_amount, 0)

  // ============= 6. 处理折扣信息 =============
  const pwdDiscountIds: number[] = []
  const scDiscountIds: number[] = []
  const successPaymentIds = await handleEndOfDayDiscount(successPaymentList, resp, pwdDiscountIds, scDiscountIds)

  // ============= 7. 查询VAT信息 =============
  await handleEndOfDayTaxInfo(successPaymentIds, pwdDiscountIds, scDiscountIds, resp)

  // ============= 8. 查询渠道信息 =============
  const channelSettlementReportList = getChannelReport(successPaymentList, getPaymentChannelNameMap(db))
  resp.paymentReceived = successPaymentList.reduce((sum, p) => sum + p.real_amount, 0)

  // 添加一行汇总
  if (channelSettlementReportList.length > 0) {
    let totalAmount = 0
    let totalCount = 0
    channelSettlementReportList.forEach((channel) => {
      totalAmount += channel.transactionAmount
      totalCount += channel.transactionCount
    })
    channelSettlementReportList.push({
      channelName: 'TOTAL',
      channelCode: 'TOTAL',
      transactionCount: totalCount,
      transactionAmount: totalAmount,
    })
  }
  resp.channelSettlementReports = channelSettlementReportList

  return cashAmount
}

/**
 * 处理退款订单
 * 对应后端 handleEndOfDayReportRefundOrder 方法
 */
async function handleEndOfDayReportRefundOrder(
  refundPaymentList: OrderPaymentRecord[],
  resp: EndOfDayReportResponse,
): Promise<void> {
  const db = getDB()

  // ============= 2. 查询退款VAT信息 =============
  const refundPaymentIds = refundPaymentList.map((p) => p.id)
  if (refundPaymentIds.length === 0) return

  const refundPaymentTaxList = db
    .prepare(
      `
      SELECT order_payment_id, tax_amount, vat_exemption, pwd_discount
      FROM order_payment_tax
      WHERE order_payment_id IN (${refundPaymentIds.map(() => '?').join(',')})
    `,
    )
    .all(...refundPaymentIds) as Array<{
    order_payment_id: number
    tax_amount: number
    vat_exemption: number
    pwd_discount: number
  }>

  resp.vatOnRefund = refundPaymentTaxList.reduce((sum, t) => sum + (t.tax_amount || 0), 0)
  resp.otherVatAdjustments = refundPaymentTaxList.reduce((sum, t) => sum + (t.vat_exemption || 0), 0)
  const refundTaxMap = new Map(refundPaymentTaxList.map((tax) => [tax.order_payment_id, tax]))
  for (const payment of refundPaymentList) {
    const tax = refundTaxMap.get(payment.id)
    if ([PWD_SC_ALL_DISCOUNT_TYPE, PWD_SC_PEOPLE_DISCOUNT_TYPE].includes(Number(payment.discount_type))) {
      resp.refundPwdDiscount += Number(tax?.pwd_discount ?? 0)
    } else if ([SC_ALL_DISCOUNT_TYPE, SC_PEOPLE_DISCOUNT_TYPE].includes(Number(payment.discount_type))) {
      resp.refundScDiscount += Number(tax?.pwd_discount ?? 0)
    } else {
      resp.refundOtherDiscount += Number(payment.discount_amount ?? 0) + Number(payment.coupon_amount ?? 0)
    }
  }

  // 最新后端直接按退款支付记录汇总 surcharge + amount - real_service_fee。
  resp.refund = refundPaymentList.reduce(
    (sum, payment) =>
      sum + Number(payment.surcharge ?? 0) + Number(payment.amount ?? 0) - Number(payment.real_service_fee ?? 0),
    0,
  )
  resp.lessRefund = resp.refund
  const refundReceiptNos = normalizeSerialNoList(refundPaymentList.map((payment) => payment.refund_serial_no))
  resp.refundReceiptNoStart = refundReceiptNos[0] ?? ''
  resp.refundReceiptNoEnd = refundReceiptNos[refundReceiptNos.length - 1] ?? ''
}

/**
 * 处理未注册VAT信息
 * 对应后端 handleEndOfDayVatNotRegister 方法
 */
async function handleEndOfDayVatNotRegister(
  successPaymentList: Array<{
    order_inner_no: string
    discount_type: number
    real_amount: number
    surcharge?: number
  }>,
  successOrderList: Array<{
    order_inner_no: string
    total_amount: number
    service_fee?: number
    package_fee?: number
  }>,
  resp: EndOfDayReportResponse,
  vatRegisterStatus?: number | null,
): Promise<void> {
  // 创建订单映射
  const orderMap = new Map(successOrderList.map((o) => [o.order_inner_no, o]))

  let salesSubTax = 0
  let exemptSales = 0
  let tax = 0

  // 遍历支付记录
  for (const payment of successPaymentList) {
    const order = orderMap.get(payment.order_inner_no)
    if (!order) continue

    // 计算小计（扣除服务费、包装费、配送费）
    const subTotal = order.total_amount - (order.service_fee || 0) - (order.package_fee || 0) - 0 // delivery_fee 暂未实现

    if (vatRegisterStatus === VAT_REGISTER_OFF) {
      const isPwdScDiscount = [
        PWD_SC_ALL_DISCOUNT_TYPE,
        PWD_SC_PEOPLE_DISCOUNT_TYPE,
        SC_ALL_DISCOUNT_TYPE,
        SC_PEOPLE_DISCOUNT_TYPE,
      ].includes(Number(payment.discount_type))

      if (isPwdScDiscount) {
        // NON-VAT 的 PWD/SC 免税额取折后最终实付，且不再计算 3% 税。
        exemptSales += Number(payment.real_amount ?? 0)
      } else {
        // 普通/普通折扣/优惠券仍按商品原价 SubTotal 计算 3% 税。
        salesSubTax += subTotal
        tax += roundMinor(subTotal * 0.03)
      }
      continue
    }

    // VAT 注册商户保留原有日报快照计算，不改变 vat_register_status=1 的历史逻辑。
    if ([2, 3, 4, 5].includes(Number(payment.discount_type))) {
      exemptSales += subTotal * 0.8
      tax += subTotal * 0.03
    } else {
      salesSubTax += subTotal
      tax += subTotal * 0.03
    }
  }

  resp.salesSubTax = salesSubTax
  resp.exemptSales = exemptSales
  resp.tax = tax
}

/**
 * 处理日终折扣
 * 对应后端 handleEndOfDayDiscount 方法
 */
async function handleEndOfDayDiscount(
  successPaymentList: Array<{
    id: number
    amount: number
    real_amount: number
    discount_type: number
    coupon_amount: number
  }>,
  resp: EndOfDayReportResponse,
  pwdDiscountIds: number[],
  scDiscountIds: number[],
): Promise<number[]> {
  const successPaymentIds: number[] = []

  let scDiscount = 0
  let pwdDiscount = 0
  let promoDiscount = 0

  for (const orderPayment of successPaymentList) {
    successPaymentIds.push(orderPayment.id)

    // SC折扣
    scDiscount = getScDiscount(scDiscountIds, scDiscount, orderPayment)

    // PWD折扣
    pwdDiscount = getPwdDiscount(pwdDiscountIds, pwdDiscount, orderPayment)

    // 普通折扣只进入 Other Discount，避免与 PWD 整单折扣的类型 1 混淆。
    if (orderPayment.discount_type === CUSTOM_DISCOUNT_TYPE) {
      promoDiscount += orderPayment.amount - orderPayment.real_amount
    }

    // 优惠券折扣
    if (orderPayment.coupon_amount && orderPayment.coupon_amount !== 0) {
      promoDiscount += orderPayment.amount - orderPayment.real_amount
    }
  }

  resp.scDiscount = scDiscount
  resp.pwdDiscount = pwdDiscount
  resp.otherDiscount = promoDiscount

  return successPaymentIds
}

/**
 * 获取PWD折扣
 * 对应后端 getPwdDiscount 方法
 */
function getPwdDiscount(
  pwdDiscountIds: number[],
  pwdDiscount: number,
  orderPayment: {
    id: number
    discount_type: number
    surcharge?: number
    amount: number
    real_amount: number
  },
): number {
  // PWD 整单/按人数折扣分别对应类型 1、3。
  if (
    orderPayment.discount_type === PWD_SC_ALL_DISCOUNT_TYPE ||
    orderPayment.discount_type === PWD_SC_PEOPLE_DISCOUNT_TYPE
  ) {
    // PWD_SC_ALL 或 PWD_SC_PEOPLE
    pwdDiscountIds.push(orderPayment.id)
    if (orderPayment.surcharge && orderPayment.surcharge !== 0) {
      pwdDiscount += orderPayment.surcharge + (orderPayment.amount - orderPayment.real_amount)
    } else {
      pwdDiscount += orderPayment.amount - orderPayment.real_amount
    }
  }
  return pwdDiscount
}

/**
 * 获取SC折扣
 * 对应后端 getScDiscount 方法
 */
function getScDiscount(
  scDiscountIds: number[],
  scDiscount: number,
  orderPayment: {
    id: number
    discount_type: number
    surcharge?: number
    amount: number
    real_amount: number
  },
): number {
  // SC 整单/按人数折扣分别对应类型 4、5。
  if (orderPayment.discount_type === SC_ALL_DISCOUNT_TYPE || orderPayment.discount_type === SC_PEOPLE_DISCOUNT_TYPE) {
    // SC_ALL 或 SC_PEOPLE
    scDiscountIds.push(orderPayment.id)
    if (orderPayment.surcharge && orderPayment.surcharge !== 0) {
      scDiscount += orderPayment.surcharge + (orderPayment.amount - orderPayment.real_amount)
    } else {
      scDiscount += orderPayment.amount - orderPayment.real_amount
    }
  }
  return scDiscount
}

/**
 * 处理日终税务信息
 * 对应后端 handleEndOfDayTaxInfo 方法
 */
async function handleEndOfDayTaxInfo(
  successPaymentIds: number[],
  pwdDiscountIds: number[],
  scDiscountIds: number[],
  resp: EndOfDayReportResponse,
): Promise<void> {
  const db = getDB()

  const successPaymentTaxList = db
    .prepare(
      `
      SELECT order_payment_id, vatable_sales, tax_amount, vat_exempt_sales, vat_exemption, zero_rated_sales, less_vat
      FROM order_payment_tax
      WHERE order_payment_id IN (${successPaymentIds.map(() => '?').join(',')})
    `,
    )
    .all(...successPaymentIds) as Array<{
    order_payment_id: number
    vatable_sales: number
    tax_amount: number
    vat_exempt_sales: number
    vat_exemption: number
    zero_rated_sales: number
    less_vat: number
  }>

  let vatableSales = 0
  let taxAmount = 0
  let vatExemptSales = 0
  let vatExemption = 0
  let zeroRatedSales = 0
  let lessVat = 0
  let scLessVat = 0

  if (successPaymentTaxList.length > 0) {
    for (const tax of successPaymentTaxList) {
      vatableSales += tax.vatable_sales || 0
      taxAmount += tax.tax_amount || 0
      vatExemptSales += tax.vat_exempt_sales || 0
      vatExemption += tax.vat_exemption || 0
      zeroRatedSales += tax.zero_rated_sales || 0

      if (pwdDiscountIds.includes(tax.order_payment_id)) {
        lessVat += tax.less_vat || 0
      }
      if (scDiscountIds.includes(tax.order_payment_id)) {
        scLessVat += tax.less_vat || 0
      }
    }
  }

  resp.vatableSales = vatableSales
  resp.vatAmount = taxAmount
  resp.vatExemptSales = vatExemptSales
  resp.vatExemption = vatExemption
  resp.zeroRatedSales = zeroRatedSales
  resp.pwdDiscount = resp.pwdDiscount - lessVat
  resp.scDiscount = resp.scDiscount - scLessVat
  resp.lessVatAdjustment = lessVat + scLessVat
  resp.pwdTransactions = lessVat
  resp.scTransactions = scLessVat
}

/**
 * 查询渠道报告
 */
function getChannelReport(
  payments: Array<{ channel_code: string; real_amount: number }>,
  paymentChannelNameMap: Map<string, string>,
): any[] {
  const channelMap = new Map<string, { channelName: string; transactionCount: number; transactionAmount: number }>()

  payments.forEach((p) => {
    const channelCode = p.channel_code || 'UNKNOWN'
    const data = channelMap.get(channelCode) || {
      channelName: paymentChannelNameMap.get(channelCode) ?? channelCode,
      transactionCount: 0,
      transactionAmount: 0,
    }
    data.transactionCount += 1
    data.transactionAmount += p.real_amount
    channelMap.set(channelCode, data)
  })

  return Array.from(channelMap.entries()).map(([channelCode, data]) => ({
    channelName: data.channelName,
    channelCode,
    transactionCount: data.transactionCount,
    transactionAmount: data.transactionAmount,
  }))
}

/**
 * 查询参数接口
 */
export interface WaiterSettlementReportParams {
  /** 餐厅ID */
  restaurantId: number
  /** 开始时间 */
  startTime: Date
  /** 结束时间 */
  endTime: Date
  /** 服务员编号 */
  waiterNo: string
  /** 是否为收银报表（用于时间调整判断） */
  isCashierReport?: boolean
  /** 餐厅名称 */
  restaurantName: string
  /** 是否中文 */
  chinese?: boolean
  /** VAT 注册状态 */
  vatRegisterStatus?: boolean
  /** TIN 号码 */
  tinNumber?: string
  /** MIN 号码 */
  minNumber?: string
  /** SERIAL 号码 */
  serialNumber?: string
  /** 报表编号 */
  reportNumber?: string
  /** 收银员名称 */
  cashierName?: string
  /** 公司名称 */
  companyName?: string
  /** 公司地址 */
  companyAddress?: string
  /** 公司 TIN */
  companyTin?: string
  /** BIR 信息 */
  birInfo?: {
    accNumber?: string
    ptuIssueDate?: string
    ptuValidUntil?: string
    ptuNumber?: string
  }
}

// ============= 辅助函数 =============

/**
 * 验证时间范围
 * @throws Error 如果时间范围超过31天
 */
function validateTimeRange(startTime: Date, endTime: Date): void {
  const daysDiff = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24))
  if (daysDiff > 31) {
    throw new Error('REPORT_DATA_TOO_LARGE: Time range cannot exceed 31 days')
  }
}

// 支付渠道汇总需要展示渠道名称，但内部仍保留 code 做业务判断。
function getPaymentChannelNameMap(db: any): Map<string, string> {
  const rows = db.prepare('SELECT code, name FROM payment_channel').all() as Array<{ code: string; name: string }>

  return new Map(
    rows.filter((row) => row.code).map((row) => [String(row.code), row.name ? String(row.name) : String(row.code)]),
  )
}

/**
 * 处理查询时间（时区转换和BIR审计时间检查）
 * 对应后端 handleQueryTime 方法
 */
function handleQueryTime(
  db: any,
  restaurantId: number,
  startTime: Date,
  endTime: Date,
  isCashierReport: boolean,
): { startTime: Date; endTime: Date } {
  // ============= 1. 查询餐厅 BIR 操作配置 =============
  const operationConfig = db
    .prepare(
      `
      SELECT *
      FROM restaurant_operation_config
      WHERE restaurant_id = @restaurantId
      ORDER BY create_time DESC
      LIMIT 1
    `,
    )
    .get({ restaurantId }) as
    | {
        audit_status: number
        audit_time: string
      }
    | undefined

  // ============= 2. 如果启用了 BIR 功能且审核通过，检查时间 =============
  if (operationConfig && operationConfig.audit_status === AUDIT_STATUS.PASS_THE_EXAMINATION) {
    const auditTime = operationConfig.audit_time ? new Date(operationConfig.audit_time) : null

    if (auditTime) {
      // 如果结束时间早于审计时间，抛出异常
      if (endTime < auditTime) {
        throw new Error(
          'Since you have enabled the BIR feature, you are currently unable to view or generate previous related reports.',
        )
      }

      // 如果开始时间早于审计时间（且不是收银报表），调整开始时间为审计时间
      if (startTime < auditTime && !isCashierReport) {
        startTime = auditTime
      }
    }
  }

  // ============= 3. 返回调整后的时间（可以添加时区转换逻辑）============
  return {
    startTime: startTime,
    endTime: endTime,
  }
}

/**
 * 新报告逻辑：从 WaiterClockOrder 查询订单
 * 对应后端 handleNewWaiterOrder 方法 (lines 403-460)
 */
async function handleNewWaiterOrder(
  db: any,
  restaurantId: number,
  waiterNo: string,
  startTime: string,
  endTime: string,
): Promise<OrderData> {
  let waiterClockOrders: WaiterClockOrderRecord[] = []

  if (waiterNo === '0') {
    // 自助服务模式：查询 SELF_SERVICE + POSITIVE_ORDER 类型的订单
    waiterClockOrders = db
      .prepare(
        `
        SELECT *
        FROM waiter_clock_order
        WHERE restaurant_id = @restaurantId
          AND create_time BETWEEN @startTime AND @endTime
          AND waiter_type = @waiterType
          AND record_the_order_type = @recordType
      `,
      )
      .all({
        restaurantId,
        startTime,
        endTime,
        waiterType: WAITER_TYPE.SELF_SERVICE,
        recordType: RECORD_THE_ORDER_TYPE.POSITIVE_ORDER,
      }) as WaiterClockOrderRecord[]
  } else {
    // 特定服务员模式：需要通过 waiter_no 关联查询
    // 关联路径：waiter_no → restaurant_waiter.id → restaurant_waiter_clock_record → waiter_clock_order

    // 步骤1：通过 waiter_no 查询 restaurant_waiter 获取 restaurant_waiter_id
    const waiter = db
      .prepare(
        `
        SELECT id, name
        FROM restaurant_waiter
        WHERE restaurant_id = @restaurantId
          AND waiter_no = @waiterNo
        LIMIT 1
      `,
      )
      .get({
        restaurantId,
        waiterNo,
      }) as { id: number; name: string } | undefined

    if (!waiter) {
      // 服务员不存在，返回空数据
      return {
        saleOrders: [],
        refundOrders: [],
        cancelOrders: [],
        payments: [],
      }
    }

    const restaurantWaiterId = waiter.id

    // 步骤2：通过 restaurant_waiter_id 查询打卡记录
    const clockRecords = db
      .prepare(
        `
        SELECT id
        FROM restaurant_waiter_clock_record
        WHERE restaurant_id = @restaurantId
          AND restaurant_waiter_id = @restaurantWaiterId
          AND working_time BETWEEN @startTime AND @endTime
          AND del_status = 1
      `,
      )
      .all({
        restaurantId,
        restaurantWaiterId,
        startTime,
        endTime,
      }) as { id: number }[]

    if (clockRecords.length === 0) {
      // 没有打卡记录，返回空数据
      return {
        saleOrders: [],
        refundOrders: [],
        cancelOrders: [],
        payments: [],
      }
    }

    // 步骤3：通过打卡记录 ID 查询 waiter_clock_order
    const clockRecordIds = clockRecords.map((r) => r.id)
    const clockRecordParams = Object.fromEntries(clockRecordIds.map((id, index) => [`clockRecordId${index}`, id]))
    const placeholders = clockRecordIds.map((_, index) => `@clockRecordId${index}`).join(',')

    waiterClockOrders = db
      .prepare(
        `
        SELECT *
        FROM waiter_clock_order
        WHERE restaurant_waiter_clock_record_id IN (${placeholders})
          AND create_time BETWEEN @startTime AND @endTime
          AND waiter_type = @waiterType
      `,
      )
      .all({
        ...clockRecordParams,
        startTime,
        endTime,
        waiterType: WAITER_TYPE.REAL_WAITER,
      }) as WaiterClockOrderRecord[]

    const supplementalClockOrders = db
      .prepare(
        `
        SELECT DISTINCT wco.*
        FROM waiter_clock_order wco
        INNER JOIN food_order fo
          ON fo.order_inner_no = wco.order_inner_no
        WHERE wco.restaurant_id = @restaurantId
          AND wco.create_time BETWEEN @startTime AND @endTime
          AND wco.waiter_type = @waiterType
          AND wco.record_the_order_type IN (@positiveType, @refundType, @cancelType)
          AND fo.restaurant_id = @restaurantId
          AND fo.waiter_no = @waiterNo
          AND fo.create_time BETWEEN @startTime AND @endTime
          AND wco.restaurant_waiter_clock_record_id NOT IN (${placeholders})
      `,
      )
      .all({
        ...clockRecordParams,
        restaurantId,
        waiterNo,
        startTime,
        endTime,
        waiterType: WAITER_TYPE.REAL_WAITER,
        positiveType: RECORD_THE_ORDER_TYPE.POSITIVE_ORDER,
        refundType: RECORD_THE_ORDER_TYPE.REFUND_ORDER,
        cancelType: RECORD_THE_ORDER_TYPE.CANCEL_ORDER,
      }) as WaiterClockOrderRecord[]

    if (supplementalClockOrders.length > 0) {
      const waiterClockOrderIds = new Set(waiterClockOrders.map((wco) => wco.id))
      // 兼容单订单同步曾写入服务端 clock id 的本地数据，避免当前 shift 报表漏单。
      waiterClockOrders.push(...supplementalClockOrders.filter((wco) => !waiterClockOrderIds.has(wco.id)))
    }
  }

  // ============= 提取所有唯一的 order_inner_no =============
  const orderInnerNos = [...new Set(waiterClockOrders.map((wco) => wco.order_inner_no))]

  if (orderInnerNos.length === 0) {
    return {
      saleOrders: [],
      refundOrders: [],
      cancelOrders: [],
      payments: [],
    }
  }

  // ============= 根据 orderInnerNo 查询 FoodOrder =============
  const placeholders = orderInnerNos.map(() => '?').join(',')
  const foodOrders = db
    .prepare(
      `
      SELECT *
      FROM food_order
      WHERE order_inner_no IN (${placeholders})
    `,
    )
    .all(...orderInnerNos) as FoodOrderRecord[]

  // ============= 查询 OrderPayment =============
  const orderPayments = db
    .prepare(
      `
      SELECT *
      FROM order_payment
      WHERE order_inner_no IN (${placeholders})
        AND final_payment_status = 1
        AND transaction_status IN (?, ?)
    `,
    )
    .all(...orderInnerNos, PAYMENT_STATUS.PAY_SUCCESS, PAYMENT_STATUS.REFUNDED) as OrderPaymentRecord[]

  // ============= 根据 RecordTheOrderType 分组订单 =============
  const saleOrders: FoodOrderRecord[] = []
  const refundOrders: FoodOrderRecord[] = []
  const cancelOrders: FoodOrderRecord[] = []

  waiterClockOrders.forEach((wco) => {
    const orders = foodOrders.filter((fo) => fo.order_inner_no === wco.order_inner_no)
    orders.forEach((order) => {
      if (wco.record_the_order_type === RECORD_THE_ORDER_TYPE.POSITIVE_ORDER) {
        saleOrders.push(order)
      } else if (wco.record_the_order_type === RECORD_THE_ORDER_TYPE.REFUND_ORDER) {
        refundOrders.push(order)
      } else if (wco.record_the_order_type === RECORD_THE_ORDER_TYPE.CANCEL_ORDER) {
        cancelOrders.push(order)
      }
    })
  })

  // ============= 处理同周期订单：从销售中移除退款订单 =============
  // 对应后端: saleOrderList.removeAll(refundOrderList);
  const refundInnerNos = new Set(refundOrders.map((o) => o.order_inner_no))
  const finalSaleOrders = saleOrders.filter((o) => !refundInnerNos.has(o.order_inner_no))

  return {
    saleOrders: finalSaleOrders, // 已移除退款订单
    refundOrders: refundOrders,
    cancelOrders: cancelOrders,
    payments: orderPayments,
  }
}

/**
 * 获取提款记录
 */
async function getWithdrawalRecords(
  db: any,
  restaurantId: number,
  waiterNo: string,
  startTime: string,
  endTime: string,
): Promise<WithdrawalRecord[]> {
  try {
    // 如果是自助服务，返回空（自助服务没有提款记录）
    if (waiterNo === '0') {
      return []
    }

    // 步骤1：通过 waiter_no 查询 restaurant_waiter 获取 restaurant_waiter_id
    const waiter = db
      .prepare(
        `
        SELECT id
        FROM restaurant_waiter
        WHERE restaurant_id = @restaurantId
          AND waiter_no = @waiterNo
        LIMIT 1
      `,
      )
      .get({
        restaurantId,
        waiterNo,
      }) as { id: number } | undefined

    if (!waiter) {
      return []
    }

    const restaurantWaiterId = waiter.id

    // 步骤2：查询打卡记录
    const clockRecords = db
      .prepare(
        `
        SELECT id
        FROM restaurant_waiter_clock_record
        WHERE restaurant_id = @restaurantId
          AND restaurant_waiter_id = @restaurantWaiterId
          AND working_time BETWEEN @startTime AND @endTime
          AND del_status = 1
      `,
      )
      .all({
        restaurantId,
        restaurantWaiterId,
        startTime,
        endTime,
      }) as { id: number }[]

    if (clockRecords.length === 0) {
      return []
    }

    const clockRecordIds = clockRecords.map((r) => r.id)
    const clockRecordParams = Object.fromEntries(clockRecordIds.map((id, index) => [`clockRecordId${index}`, id]))
    const placeholders = clockRecordIds.map((_, index) => `@clockRecordId${index}`).join(',')

    // 步骤3：查询提款记录
    const records = db
      .prepare(
        `
        SELECT wr.*
        FROM withdrawal_record wr
        INNER JOIN restaurant_waiter_allowance rwa
          ON wr.restaurant_waiter_allowance_id = rwa.id
        WHERE wr.restaurant_id = @restaurantId
          AND wr.clock_id IN (${placeholders})
        ORDER BY wr.create_time DESC
      `,
      )
      .all({
        ...clockRecordParams,
        restaurantId,
      }) as any[]

    return records.map((r) => ({
      withdrawalTime: r.create_time,
      amount: r.once_less_withdrawal,
      withdrawnBy: waiterNo,
      remark: r.remark,
    }))
  } catch (error) {
    // 表不存在或其他错误
    console.warn('Failed to query withdrawal_record:', error)
    return []
  }
}

/**
 * 计算餐厅津贴信息
 * 对应后端 getRestaurantAllowance2 方法
 */
export async function calculateRestaurantAllowance(
  db: any,
  restaurantId: number,
  waiterNo: string,
  startTime: string,
  endTime: string,
  saleOrders: FoodOrderRecord[], // 已过滤，不包含退款订单
  payments: OrderPaymentRecord[],
  refundOrders: FoodOrderRecord[], // 退款订单列表，用于计算退款现金
): Promise<{
  openingFund: number
  cashOnHand: number
  lessWithdrawal: number
}> {
  try {
    // 如果是自助服务，返回 0
    if (waiterNo === '0') {
      return {
        openingFund: 0,
        cashOnHand: 0,
        lessWithdrawal: 0,
      }
    }

    // 步骤1：通过 waiter_no 查询 restaurant_waiter 获取 restaurant_waiter_id
    const waiter = db
      .prepare(
        `
        SELECT id
        FROM restaurant_waiter
        WHERE restaurant_id = @restaurantId
          AND waiter_no = @waiterNo
        LIMIT 1
      `,
      )
      .get({
        restaurantId,
        waiterNo,
      }) as { id: number } | undefined

    if (!waiter) {
      return {
        openingFund: 0,
        cashOnHand: 0,
        lessWithdrawal: 0,
      }
    }

    const restaurantWaiterId = waiter.id

    // 步骤2：查询打卡记录（需要完整的时间字段用于后续计算）
    const clockRecords = db
      .prepare(
        `
        SELECT id, working_time, off_time
        FROM restaurant_waiter_clock_record
        WHERE restaurant_id = @restaurantId
          AND restaurant_waiter_id = @restaurantWaiterId
          AND working_time BETWEEN @startTime AND @endTime
          AND del_status = 1
        ORDER BY working_time
      `,
      )
      .all({
        restaurantId,
        restaurantWaiterId,
        startTime,
        endTime,
      }) as { id: number; working_time: string; off_time: string }[]

    if (clockRecords.length === 0) {
      return {
        openingFund: 0,
        cashOnHand: 0,
        lessWithdrawal: 0,
      }
    }

    // 步骤3：使用优化后的逻辑获取期初资金
    const { openingFund } = await findOptimizedOpeningFund(db, startTime, endTime, restaurantWaiterId, clockRecords)

    // 步骤4：计算提款总额（从实际的提款记录中计算）
    const clockRecordIds = clockRecords.map((r) => r.id)
    const placeholders2 = clockRecordIds.map(() => '?').join(',')

    const withdrawalSum = db
      .prepare(
        `
        SELECT COALESCE(SUM(once_less_withdrawal), 0) as total
        FROM withdrawal_record
        WHERE clock_id IN (${placeholders2})
      `,
      )
      .get(...clockRecordIds) as { total: number } | undefined

    const totalLessWithdrawal = withdrawalSum?.total || 0

    // 步骤5：计算现金支付总额（saleOrders 已过滤，不包含退款订单）
    const saleOrderInnerNos = new Set(saleOrders.map((o) => o.order_inner_no))
    const cashPayments = payments
      .filter(
        (p) => saleOrderInnerNos.has(p.order_inner_no) && (p.payment_platform === 'CASH' || p.pay_product_type === 0),
      )
      .reduce((sum, p) => sum + (p.real_amount || p.amount), 0)

    // 步骤6：计算退款现金总额（需要从现金在手减去）
    const refundInnerNos = new Set(refundOrders.map((o) => o.order_inner_no))
    const refundCashPayments = payments
      .filter(
        (p) => refundInnerNos.has(p.order_inner_no) && (p.payment_platform === 'CASH' || p.pay_product_type === 0),
      )
      .reduce((sum, p) => sum + (p.real_amount || p.amount), 0)

    // 步骤7：现金在手 = 期初资金 + 现金支付 - 提款 - 现金退款
    const cashOnHand = openingFund + cashPayments - totalLessWithdrawal - refundCashPayments

    return {
      openingFund: openingFund,
      cashOnHand: cashOnHand,
      lessWithdrawal: totalLessWithdrawal,
    }
  } catch (error) {
    console.warn('Failed to calculate restaurant allowance:', error)
    return {
      openingFund: 0,
      cashOnHand: 0,
      lessWithdrawal: 0,
    }
  }
}

/**
 * 处理销售订单并计算金额
 * 对应后端 handleSaleOrder 方法 (lines 324-358)
 */
function handleSaleOrder(
  saleOrders: FoodOrderRecord[], // 已过滤，不包含退款订单
  refundOrders: FoodOrderRecord[],
  cancelOrders: FoodOrderRecord[],
  payments: OrderPaymentRecord[],
): {
  refundAmount: number
  cancelledAmount: number
  cashAmount: number
  paymentSummaries: PaymentSummary[]
} {
  // ============= 1. 计算退款总额 =============
  const refundAmount = refundOrders.reduce((sum, o) => sum + (o.refund_payment_id ? o.total_amount : 0), 0)

  // ============= 2. 计算取消总额 =============
  const cancelledAmount = cancelOrders.reduce((sum, o) => sum + o.total_amount, 0)

  // ============= 3. 计算现金支付总额 =============
  const saleOrderInnerNos = new Set(saleOrders.map((o) => o.order_inner_no))
  const cashPayments = payments.filter(
    (p) => saleOrderInnerNos.has(p.order_inner_no) && (p.payment_platform === 'CASH' || p.pay_product_type === 0),
  )
  const cashAmount = cashPayments.reduce((sum, p) => sum + (p.real_amount || p.amount), 0)

  // ============= 4. 生成支付方式汇总 =============
  const paymentMap = new Map<string, number>()
  payments.forEach((p) => {
    if (!saleOrderInnerNos.has(p.order_inner_no)) return
    const platform = p.payment_platform || 'UNKNOWN'
    const amount = paymentMap.get(platform) || 0
    paymentMap.set(platform, amount + (p.real_amount || p.amount))
  })

  const paymentSummaries: PaymentSummary[] = Array.from(paymentMap.entries()).map(([platform, amount]) => ({
    paymentMethod: platform,
    amount: amount,
  }))

  return {
    refundAmount: refundAmount,
    cancelledAmount: cancelledAmount,
    cashAmount: cashAmount,
    paymentSummaries: paymentSummaries,
  }
}

/**
 * 设置订单号列表
 * 对应后端 setOrderNos 方法 (lines 606-634)
 */
function setOrderNos(
  saleOrders: FoodOrderRecord[],
  refundOrders: FoodOrderRecord[],
  cancelOrders: FoodOrderRecord[],
  payments: OrderPaymentRecord[] = [],
): {
  saleOrderNos: string[]
  cancelOrderNos: string[]
  refundOrderNos: string[]
} {
  // 过滤掉手动录入的订单（如果有标记）
  const isManualEntry = (order: FoodOrderRecord) => {
    // 假设手动录入的订单有特定标记，需要根据实际情况调整
    return order.order_app === 999 // 示例：假设 order_app = 999 表示手动录入
  }

  // ============= 处理当天退款的订单：把正向订单号也加回来 =============
  // 对应后端逻辑：如果完成时间和退款时间相同（同一天），说明是当天退款的，要统计退款订单的正向订单号
  const saleOrdersForNos = [...saleOrders]
  if (refundOrders.length > 0) {
    const sameDayRefundOrders = refundOrders.filter((order) => {
      if (!order.complete_time || !order.refund_time) return false
      const completeDate = new Date(order.complete_time).toDateString()
      const refundDate = new Date(order.refund_time).toDateString()
      return completeDate === refundDate
    })
    if (sameDayRefundOrders.length > 0) {
      saleOrdersForNos.push(...sameDayRefundOrders)
    }
  }

  // BIR 报表上的 SI/REFUND 范围使用法定序列号，而不是业务订单号。
  const refundPaymentByOrderInnerNo = new Map<string, OrderPaymentRecord>()
  for (const payment of payments) {
    if (!payment.refund_serial_no) continue
    refundPaymentByOrderInnerNo.set(payment.order_inner_no, payment)
  }

  return {
    saleOrderNos: normalizeSerialNoList(
      saleOrdersForNos.filter((o) => !isManualEntry(o)).map((o) => o.order_serial_number),
    ),
    cancelOrderNos: normalizeSerialNoList(
      cancelOrders.filter((o) => !isManualEntry(o)).map((o) => o.order_serial_number),
    ),
    refundOrderNos: normalizeSerialNoList(
      refundOrders
        .filter((o) => !isManualEntry(o))
        .map((o) => refundPaymentByOrderInnerNo.get(o.order_inner_no)?.refund_serial_no),
    ),
  }
}

function normalizeSerialNoList(serialNos: Array<string | null | undefined>): string[] {
  const uniqueSerialNos = [...new Set(serialNos.filter((serialNo): serialNo is string => Boolean(serialNo)))]

  return uniqueSerialNos.sort((a, b) => {
    try {
      return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0
    } catch {
      return a.localeCompare(b)
    }
  })
}

function getRefundSerialNosByOrderInnerNos(db: ReturnType<typeof getDB>, orderInnerNos: string[]): string[] {
  if (orderInnerNos.length === 0) {
    return []
  }

  const refundPayments = db
    .prepare(
      `
      SELECT refund_serial_no
      FROM order_payment
      WHERE order_inner_no IN (${orderInnerNos.map(() => '?').join(',')})
        AND refund_serial_no IS NOT NULL
        AND refund_serial_no != ''
    `,
    )
    .all(...orderInnerNos) as Array<{ refund_serial_no: string | null }>

  // 退款号展示的是 order_payment.refund_serial_no 的起止范围。
  return normalizeSerialNoList(refundPayments.map((payment) => payment.refund_serial_no))
}

/**
 * 生成渠道结算报告
 */
function generateChannelSettlementReports(
  saleOrders: FoodOrderRecord[], // 已过滤，不包含退款订单
  payments: OrderPaymentRecord[],
  paymentChannelNameMap: Map<string, string>,
): ChannelSettlementReport[] {
  // ============= 1. 按支付渠道分组，统计成功交易笔数和实收金额 =============
  const channelMap = new Map<
    string,
    {
      channelName: string
      transactionCount: number
      transactionAmount: number
    }
  >()

  const saleOrderInnerNos = new Set(saleOrders.map((o) => o.order_inner_no))
  payments.forEach((payment) => {
    if (!saleOrderInnerNos.has(payment.order_inner_no)) return

    const channelCode = payment.channel_code || payment.payment_platform || 'UNKNOWN'
    const data = channelMap.get(channelCode) || {
      channelName: paymentChannelNameMap.get(channelCode) ?? channelCode,
      transactionCount: 0,
      transactionAmount: 0,
    }

    data.transactionCount += 1
    data.transactionAmount += payment.real_amount || payment.amount
    channelMap.set(channelCode, data)
  })

  // 生成报告
  return Array.from(channelMap.entries()).map(([channelCode, data]) => ({
    channelName: data.channelName,
    channelCode,
    transactionCount: data.transactionCount,
    transactionAmount: data.transactionAmount,
  }))
}

/**
 * 订单数据接口
 */
interface OrderData {
  saleOrders: FoodOrderRecord[]
  refundOrders: FoodOrderRecord[]
  cancelOrders: FoodOrderRecord[]
  payments: OrderPaymentRecord[]
}

/**
 * 检查指定时间范围内是否存在交易
 */
function hasTransactions(db: any, restaurantWaiterId: number, checkStartTime: string, checkEndTime: string): boolean {
  const countResult = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM waiter_clock_order wco
      INNER JOIN restaurant_waiter_clock_record rwcr ON wco.restaurant_waiter_clock_record_id = rwcr.id
      WHERE rwcr.restaurant_waiter_id = @restaurantWaiterId
        AND wco.create_time BETWEEN @checkStartTime AND @checkEndTime
    `,
    )
    .get({ restaurantWaiterId, checkStartTime, checkEndTime }) as { count: number } | undefined
  return (countResult?.count || 0) > 0
}

/**
 * 优化获取期初资金的逻辑
 * a.往前找同一班次内的Opening fund，如果上一次记录Opening fund到报告的开始时间，都没有发生交易，就使用上一次记录的Opening fund
 * b.若往前没找到，则往后找下一班次的Opening fund，如果报告开始时间到下一班次记录的期间没有发生交易，则使用下一班次的Opening fund
 * c.若往前往后都没找到，则记为0
 */
async function findOptimizedOpeningFund(
  db: any,
  startTime: string,
  endTime: string,
  restaurantWaiterId: number,
  currentClockRecords: Array<{
    id: number
    working_time: string
    off_time: string
  }>,
): Promise<{ openingFund: number; lessWithdrawal: number }> {
  let openingFund = 0
  let lessWithdrawal = 0 // Represents initial less_withdrawal from allowance record

  // 1. 尝试从当前报表时间段内的第一个打卡记录获取期初资金
  if (currentClockRecords.length > 0) {
    const sortedClockRecords = currentClockRecords.sort(
      (a, b) => new Date(a.working_time).getTime() - new Date(b.working_time).getTime(),
    )
    const firstClockId = sortedClockRecords[0].id
    const allowance = db
      .prepare(
        `
        SELECT opening_fund, less_withdrawal
        FROM restaurant_waiter_allowance
        WHERE clock_id = @firstClockId
        ORDER BY opening_time
        LIMIT 1
      `,
      )
      .get({ firstClockId }) as { opening_fund: number; less_withdrawal: number } | undefined

    if (allowance) {
      openingFund = allowance.opening_fund || 0
      lessWithdrawal = allowance.less_withdrawal || 0
      return { openingFund, lessWithdrawal }
    }
  }

  // 2. Case a: 往前找同一班次内的Opening fund
  // 查找在报告开始时间之前，且已结束的最近一个打卡记录
  const previousClockRecord = db
    .prepare(
      `
      SELECT id, working_time, off_time
      FROM restaurant_waiter_clock_record
      WHERE restaurant_waiter_id = @restaurantWaiterId
        AND off_time < @startTime
      ORDER BY off_time DESC
      LIMIT 1
    `,
    )
    .get({ restaurantWaiterId, startTime }) as { id: number; working_time: string; off_time: string } | undefined

  if (previousClockRecord) {
    const prevAllowance = db
      .prepare(
        `
        SELECT opening_fund, less_withdrawal
        FROM restaurant_waiter_allowance
        WHERE clock_id = @prevClockId
        ORDER BY opening_time
        LIMIT 1
      `,
      )
      .get({ prevClockId: previousClockRecord.id }) as { opening_fund: number; less_withdrawal: number } | undefined

    if (prevAllowance) {
      // 检查从上一次记录Opening fund到报告的开始时间之间，是否没有发生交易
      // 这里的'上一次记录Opening fund'的时间点，我们近似认为是previousClockRecord的working_time
      const hasTrans = hasTransactions(db, restaurantWaiterId, previousClockRecord.working_time, startTime)
      if (!hasTrans) {
        openingFund = prevAllowance.opening_fund || 0
        lessWithdrawal = prevAllowance.less_withdrawal || 0
        return { openingFund, lessWithdrawal }
      }
    }
  }

  // 3. Case b: 往后找下一班次的Opening fund
  // 查找在报告结束时间之后，且已开始的最近一个打卡记录
  const nextClockRecord = db
    .prepare(
      `
      SELECT id, working_time, off_time
      FROM restaurant_waiter_clock_record
      WHERE restaurant_waiter_id = @restaurantWaiterId
        AND working_time > @endTime
      ORDER BY working_time ASC
      LIMIT 1
    `,
    )
    .get({ restaurantWaiterId, endTime }) as { id: number; working_time: string; off_time: string } | undefined

  if (nextClockRecord) {
    const nextAllowance = db
      .prepare(
        `
        SELECT opening_fund, less_withdrawal
        FROM restaurant_waiter_allowance
        WHERE clock_id = @nextClockId
        ORDER BY opening_time
        LIMIT 1
      `,
      )
      .get({ nextClockId: nextClockRecord.id }) as { opening_fund: number; less_withdrawal: number } | undefined

    if (nextAllowance) {
      // 检查从报告结束时间到下一班次记录的期间，是否没有发生交易
      const hasTrans = hasTransactions(db, restaurantWaiterId, endTime, nextClockRecord.working_time)
      if (!hasTrans) {
        openingFund = nextAllowance.opening_fund || 0
        lessWithdrawal = nextAllowance.less_withdrawal || 0
        return { openingFund, lessWithdrawal }
      }
    }
  }

  // 4. Case c: 若往前往后都没找到，则记为0
  return { openingFund: 0, lessWithdrawal: 0 }
}

// ============= 格式化函数 =============

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 格式化时间为 HH:mm:ss
 */
function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

/**
 * 格式化日期时间为 YYYY-MM-DD HH:mm:ss
 */
function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${formatTime(date)}`
}
