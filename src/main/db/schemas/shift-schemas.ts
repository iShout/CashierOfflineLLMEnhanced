export const CREATE_RESTAURANT_WAITER_CLOCK_RECORD_TABLE = `
-- 员工打卡记录表
CREATE TABLE IF NOT EXISTS restaurant_waiter_clock_record (
    -- 主键 ID
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务端主键，本地新建记录在服务端确认前保持为空
    server_id INTEGER,
    -- 餐厅 ID
    restaurant_id INTEGER NOT NULL,
    -- 服务员 ID
    restaurant_waiter_id INTEGER NOT NULL,
    -- 上班时间
    working_time TEXT NOT NULL,
    -- 上班打卡 URL
    working_url TEXT,
    -- 上班打卡本地图片资源 ID
    clock_in_local_image TEXT DEFAULT NULL,
    -- 下班时间
    off_time TEXT,
    -- 下班打卡 URL
    off_url TEXT,
    -- 下班打卡本地图片资源 ID
    clock_out_local_image TEXT DEFAULT NULL,
    -- 上班时长
    working_duration INTEGER DEFAULT 0 NOT NULL,
    -- 上一次休息开始时间
    rest_start_time TEXT,
    -- 休息时长
    rest_duration INTEGER DEFAULT 0 NOT NULL,
    -- 服务员状态：1 上班中，2 休息中，3 已完成
    waiter_status INTEGER DEFAULT 1 NOT NULL,
    -- 打卡账号 ID
    waiter_clock_id INTEGER NOT NULL,
    -- 逻辑删除：1 未删除，2 已删除
    del_status INTEGER DEFAULT 1 NOT NULL,
    -- 创建时间
    create_time TEXT,
    -- 修改时间
    update_time TEXT,
    -- 报告内容
    report_json TEXT,
    -- 新旧报告：1 旧报告，2 新报告
    new_old_report_status INTEGER DEFAULT 1 NOT NULL,
    -- 历史来源 POS，仅为兼容旧打卡记录保留
    device_no TEXT
);

CREATE INDEX IF NOT EXISTS idx_restaurant_waiter_clock_record_off_time
    ON restaurant_waiter_clock_record (off_time);

CREATE INDEX IF NOT EXISTS idx_restaurant_waiter_clock_record_restaurant_id
    ON restaurant_waiter_clock_record (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_waiter_clock_record_restaurant_waiter_id
    ON restaurant_waiter_clock_record (restaurant_waiter_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_waiter_clock_record_working_time
    ON restaurant_waiter_clock_record (working_time);

`;

export const CREATE_RESTAURANT_WAITER_ALLOWANCE_TABLE = `
-- 餐厅员工资金表
CREATE TABLE IF NOT EXISTS restaurant_waiter_allowance (
    -- 主键 ID
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务端主键，本地新建记录在服务端确认前保持为空
    server_id INTEGER,
    -- 餐厅 ID
    restaurant_id INTEGER,
    -- 打卡记录 ID
    clock_id INTEGER,
    -- 开业资金
    opening_fund INTEGER,
    -- 下班资金
    cash_on_hand INTEGER,
    -- 非日常业务取出资金
    less_withdrawal INTEGER,
    -- 服务员 ID
    waiter_id INTEGER,
    -- 开业时间
    opening_time TEXT,
    -- 结束资金录入时间
    end_recording_time TEXT,
    -- 创建时间
    create_time TEXT NOT NULL,
    -- 修改时间
    update_time TEXT
);

CREATE INDEX IF NOT EXISTS idx_restaurant_waiter_allowance_clock_id
    ON restaurant_waiter_allowance (clock_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_waiter_allowance_restaurant_id
    ON restaurant_waiter_allowance (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_waiter_allowance_waiter_id
    ON restaurant_waiter_allowance (waiter_id);

`;

export const CREATE_WITHDRAWAL_RECORD_TABLE = `
-- 提现记录表
CREATE TABLE IF NOT EXISTS withdrawal_record (
    -- 主键 ID
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务端主键，本地新建记录在服务端确认前保持为空
    server_id INTEGER,
    -- 餐厅 ID
    restaurant_id INTEGER NOT NULL,
    -- 打卡记录 ID
    clock_id INTEGER NOT NULL,
    -- 员工资金记录 ID
    restaurant_waiter_allowance_id INTEGER NOT NULL,
    -- 本次取出资金
    once_less_withdrawal INTEGER NOT NULL,
    -- 取出备注
    remark TEXT NOT NULL,
    -- 服务员 ID
    waiter_id INTEGER NOT NULL,
    -- 创建时间
    create_time TEXT NOT NULL,
    -- 修改时间
    update_time TEXT
);

`;

export const shiftSchemas: Array<string> = [
  CREATE_RESTAURANT_WAITER_CLOCK_RECORD_TABLE,
  CREATE_RESTAURANT_WAITER_ALLOWANCE_TABLE,
  CREATE_WITHDRAWAL_RECORD_TABLE,
];
