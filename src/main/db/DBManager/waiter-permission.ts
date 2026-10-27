import { getDB } from '../index'
import type { WaiterRecord, SysPermissionRecord, SysRoleRecord } from '@app-types/models/permission'
import type { ValidateWaiterResponse, BaseResponse, LoginWaiter } from '@app-types/api'
import { generateSessionToken } from '@main/authManager'
import { RESPONSE_CODE } from '@shared/constants/enums'
import * as bcrypt from 'bcrypt'

const buildLoginWaiter = (waiter: WaiterRecord): LoginWaiter => {
  const db = getDB()
  const { password: _, ...waiterWithoutPassword } = waiter
  const getRoleInfo = db.prepare(`
    SELECT sr.*
    FROM sys_user_role sur
    INNER JOIN sys_role sr ON sr.id = sur.role_id
    WHERE sur.user_id = ?
    ORDER BY sur.id ASC
    LIMIT 1
  `)
  const roleInfo = getRoleInfo.get(waiter.id) as SysRoleRecord | undefined
  const permissionList = roleInfo
    ? (db
        .prepare(
          `
            SELECT DISTINCT sp.*
            FROM sys_role_permission srp
            INNER JOIN sys_permission sp ON sp.id = srp.permission_id
            WHERE srp.role_id = @role_id
            ORDER BY sp.id ASC
          `,
        )
        .all({ role_id: roleInfo.id }) as Array<SysPermissionRecord>)
    : []

  return {
    ...waiterWithoutPassword,
    username: waiter.account,
    // 登录态保持在线端 role_info.permission_list 结构，方便 renderer 统一生成权限 map。
    role_info: roleInfo ? { ...roleInfo, permission_list: permissionList } : null,
  }
}

const validateWaiter = async (account: string, password: string): Promise<BaseResponse<ValidateWaiterResponse>> => {
  const db = getDB()
  const getWaiterByAccount = db.prepare(`
    SELECT * FROM restaurant_waiter WHERE account = ? AND on_off = 1
  `)
  const waiter: WaiterRecord | undefined = getWaiterByAccount.get(account) as WaiterRecord | undefined

  if (!waiter) {
    return {
      code: RESPONSE_CODE.ERROR,
      message: 'Account is not found',
      data: undefined,
    }
  }
  const isMatch = await bcrypt.compare(password, waiter.password)
  console.log(isMatch, 'isMatch')
  if (!isMatch) {
    return {
      code: RESPONSE_CODE.ERROR,
      message: 'Password is incorrect',
      data: undefined,
    }
  }

  return {
    code: RESPONSE_CODE.SUCCESS,
    message: 'Login successful',
    data: {
      token: generateSessionToken({
        waiter_no: waiter.waiter_no,
        account: waiter.account,
      }),
      waiter: buildLoginWaiter(waiter),
    },
  }
}

const getLocalWaiterByAccount = (account: string): BaseResponse<{ waiter: LoginWaiter }> => {
  if (!account) {
    return {
      code: RESPONSE_CODE.ERROR,
      message: 'Account is required',
      data: undefined,
    } as BaseResponse<{ waiter: LoginWaiter }>
  }

  const db = getDB()
  const getWaiterStatement = db.prepare(`
    SELECT * FROM restaurant_waiter WHERE account = ? AND on_off = 1
  `)
  const waiter: WaiterRecord | undefined = getWaiterStatement.get(account) as WaiterRecord | undefined

  if (!waiter) {
    return {
      code: RESPONSE_CODE.ERROR,
      message: 'Account is not found',
      data: undefined,
    } as BaseResponse<{ waiter: LoginWaiter }>
  }

  return {
    code: RESPONSE_CODE.SUCCESS,
    message: 'Waiter fetched',
    data: {
      waiter: buildLoginWaiter(waiter),
    },
  }
}

export { validateWaiter, getLocalWaiterByAccount }
