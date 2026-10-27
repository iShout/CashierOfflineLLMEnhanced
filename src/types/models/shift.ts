export interface RestaurantWaiterClockRecord {
  /** 主键 ID */
  id: number;
  /** 服务端主键 */
  server_id?: number | null;
  /** 餐厅 ID */
  restaurant_id: number;
  /** 服务员 ID */
  restaurant_waiter_id: number;
  /** 上班时间 */
  working_time: string;
  /** 上班打卡 URL */
  working_url: string | null;
  /** 上班打卡本地图片资源 ID */
  clock_in_local_image: string | null;
  /** 下班时间 */
  off_time: string | null;
  /** 下班打卡 URL */
  off_url: string | null;
  /** 下班打卡本地图片资源 ID */
  clock_out_local_image: string | null;
  /** 上班时长 */
  working_duration: number;
  /** 上一次休息开始时间 */
  rest_start_time: string | null;
  /** 休息时长 */
  rest_duration: number;
  /** 服务员状态：1 上班中，2 休息中，3 已完成 */
  waiter_status: number;
  /** 打卡账号 ID */
  waiter_clock_id: number;
  /** 逻辑删除：1 未删除，2 已删除 */
  del_status: number;
  /** 创建时间 */
  create_time: string | null;
  /** 修改时间 */
  update_time: string | null;
  /** 报告内容 */
  report_json: string | null;
  /** 新旧报告：1 旧报告，2 新报告 */
  new_old_report_status: number;
  /** 旧打卡记录来源 POS，仅用于兼容历史数据 */
  device_no: string | null;
}

export interface RestaurantWaiterAllowanceRecord {
  /** 主键 ID */
  id: number;
  /** 服务端主键 */
  server_id?: number | null;
  /** 餐厅 ID */
  restaurant_id: number | null;
  /** 打卡记录 ID */
  clock_id: number | null;
  /** 开业资金 */
  opening_fund: number | null;
  /** 下班资金 */
  cash_on_hand: number | null;
  /** 非日常业务取出资金 */
  less_withdrawal: number | null;
  /** 服务员 ID */
  waiter_id: number | null;
  /** 开业时间 */
  opening_time: string | null;
  /** 结束资金录入时间 */
  end_recording_time: string | null;
  /** 创建时间 */
  create_time: string;
  /** 修改时间 */
  update_time: string | null;
}

export interface WithdrawalRecord {
  /** 主键 ID */
  id: number;
  /** 服务端主键 */
  server_id?: number | null;
  /** 餐厅 ID */
  restaurant_id: number;
  /** 打卡记录 ID */
  clock_id: number;
  /** 员工资金记录 ID */
  restaurant_waiter_allowance_id: number;
  /** 本次取出资金 */
  once_less_withdrawal: number;
  /** 取出备注 */
  remark: string;
  /** 服务员 ID */
  waiter_id: number;
  /** 创建时间 */
  create_time: string;
  /** 修改时间 */
  update_time: string | null;
}
