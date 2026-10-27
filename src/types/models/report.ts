export interface RestaurantReportPrintRecord {
  /** 主键 ID */
  id: number;
  /** 餐厅 ID */
  restaurant_id: number;
  /** 服务员编号 */
  waiter_no: string | null;
  /** 打印开始时间 */
  print_start_time: string;
  /** 打印结束时间 */
  print_end_time: string;
  /** 打印类型 */
  print_type: number;
  /** 票据编号 */
  receipt_id: string;
  /** 打印次数 */
  print_count: number;
  /** 创建时间 */
  create_time: string | null;
  /** 更新时间 */
  update_time: string | null;
  /** 报告内容 */
  report_json: string | null;
  /** 创建类型：1 手动，2 自动 */
  build_type: number;
  /** 推送状态：1 已推送，2 未推送 */
  push_status: number;
  /** 本地上传状态：1 已同步，2 未同步 */
  sync_status: number;
  /** 旧报告来源 POS，仅用于兼容历史数据 */
  device_no: string | null;
}
