import type { SysPermissionRecord, SysRoleRecord, WaiterRecord } from './models/permission'

export type LoginWaiter = Omit<WaiterRecord, 'password'> & {
  username: string | null
  role_info: (SysRoleRecord & { permission_list?: Array<SysPermissionRecord> }) | null
}

export interface ValidateWaiterResponse {
  token: string
  waiter: LoginWaiter
}

export interface BaseResponse<T> {
  code: number
  message: string
  data: T
}
