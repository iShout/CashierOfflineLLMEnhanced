export const CREATE_RESTAURANT_REPORT_PRINT_TABLE = `
-- 报告打印表
CREATE TABLE IF NOT EXISTS restaurant_report_print (
    -- 主键 ID
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 餐厅 ID
    restaurant_id INTEGER NOT NULL,
    -- 服务员编号
    waiter_no TEXT,
    -- 打印开始时间
    print_start_time TEXT NOT NULL,
    -- 打印结束时间
    print_end_time TEXT NOT NULL,
    -- 打印类型
    print_type INTEGER NOT NULL,
    -- 票据编号
    receipt_id TEXT DEFAULT '' NOT NULL,
    -- 打印次数
    print_count INTEGER DEFAULT 0 NOT NULL,
    -- 创建时间
    create_time TEXT,
    -- 更新时间
    update_time TEXT,
    -- 报告内容
    report_json TEXT,
    -- 创建类型：1 手动，2 自动
    build_type INTEGER DEFAULT 1 NOT NULL,
    -- 推送状态：1 已推送，2 未推送
    push_status INTEGER DEFAULT 1 NOT NULL,
    -- 本地上传状态：1 已同步，2 未同步
    sync_status INTEGER DEFAULT 1 NOT NULL,
    -- 历史来源 POS，仅为兼容旧报告保留
    device_no TEXT
);

CREATE INDEX IF NOT EXISTS idx_restaurant_report_print_restaurant_id
    ON restaurant_report_print (restaurant_id);
`;

export const reportSchemas: Array<string> = [CREATE_RESTAURANT_REPORT_PRINT_TABLE];
