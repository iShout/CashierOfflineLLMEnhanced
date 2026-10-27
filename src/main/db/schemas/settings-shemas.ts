export const CREATE_PAYMENT_CHANNEL_TABLE = `
CREATE TABLE IF NOT EXISTS payment_channel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER DEFAULT 0 NOT NULL,
    payment_channel_no TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    type INTEGER DEFAULT 0 NOT NULL,
    pay_product_type INTEGER DEFAULT 0,
    logo TEXT,
    del_status INTEGER DEFAULT 1,
    create_time TEXT NOT NULL,
    update_time TEXT,
    country_name TEXT DEFAULT 'Philippines',
    refund_status INTEGER DEFAULT 2,
    refund_time_limit INTEGER
);

CREATE INDEX IF NOT EXISTS idx_payment_channel_no
    ON payment_channel (payment_channel_no);
`;

export const CREATE_RESTAURANT_TABLE = `
CREATE TABLE IF NOT EXISTS restaurant (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_no TEXT,
    restaurant_no TEXT,
    name TEXT NOT NULL,
    restaurant_type INTEGER DEFAULT 0,
    restaurant_type_detail INTEGER,
    manager_id INTEGER DEFAULT 0 NOT NULL,
    create_time TEXT,
    update_time TEXT,
    merchant_name TEXT DEFAULT '' NOT NULL,
    role_step_id INTEGER,
    father_rest_id INTEGER,
    father_rest_id_list TEXT,
    menu_activation INTEGER,
    display_name TEXT,
    payment_capability INTEGER,
    country_name TEXT DEFAULT 'Philippines',
    register_type INTEGER DEFAULT 1 NOT NULL,
    UNIQUE (restaurant_no)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_merchant_no
    ON restaurant (merchant_no);
`;

export const CREATE_RESTAURANT_AREA_TABLE = `
CREATE TABLE IF NOT EXISTS restaurant_area (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area_uuid TEXT,
    name TEXT,
    restaurant_id INTEGER,
    operator_id INTEGER DEFAULT 0,
    del_status INTEGER DEFAULT 1,
    create_time TEXT,
    update_time TEXT,
    UNIQUE (area_uuid)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_area_operator_id
    ON restaurant_area (operator_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_area_restaurant_id
    ON restaurant_area (restaurant_id);
`;

export const CREATE_RESTAURANT_CHANNEL_SETTING_TABLE = `
CREATE TABLE IF NOT EXISTS restaurant_channel_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER DEFAULT 0,
    payment_channel_no TEXT,
    type INTEGER,
    used INTEGER DEFAULT 1,
    sort INTEGER,
    create_time TEXT NOT NULL,
    update_time TEXT,
    UNIQUE (restaurant_id, payment_channel_no, type)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_channel_setting_restaurant_id
    ON restaurant_channel_setting (restaurant_id);
`;

export const CREATE_RESTAURANT_LABEL_PRINTER_SETTING_TABLE = `
CREATE TABLE IF NOT EXISTS restaurant_label_printer_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mac_id TEXT,
    restaurant_id INTEGER NOT NULL,
    print_size_type INTEGER DEFAULT 1 NOT NULL,
    nick_name TEXT,
    remark TEXT,
    print_language INTEGER DEFAULT 1 NOT NULL,
    create_time TEXT,
    update_time TEXT
);

CREATE INDEX IF NOT EXISTS idx_restaurant_label_printer_setting_restaurant_id
    ON restaurant_label_printer_setting (restaurant_id);
`;

export const CREATE_RESTAURANT_WAITER_BLUE_TOOTH_SETTING_TABLE = `
CREATE TABLE IF NOT EXISTS restaurant_waiter_blue_tooth_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    waiter_id INTEGER NOT NULL,
    mac_id TEXT,
    paper_width INTEGER,
    printer_type_id INTEGER,
    language INTEGER,
    restaurant_name_display INTEGER DEFAULT 1,
    number_of_copy INTEGER,
    connect_status INTEGER,
    create_time TEXT,
    update_time TEXT,
    nick_name TEXT,
    remark TEXT,
    sn_number TEXT,
    printer_type INTEGER DEFAULT 1 NOT NULL,
    printer_font_size INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_restaurant_waiter_blue_tooth_setting_restaurant_waiter
    ON restaurant_waiter_blue_tooth_setting (restaurant_id, waiter_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_waiter_blue_tooth_setting_mac_id
    ON restaurant_waiter_blue_tooth_setting (mac_id);
`;

