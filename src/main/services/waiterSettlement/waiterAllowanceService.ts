/**
 * 服务员津贴和报告管理服务
 * 对应后端 RestaurantReportBusinessImpl 的津贴和报告相关方法
 */

import { getDB } from '../../db'
import { getCurrentSession } from '@main/authManager'
import type { RestaurantWaiterAllowanceRecord } from '@app-types/models/shift'

/**
 * 津贴类型枚举
 * 对应后端 AllowanceEnum
 */
const ALLOWANCE_TYPE = {
  OPENING_FUND: 1, // 开业资金
  CASH_ON_HAND: 2, // 现金在手
  LESS: 3, // 减少提款
} as const

/**
 * 添加津贴记录请求参数
 * 对应后端 RestaurantAddAllowanceReq
 */
export interface AddAllowanceReq {
  /** 初始资金 */
  openingFund?: number
  /** 更新初始资金标志 */
  isUpdateOpeningFund?: boolean
  /** 打卡记录ID */
  clockId?: number
  /** 结业资金 */
  cashOnHand?: number
  /** 提取的资金 */
  lessWithdrawal?: number
  /** 餐厅ID */
  restaurantId: number
  /** 服务员id */
  waiterId: number
  /** 服务员编号 */
  waiterNo?: string
  /** 输入的类型 */
  allowanceType: number // 1=OPENING_FUND, 2=CASH_ON_HAND, 3=LESS
  /** 取钱备注 */
  lessRemark?: string
}

/**
 * 添加津贴记录
 * 对应后端 addAllowance 方法 (lines 87-155)
 *
 * @param req 津贴请求参数
 * @returns 是否成功
 */
export async function addAllowance(req: AddAllowanceReq): Promise<boolean> {
  const db = getDB()

  try {
    // ============= 1. 如果是开业资金且不需要更新，直接保存 =============
    if (
      req.allowanceType === ALLOWANCE_TYPE.OPENING_FUND &&
      !req.isUpdateOpeningFund
    ) {
      const result = db
        .prepare(
          `
          INSERT INTO restaurant_waiter_allowance (
            restaurant_id,
            waiter_id,
            clock_id,
            opening_fund,
            opening_time,
            create_time
          ) VALUES (
            @restaurantId,
            @waiterId,
            @clockId,
            @openingFund,
            @openingTime,
            @createTime
          )
        `,
        )
        .run({
          restaurantId: req.restaurantId,
          waiterId: req.waiterId,
          clockId: 0, // 新建时 clock_id 为 0
          openingFund: req.openingFund || 0,
          openingTime: new Date().toISOString(),
          createTime: new Date().toISOString(),
        })

      return result.changes > 0
    }

    // ============= 2. 查询服务员最后一次打卡记录 =============
    const clockRecord = db
      .prepare(
        `
        SELECT id
        FROM restaurant_waiter_clock_record
        WHERE restaurant_id = @restaurantId
          AND restaurant_waiter_id = @waiterId
          AND del_status = 1
        ORDER BY working_time DESC
        LIMIT 1
      `,
      )
      .get({
        restaurantId: req.restaurantId,
        waiterId: req.waiterId,
      }) as { id: number } | undefined

    if (!clockRecord) {
      return true // 没有打卡记录，直接返回成功
    }

    // ============= 3. 获取最新一条津贴记录 =============
    const firstAllowance = db
      .prepare(
        `
        SELECT *
        FROM restaurant_waiter_allowance
        WHERE restaurant_id = @restaurantId
          AND waiter_id = @waiterId
        ORDER BY create_time DESC
        LIMIT 1
      `,
      )
      .get({
        restaurantId: req.restaurantId,
        waiterId: req.waiterId,
      }) as RestaurantWaiterAllowanceRecord | undefined

    // ============= 4. 如果没有津贴记录，创建新记录 =============
    if (!firstAllowance) {
      const allowanceData: any = {
        restaurantId: req.restaurantId,
        waiterId: req.waiterId,
        clockId: clockRecord.id,
        openingFund: 0,
        createTime: new Date().toISOString(),
      }

      if (req.allowanceType === ALLOWANCE_TYPE.CASH_ON_HAND) {
        allowanceData.endRecordingTime = new Date().toISOString()
      }

      const result = db
        .prepare(
          `
          INSERT INTO restaurant_waiter_allowance (
            restaurant_id,
            waiter_id,
            clock_id,
            opening_fund,
            ${req.allowanceType === ALLOWANCE_TYPE.CASH_ON_HAND ? 'end_recording_time,' : ''}
            create_time
          ) VALUES (
            @restaurantId,
            @waiterId,
            @clockId,
            @openingFund,
            ${req.allowanceType === ALLOWANCE_TYPE.CASH_ON_HAND ? '@endRecordingTime,' : ''}
            @createTime
          )
        `,
        )
        .run(allowanceData)

      return result.changes > 0
    }

    // ============= 5. 更新已有津贴记录 =============
    const updateData: any = {
      id: firstAllowance.id,
      updateTime: new Date().toISOString(),
    }

    if (req.allowanceType === ALLOWANCE_TYPE.CASH_ON_HAND) {
      updateData.endRecordingTime = new Date().toISOString()
      updateData.cashOnHand = req.cashOnHand
    }

    if (req.allowanceType === ALLOWANCE_TYPE.OPENING_FUND) {
      updateData.openingTime = new Date().toISOString()
      updateData.openingFund = req.openingFund
    }

    if (req.allowanceType === ALLOWANCE_TYPE.LESS) {
      const currentLessWithdrawal = firstAllowance.less_withdrawal || 0
      updateData.lessWithdrawal =
        currentLessWithdrawal + (req.lessWithdrawal || 0)

      // 当存在 cash_on_hand 时，输入 less_withdrawal，cash_on_hand 应该减去 less_withdrawal 的值
      if (
        firstAllowance.cash_on_hand !== null &&
        firstAllowance.end_recording_time &&
        new Date(firstAllowance.end_recording_time) < new Date()
      ) {
        updateData.cashOnHand =
          (firstAllowance.cash_on_hand || 0) - (req.lessWithdrawal || 0)
        updateData.endRecordingTime = new Date().toISOString()
      }

      // 保存取钱记录
      await saveWithdrawalRecord(req, firstAllowance.id, clockRecord.id)
    }

    // 更新津贴记录
    const setClause = Object.keys(updateData)
      .filter((key) => key !== 'id')
      .map((key) => `${camelToSnake(key)} = @${key}`)
      .join(', ')

    const result = db
      .prepare(
        `
        UPDATE restaurant_waiter_allowance
        SET ${setClause}
        WHERE id = @id
      `,
      )
      .run(updateData)

    return result.changes > 0
  } catch (error) {
    console.error('Failed to add allowance:', error)
    throw error
  }
}

