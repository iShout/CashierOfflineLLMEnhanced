export interface WaiterRecord {
  /** 主键id */
  id: number;
  /** 服务员编号 */
  waiter_no: string | null;
  /** 餐厅id */
  restaurant_id: number | null;
  /** 名称 */
  name: string | null;
  /** 用户邮箱或手机号 */
  account: string | null;
  /** 密码 */
  password: string;
  /** 是否启用 1=启用, 2=禁用 */
  on_off: number;
  /** 上次登录设备 */
  last_device: string | null;
  /** 上次登录时间 */
  last_login_time: string | null;
  /** 创建人id */
  creator: number;
  /** fcm_token */
  fcm_token: string | null;
  /** 收银模式 1桌台收银 3排队点餐 */
  cashier_mode: number;
  create_time: string | null;
  update_time: string | null;
  /** 考勤状态 1开启 2关闭 */
  clock_status: number;
  /** 自助下单模式 1开启 2关闭 默认关闭 */
  self_order_mode: number;
}

export interface SysPermissionRecord {
  /** 主键id */
  id: number;
  /** 权限代码名称 */
  code: string;
  /** 创建时间 */
  create_time: string | null;
  /** 更新时间 */
  update_time: string | null;
  /** 权限路径 */
  url: string;
  /** 平台标识 MGR:运营 MCH:商户 APP:用户 WAITER:服务端 */
  platform: string;
  /** 名称 */
  name: string;
  /** 所属类目名称 */
  category: string;
  /** 国家名称 */
  country_name: string;
}

export interface SysRoleRecord {
  /** 主键id */
  id: number;
  /** 角色名称 */
  role_name: string;
  /** 状态 1：开启 2：关闭 */
  status: number;
  restaurant_id: number | null;
  /** 备注 */
  remark: string | null;
  create_time: string | null;
  update_time: string | null;
  /** 编辑人id */
  editor: number;
  /** 平台标识 MGR:运营 MCH:商户 APP:用户 WAITER:服务端 */
  platform: string;
  /** 编辑人名称 */
  editor_name: string;
}

export interface SysRolePermissionRecord {
  /** 主键id */
  id: number;
  /** 角色id */
  role_id: number;
  /** 权限id */
  permission_id: number;
  /** 创建时间 */
  create_time: string | null;
  /** 更新时间 */
  update_time: string | null;
  /** 平台标识 MGR:运营, MCH:商户 APP:用户app WAITER:服务端 */
  platform: string;
}

export interface SysUserRoleRecord {
  /** 主键id */
  id: number;
  /** 用户id */
  user_id: number;
  /** 角色id */
  role_id: number;
  /** 创建时间 */
  create_time: string | null;
  /** 更新时间 */
  update_time: string | null;
  /** 平台标识 MGR:运营 MCH:商户 APP:用户 WAITER:服务端 */
  platform: string;
}