export const CREATE_RESTAURANT_OPERATION_CONFIG_TABLE = `
CREATE TABLE IF NOT EXISTS restaurant_operation_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    tin_number TEXT,
    restaurant_address TEXT,
    create_time TEXT,
    update_time TEXT,
    vat_register_status INTEGER DEFAULT 1,
    ptu_number TEXT,
    ptu_issue_date TEXT,
    min_number TEXT,
    taxpayer_name TEXT,
    operator_id INTEGER,
    submit_time TEXT,
    audit_time TEXT,
    audit_status INTEGER,
    auth_type INTEGER DEFAULT 1 NOT NULL,
    serial_number TEXT,
    trade_name TEXT,
    -- 历史来源 POS，仅为兼容旧 BIR 配置保留
    device_no TEXT
);

CREATE INDEX IF NOT EXISTS idx_restaurant_operation_config_restaurant_id
    ON restaurant_operation_config (restaurant_id);
`;

export const CREATE_RESTAURANT_POS_DOWNLOAD_FILE_SETTING_TABLE = `
CREATE TABLE IF NOT EXISTS restaurant_pos_download_file_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    mall_type INTEGER,
    external_no TEXT,
    external_id TEXT,
    pos_id TEXT,
    remark TEXT,
    create_time TEXT,
    update_time TEXT,
    file_download_url TEXT,
    UNIQUE (restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_pos_download_file_setting_restaurant_id
    ON restaurant_pos_download_file_setting (restaurant_id);
`;

export const CREATE_RESTAURANT_PRINTER_CATEGORY_TABLE = `
CREATE TABLE IF NOT EXISTS restaurant_printer_category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_printer_id INTEGER,
    category_id INTEGER,
    mac_id TEXT,
    create_time TEXT,
    update_time TEXT,
    restaurant_id INTEGER,
    print_type INTEGER DEFAULT 1
);
`;

export const CREATE_RESTAURANT_SETTING_TABLE = `
CREATE TABLE IF NOT EXISTS restaurant_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER,
    mode INTEGER,
    acceptance INTEGER,
    completion INTEGER,
    pwd_discount_status INTEGER DEFAULT 2,
    pwd_calculation_type INTEGER DEFAULT 2,
    service_fee_status INTEGER,
    service_fee_type INTEGER,
    service_fee INTEGER DEFAULT 0,
    vat_included INTEGER,
    inventory INTEGER DEFAULT 2,
    inventory_type INTEGER DEFAULT 2,
    clock_status INTEGER DEFAULT 2,
    bir_status INTEGER DEFAULT 2,
    cashier_mode INTEGER DEFAULT 1,
    create_time TEXT NOT NULL,
    update_time TEXT,
    tax_fee INTEGER DEFAULT 2,
    auto_print_payment INTEGER DEFAULT 2 NOT NULL,
    clock_photo_status INTEGER DEFAULT 2,
    table_order_status INTEGER DEFAULT 1 NOT NULL,
    UNIQUE (restaurant_id)
);
`;

export const CREATE_RESTAURANT_TABLE_TABLE = `
CREATE TABLE IF NOT EXISTS restaurant_table (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_uuid TEXT,
    name TEXT NOT NULL,
    seat INTEGER,
    fee INTEGER,
    area_id INTEGER NOT NULL,
    restaurant_id INTEGER,
    operator_id INTEGER DEFAULT 0,
    del_status INTEGER DEFAULT 1,
    create_time TEXT,
    update_time TEXT,
    UNIQUE (table_uuid)
);
`;

export const CREATE_RESTAURANT_WAIT_SETTING_TABLE = `
CREATE TABLE IF NOT EXISTS restaurant_wait_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER,
    status INTEGER DEFAULT 2 NOT NULL,
    acceptance INTEGER,
    dining_out INTEGER,
    completion INTEGER,
    dining_out_time INTEGER,
    completion_time INTEGER,
    create_time TEXT NOT NULL,
    update_time TEXT,
    UNIQUE (restaurant_id)
);
`;

export const settingsSchemas: Array<string> = [
    CREATE_PAYMENT_CHANNEL_TABLE,
    CREATE_RESTAURANT_TABLE,
    CREATE_RESTAURANT_AREA_TABLE,
    CREATE_RESTAURANT_CHANNEL_SETTING_TABLE,
    CREATE_RESTAURANT_LABEL_PRINTER_SETTING_TABLE,
    CREATE_RESTAURANT_WAITER_BLUE_TOOTH_SETTING_TABLE,
    CREATE_RESTAURANT_OPERATION_CONFIG_TABLE,
    CREATE_RESTAURANT_POS_DOWNLOAD_FILE_SETTING_TABLE,
    CREATE_RESTAURANT_PRINTER_CATEGORY_TABLE,
    CREATE_RESTAURANT_SETTING_TABLE,
    CREATE_RESTAURANT_TABLE_TABLE,
    CREATE_RESTAURANT_WAIT_SETTING_TABLE
];