/**
 * 保存提款记录
 */
async function saveWithdrawalRecord(
  req: {
    restaurantId: number
    waiterId: number
    lessWithdrawal?: number
    lessRemark?: string
  },
  allowanceId: number,
  clockId: number,
): Promise<void> {
  const db = getDB()

  db.prepare(
    `
    INSERT INTO withdrawal_record (
      restaurant_id,
      restaurant_waiter_allowance_id,
      clock_id,
      once_less_withdrawal,
      remark,
      waiter_id,
      create_time
    ) VALUES (
      @restaurantId,
      @allowanceId,
      @clockId,
      @onceLessWithdrawal,
      @remark,
      @waiterId,
      @createTime
    )
  `,
  ).run({
    restaurantId: req.restaurantId,
    allowanceId: allowanceId,
    clockId: clockId,
    onceLessWithdrawal: req.lessWithdrawal || 0,
    remark: req.lessRemark || '',
    waiterId: req.waiterId,
    createTime: new Date().toISOString(),
  })
}

/**
 * 驼峰转下划线
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

/**
 * 下载BIR报告
 * 对应后端 downloadBirReport 方法
 *
 * @param req 请求参数
 * @returns BIR报告数据
 */
export async function downloadBirReport(req: {
  startTime: Date
  endTime: Date
  birInfo?: {
    accNumber: string
    ptuIssueDate: string
    ptuValidUntil: string
    ptuNumber: string
  }
}): Promise<{
  success: boolean
  reportData?: any
  errorMessage?: string
}> {
  try {
    const { user } = getCurrentSession()
    const restaurantId = user?.restaurant_id
    const waiterNo = user?.waiter_no

    if (!restaurantId) {
      return {
        success: false,
        errorMessage: 'Current session user restaurant_id is missing.',
      }
    }

    // ============= 1. 验证BIR信息 =============
    if (!req.birInfo) {
      return {
        success: false,
        errorMessage: 'BIR information is required',
      }
    }

    // ============= 2. 查询服务员结算报表数据 =============
    // 复用 queryWaiterSettlementReport 逻辑
    const { queryWaiterSettlementReport } =
      await import('@db/DBManager/reports-nonsync')

    const reportData = await queryWaiterSettlementReport({
      restaurantId,
      startTime: req.startTime,
      endTime: req.endTime,
      waiterNo: waiterNo || '',
      restaurantName: '', // TODO: 从数据库查询
      chinese: false,
      vatRegisterStatus: false,
      tinNumber: req.birInfo.accNumber,
      minNumber: '',
      serialNumber: '',
      reportNumber: '',
      cashierName: '',
      companyName: '',
      companyAddress: '',
      companyTin: req.birInfo.accNumber,
      birInfo: req.birInfo,
    })

    // ============= 3. 返回BIR报告数据 =============
    return {
      success: true,
      reportData: {
        ...reportData,
        birInfo: req.birInfo,
      },
    }
  } catch (error) {
    console.error('Failed to download BIR report:', error)
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
