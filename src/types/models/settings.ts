export interface PaymentChannelRecord {
  id: number;
  restaurant_id: number;
  payment_channel_no: string;
  name: string;
  code: string;
  type: number;
  pay_product_type: number;
  logo: string | null;
  del_status: number;
  create_time: string;
  update_time: string | null;
  country_name: string;
  refund_status: number;
  refund_time_limit: number | null;
}

export interface RestaurantRecord {
  id: number;
  merchant_no: string | null;
  restaurant_no: string | null;
  name: string;
  restaurant_type: number;
  restaurant_type_detail: number | null;
  manager_id: number;
  create_time: string | null;
  update_time: string | null;
  merchant_name: string;
  role_step_id: number | null;
  father_rest_id: number | null;
  father_rest_id_list: string | null;
  menu_activation: number | null;
  display_name: string | null;
  payment_capability: number | null;
  country_name: string;
  register_type: number;
}

export interface RestaurantAreaRecord {
  id: number;
  area_uuid: string | null;
  name: string | null;
  restaurant_id: number | null;
  operator_id: number;
  del_status: number;
  create_time: string | null;
  update_time: string | null;
}

export interface RestaurantChannelSettingRecord {
  id: number;
  restaurant_id: number;
  payment_channel_no: string | null;
  type: number | null;
  used: number;
  sort: number | null;
  create_time: string;
  update_time: string | null;
}

export interface RestaurantLabelPrinterSettingRecord {
  id: number;
  mac_id: string | null;
  restaurant_id: number;
  print_size_type: number;
  nick_name: string | null;
  remark: string | null;
  print_language: number;
  create_time: string | null;
  update_time: string | null;
}

export interface RestaurantWaiterBlueToothSettingRecord {
  id: number;
  restaurant_id: number;
  waiter_id: number;
  mac_id: string | null;
  paper_width: number | null;
  printer_type_id: number | null;
  language: number | null;
  restaurant_name_display: number | null;
  number_of_copy: number | null;
  connect_status: number | null;
  create_time: string | null;
  update_time: string | null;
  nick_name: string | null;
  remark: string | null;
  sn_number: string | null;
  printer_type: number;
  printer_font_size: number;
}

export interface RestaurantOperationConfigRecord {
  id: number;
  restaurant_id: number;
  tin_number: string | null;
  restaurant_address: string | null;
  create_time: string | null;
  update_time: string | null;
  vat_register_status: number;
  ptu_number: string | null;
  ptu_issue_date: string | null;
  min_number: string | null;
  taxpayer_name: string | null;
  operator_id: number | null;
  submit_time: string | null;
  audit_time: string | null;
  audit_status: number | null;
  auth_type: number;
  serial_number: string | null;
  trade_name: string | null;
  /** 旧 BIR 配置来源 POS，仅用于兼容历史数据 */
  device_no: string | null;
}

export interface RestaurantPrinterCategoryRecord {
  id: number;
  restaurant_printer_id: number | null;
  category_id: number | null;
  mac_id: string | null;
  create_time: string | null;
  update_time: string | null;
  restaurant_id: number | null;
  print_type: number;
}

export interface RestaurantSettingRecord {
  id: number;
  restaurant_id: number | null;
  mode: number | null;
  acceptance: number | null;
  completion: number | null;
  pwd_discount_status: number;
  pwd_calculation_type: number;
  service_fee_status: number | null;
  service_fee_type: number | null;
  service_fee: number;
  vat_included: number | null;
  inventory: number;
  inventory_type: number;
  clock_status: number;
  bir_status: number;
  cashier_mode: number;
  create_time: string;
  update_time: string | null;
  tax_fee: number;
  auto_print_payment: number;
  clock_photo_status: number;
  table_order_status: number;
}

export interface RestaurantTableRecord {
  id: number;
  table_uuid: string | null;
  name: string;
  seat: number | null;
  fee: number | null;
  area_id: number;
  restaurant_id: number | null;
  operator_id: number;
  del_status: number;
  create_time: string | null;
  update_time: string | null;
}

export interface RestaurantWaitSettingRecord {
  id: number;
  restaurant_id: number | null;
  status: number;
  acceptance: number | null;
  dining_out: number | null;
  completion: number | null;
  dining_out_time: number | null;
  completion_time: number | null;
  create_time: string;
  update_time: string | null;
}
