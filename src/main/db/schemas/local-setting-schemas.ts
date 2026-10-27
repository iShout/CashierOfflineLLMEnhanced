export const CREATE_LOCAL_SETTING_TABLE = `
-- 本地餐厅级设置，仅本机使用，不同步服务器
CREATE TABLE IF NOT EXISTS local_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    -- 下一次 payment/refund 打印要使用的 19 位系统交易号；空值表示当前餐厅尚未初始化
    local_system_transaction_no TEXT,
    -- 下一次本地订单要使用的 20 位订单流水号；空值表示当前餐厅尚未初始化
    next_order_serial_number TEXT,
    -- 下一次本地退款要使用的 19 位退款流水号；空值表示当前餐厅尚未初始化
    next_refund_serial_no TEXT,
    -- 下一次本地支付/退款记录要使用的 20 位 receipt no；空值表示当前餐厅尚未初始化
    next_receipt_no TEXT,
    -- 下一次本地日报要使用的 20 位 receipt id；空值表示当前餐厅尚未初始化
    next_receipt_id TEXT,
    -- 下一次排队点餐要使用的 3 位取餐号；EOD 生成后重置为 001
    next_take_food_no TEXT,
    create_time TEXT NOT NULL,
    update_time TEXT,
    UNIQUE (restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_local_setting_restaurant_id
    ON local_setting (restaurant_id);
`;

export const localSettingSchemas: Array<string> = [CREATE_LOCAL_SETTING_TABLE];
