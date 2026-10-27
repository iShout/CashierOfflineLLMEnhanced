export const CREATE_FOOD_ORDER_TABLE = `
-- 订单信息表
CREATE TABLE IF NOT EXISTS food_order (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务器主键ID，本地 id 始终由 SQLite 生成
    server_id INTEGER,
    -- 餐厅主键ID
    restaurant_id INTEGER DEFAULT 0 NOT NULL,
    -- 座位表主键ID
    table_id INTEGER DEFAULT 0 NOT NULL,
    -- 服务员编号
    waiter_no TEXT,
    -- 用户编号
    user_no TEXT DEFAULT '' NOT NULL,
    -- 内部订单编号
    order_inner_no TEXT NOT NULL,
    -- 订单编号
    order_no TEXT NOT NULL,
    -- order_payment 表主键id
    order_payment_id INTEGER,
    -- 总金额
    total_amount INTEGER DEFAULT 0,
    -- sku总数
    total_count INTEGER,
    -- 服务费统计
    service_fee INTEGER,
    -- 顾客数量
    customer_num INTEGER,
    -- 餐厅类型
    restaurant_type INTEGER,
    -- 付款方式: 1.线上 2.线下
    payment_way INTEGER,
    -- 订单状态 1.待接单 2.已接单 3.已完成 4.已取消 5待取餐
    order_status INTEGER NOT NULL,
    -- 支付状态 1.未支付 2.支付成功 3.支付失败 4退款中 5已退款 6退款待处理 7退款失败 8取消退款
    payment_status INTEGER,
    -- 订单类型：1、主订单 2、加菜订单
    order_type INTEGER,
    -- 下单APP 1.用户端 2.服务员端 3.收银台 4.外卖 5.open-api 6.crm 7.手动录单
    order_app INTEGER,
    -- 订单的完成时间
    complete_time TEXT,
    -- 备注
    remark TEXT,
    -- 取消时备注
    cancel_remark TEXT,
    -- 订单小票打印状态 1未打印 2已打印 3失败
    order_print_status INTEGER DEFAULT 1,
    -- 支付小票打印状态 1未打印 2已打印 3失败
    payment_print_status INTEGER DEFAULT 1,
    -- 账单打印状态 1未打印 2已打印 3失败
    bill_print_status INTEGER DEFAULT 1,
    -- 创建时间
    create_time TEXT,
    -- 更新时间
    update_time TEXT,
    -- 减单备注
    edit_remark TEXT DEFAULT '' NOT NULL,
    -- 所属Regional Office餐厅id
    region_office_rest_id INTEGER,
    -- 所属Headquarter餐厅id
    headquarter_rest_id INTEGER,
    -- 是否含税 0不计算 1包含 2不包含
    tax_type INTEGER DEFAULT 0,
    -- 税费
    tax_amount INTEGER DEFAULT 0,
    -- 评论状态 1未评论 2已评论
    review_status INTEGER DEFAULT 1,
    -- 订单渠道: 1桌码点餐 2外卖点餐 3排队点餐 4grab 5foodPanda 6筷子生活 7菲快送 8其他
    order_channel INTEGER DEFAULT 1,
    -- 打包费
    package_fee INTEGER,
    -- 取餐号
    take_food_no TEXT,
    -- 顾客用餐方式 1堂食 2打包带走
    customer_dining_style INTEGER DEFAULT 1,
    -- 退款的交易ID
    refund_payment_id INTEGER,
    -- 退款时间
    refund_time TEXT,
    -- 订单序号（商户中递增）
    order_serial_number TEXT,
    -- 优惠券码
    coupon_code TEXT,
    -- 优惠券优惠金额
    coupon_amount INTEGER DEFAULT 0,
    -- 退款操作人（商户后台退款为正向操作人）
    refund_waiter_no TEXT,
    -- 历史来源 POS，仅为兼容旧数据保留；本地新订单允许为空
    device_no TEXT,
    UNIQUE (order_no)
);


CREATE INDEX IF NOT EXISTS idx_complete_time
    ON food_order (complete_time);

CREATE INDEX IF NOT EXISTS idx_coupon_code
    ON food_order (coupon_code);

CREATE INDEX IF NOT EXISTS idx_create_time
    ON food_order (create_time);

CREATE INDEX IF NOT EXISTS idx_order_inner_no
    ON food_order (order_inner_no);

CREATE INDEX IF NOT EXISTS idx_order_status_type_payment_status_complete_time_restaurant_id
    ON food_order (order_status, order_type, payment_status, complete_time, restaurant_id);

CREATE INDEX IF NOT EXISTS idx_payment_id
    ON food_order (order_payment_id);

CREATE INDEX IF NOT EXISTS idx_refund_time
    ON food_order (refund_time);

CREATE INDEX IF NOT EXISTS idx_res_id_complete_time_status_type_app
    ON food_order (
        restaurant_id,
        complete_time,
        order_status,
        order_type,
        payment_status,
        order_app
    );

CREATE INDEX IF NOT EXISTS idx_restaurant_id_order_inner_no
    ON food_order (restaurant_id, order_inner_no);

CREATE INDEX IF NOT EXISTS idx_restaurant_id_table_id
    ON food_order (restaurant_id, table_id);

CREATE INDEX IF NOT EXISTS idx_user_no
    ON food_order (user_no);
`;

export const CREATE_FOOD_ORDER_PRINT_INFO_TABLE = `
-- 打印订单信息表
CREATE TABLE IF NOT EXISTS food_order_print_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务器主键ID，本地 id 始终由 SQLite 生成
    server_id INTEGER,
    -- 餐厅主键ID
    restaurant_id INTEGER DEFAULT 0 NOT NULL,
    -- 订单编号
    order_no TEXT NOT NULL,
    -- 订单类型 1 ORDER 2 PAYMENT 3 BILL
    print_type INTEGER DEFAULT 1 NOT NULL,
    -- 关联类型 1 orderNo 2 order_inner_no
    association_type INTEGER DEFAULT 1 NOT NULL,
    -- 云打印机设备号；离线 Windows 收银无云打印机，新生成记录应保持 NULL，不等同于 POS 机 device_no。
    device_no TEXT,
    -- 打印订单 ID
    print_order_id TEXT,
    -- 打印费用 ID
    print_bill_id TEXT,
    -- 打印支付 ID
    print_payment_id TEXT,
    -- 打印退款 ID
    print_refund_id TEXT,
    -- 订单打印内容
    content_json TEXT,
    create_time TEXT,
    update_time TEXT,
    UNIQUE (print_bill_id),
    UNIQUE (print_order_id),
    UNIQUE (print_payment_id)
);


CREATE INDEX IF NOT EXISTS idx_order_no
    ON food_order_print_info (order_no);

CREATE INDEX IF NOT EXISTS idx_restaurant_id_order_no
    ON food_order_print_info (restaurant_id, order_no);
`;

export const CREATE_ORDER_DETAIL_TABLE = `
-- 订单详情表
CREATE TABLE IF NOT EXISTS order_detail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务器主键ID，本地 id 始终由 SQLite 生成
    server_id INTEGER,
    -- 订单主键 ID
    order_id INTEGER DEFAULT 0 NOT NULL,
    -- SKU ID
    sku_id INTEGER DEFAULT 0 NOT NULL,
    -- 购买数量
    count INTEGER DEFAULT 0,
    -- 菜品金额
    sku_amount INTEGER DEFAULT 0,
    -- 选项附加金额
    option_amount INTEGER DEFAULT 0,
    -- 菜品状态：1. 加菜菜品 2. 取消菜品
    detail_type INTEGER NOT NULL,
    -- 详情快照
    detail_snapshot TEXT,
    create_time TEXT NOT NULL,
    update_time TEXT,
    -- 减单的源 ID
    parent_id INTEGER DEFAULT 0 NOT NULL
);


CREATE INDEX IF NOT EXISTS idx_order_id
    ON order_detail (order_id);

CREATE INDEX IF NOT EXISTS idx_sku_id
    ON order_detail (sku_id);
`;

export const CREATE_ORDER_DETAIL_SNAP_TABLE = `
-- 订单菜品快照
CREATE TABLE IF NOT EXISTS order_detail_snap (
    -- 主键id
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务器主键ID，本地 id 始终由 SQLite 生成
    server_id INTEGER,
    -- food_order 表主键id
    food_order_id INTEGER DEFAULT 0,
    -- order_detail 表主键id
    order_detail_id INTEGER DEFAULT 0,
    -- 菜品名称
    product_name TEXT NOT NULL,
    -- 菜单图片
    menu_img_url TEXT,
    -- 菜品数量
    product_count INTEGER DEFAULT 1,
    -- sku名称
    sku_name TEXT NOT NULL,
    -- sku价格
    sku_price INTEGER DEFAULT 0,
    -- 是否多规格 1.是 2.否
    variant INTEGER DEFAULT 2 NOT NULL,
    -- 当前订单所选option名称与option价格的键值对
    option_item_json TEXT,
    -- sku版本号
    sku_version INTEGER DEFAULT 1,
    create_time TEXT NOT NULL,
    update_time TEXT
);


CREATE INDEX IF NOT EXISTS idx_order_detail_id
    ON order_detail_snap (order_detail_id);

CREATE INDEX IF NOT EXISTS idx_order_detail_snap_food_order_id
    ON order_detail_snap (food_order_id);
`;

export const CREATE_ORDER_PAYMENT_TABLE = `
-- 订单支付表
CREATE TABLE IF NOT EXISTS order_payment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务器主键ID，本地 id 始终由 SQLite 生成
    server_id INTEGER,
    -- 餐厅主键ID
    restaurant_id INTEGER DEFAULT 0 NOT NULL,
    -- 付款的用户编号
    restaurant_user_id TEXT,
    -- 用户编号
    user_no TEXT DEFAULT '' NOT NULL,
    -- 内部订单编号
    order_inner_no TEXT NOT NULL,
    -- 上游订单号
    mch_order_id TEXT NOT NULL,
    -- 交易id
    transaction_id TEXT,
    -- 购买金额
    amount INTEGER DEFAULT 0,
    -- 支付状态 1.未支付 2.支付成功 3.支付失败 4退款中 5 已退款 6 退款待处理 7 退款失败 8取消退款
    transaction_status INTEGER DEFAULT 0,
    -- 支付产品类型 0 现金 1 订单支付 PaymentLink 2 静态VA BillPayment 3 BankTransfer 4 QrStatic (静态) 5 QrDynamic (动态)
    pay_product_type INTEGER DEFAULT 0,
    -- 渠道全名
    channel_code TEXT,
    -- 支付平台
    payment_platform TEXT NOT NULL,
    -- 是否为餐饮订单最终实际支付的订单: 1是 2否
    final_payment_status INTEGER DEFAULT 2 NOT NULL,
    -- 渠道流水创建时间
    transaction_create_time TEXT,
    -- 渠道流水更新时间
    transaction_return_time TEXT,
    create_time TEXT,
    update_time TEXT,
    -- 实际支付金额
    real_amount INTEGER,
    -- 优惠人数
    discount_number INTEGER,
    -- 优惠卡号
    discount_no TEXT,
    -- 折扣类型 1、PWD整单折扣，2、普通折扣 3、pwd按人数折扣 4、sc
    discount_type INTEGER,
    -- 实际税收金额
    real_tax_amount INTEGER DEFAULT 0,
    -- 实际服务费金额
    real_service_fee INTEGER,
    -- 系统交易号（swifood），打印一次加一次，这个大小最多打印十次
    system_transaction_no TEXT,
    -- 退款序号
    refund_serial_no TEXT,
    -- 优惠券优惠金额
    coupon_amount INTEGER,
    -- 现金收款金额
    cash_receipt_amount INTEGER DEFAULT 0,
    -- 退款备注
    refund_remark TEXT,
    -- 折扣人名称
    discounter_name TEXT,
    -- 折扣有效期
    discount_validity_period TEXT,
    -- 折扣序号
    discount_serial_no TEXT,
    -- 折扣优惠金额
    discount_amount INTEGER,
    -- 收据号
    receipt_no TEXT,
    -- 支付订单创建操作人
    waiter_id INTEGER,
    -- 实际顾客人数
    real_customer_num INTEGER,
    -- 附加费
    surcharge INTEGER DEFAULT 0,
    -- 普通折扣类型 1整单折扣 2.菜品折扣
    promo_discount_type INTEGER DEFAULT 1,
    -- 历史来源 POS，仅为兼容旧数据保留；本地支付允许为空。
    device_no TEXT,
    UNIQUE (mch_order_id)
);


CREATE INDEX IF NOT EXISTS idx_order_payment_order_inner_no
    ON order_payment (order_inner_no);

CREATE INDEX IF NOT EXISTS idx_order_inner_no_transaction_status_final_payment_status
    ON order_payment (order_inner_no, transaction_status, final_payment_status);

CREATE INDEX IF NOT EXISTS idx_order_payment_restaurant_id_order_inner_no
    ON order_payment (restaurant_id, order_inner_no);

CREATE INDEX IF NOT EXISTS idx_transaction_create_time
    ON order_payment (transaction_create_time);

CREATE INDEX IF NOT EXISTS idx_transaction_return_time
    ON order_payment (transaction_return_time);

CREATE INDEX IF NOT EXISTS uk_transaction_id
    ON order_payment (transaction_id);
`;

export const CREATE_ORDER_PAYMENT_INFO_TABLE = `
-- 订单支付信息表
CREATE TABLE IF NOT EXISTS order_payment_info (
    -- 主键id
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务器主键ID，本地 id 始终由 SQLite 生成
    server_id INTEGER,
    -- order_payment 表主键id
    order_payment_id INTEGER DEFAULT 0,
    -- 交易id
    transaction_id TEXT,
    -- 上游订单号
    mch_order_id TEXT NOT NULL,
    -- 购买金额
    amount INTEGER DEFAULT 0,
    -- 交易账单金额(用户承担手续费时该字段未包含手续费)
    transaction_amount_bill INTEGER,
    -- 菲律宾payment_fee交易手续费
    fee INTEGER,
    -- 结算金额
    net_settlement INTEGER,
    -- 响应参数
    response_param TEXT,
    -- 回调参数
    callback_param TEXT,
    create_time TEXT NOT NULL,
    update_time TEXT,
    -- 渠道参考号
    channel_reference_no TEXT,
    -- 请求ip
    request_ip TEXT,
    UNIQUE (transaction_id),
    UNIQUE (order_payment_id)
);


CREATE INDEX IF NOT EXISTS idx_order_payment_info_mch_order_id
    ON order_payment_info (mch_order_id);
`;

export const CREATE_ORDER_PAYMENT_TAX_TABLE = `
-- 订单支付税费表
CREATE TABLE IF NOT EXISTS order_payment_tax (
    -- 主键id
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务器主键ID，本地 id 始终由 SQLite 生成
    server_id INTEGER,
    -- order_payment 表主键id
    order_payment_id INTEGER DEFAULT 0,
    -- 应税销售额
    vatable_sales INTEGER,
    -- 税额
    tax_amount INTEGER,
    -- 免税商品税前、折前价格
    vat_exempt_sales INTEGER DEFAULT 0,
    -- 免除税费
    vat_exemption INTEGER,
    -- 零税率销售额
    zero_rated_sales INTEGER DEFAULT 0,
    create_time TEXT NOT NULL,
    update_time TEXT,
    -- PWD折扣金额
    pwd_discount INTEGER,
    -- 减免 VAT
    less_vat INTEGER,
    -- 普通折扣金额
    promo_discount INTEGER,
    -- vat注册状态
    vat_register_status INTEGER,
    UNIQUE (order_payment_id)
);

`;

export const CREATE_ORDER_STATUS_CHANGE_TABLE = `
-- 订单状态变化表
CREATE TABLE IF NOT EXISTS order_status_change (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务器主键ID，本地 id 始终由 SQLite 生成
    server_id INTEGER,
    -- 内部订单编号
    order_inner_no TEXT NOT NULL,
    -- 状态类型 1桌码 2外卖 3排队点餐
    status_type INTEGER DEFAULT 1 NOT NULL,
    -- 订单操作 1顾客下单 2商家接单 3开始配送 4到达 5取消 6退款中 7退款成功 8退款失败 9等待骑手（grab）10待取货(grab) 11待取餐（排队点餐）12已支付 13支付失败 14已完成
    status INTEGER NOT NULL,
    -- 展示类型 1展示 2不展示
    display_type INTEGER DEFAULT 1 NOT NULL,
    -- 操作人id
    operator_id INTEGER,
    -- 备注
    remark TEXT,
    -- 创建时间
    create_time TEXT NOT NULL,
    -- 订单编号
    order_no TEXT,
    -- 操作人名称
    operator_name TEXT
);


CREATE INDEX IF NOT EXISTS idx_order_status_change_order_inner_no
    ON order_status_change (order_inner_no);
`;

export const CREATE_WAITER_CLOCK_ORDER_TABLE = `
-- 订单班次归属表
CREATE TABLE IF NOT EXISTS waiter_clock_order (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务器主键ID，本地 id 始终由 SQLite 生成
    server_id INTEGER,
    -- 餐厅主键ID
    restaurant_id INTEGER NOT NULL,
    -- 内部订单编号
    order_inner_no TEXT NOT NULL,
    -- 班次打卡记录id 默认0为Self-service
    restaurant_waiter_clock_record_id INTEGER DEFAULT 0 NOT NULL,
    -- 记录订单类型 1正向订单 2退款订单 3取消订单
    record_the_order_type INTEGER NOT NULL,
    -- 服务员类型 1.true waiter 2.Self-service
    waiter_type INTEGER NOT NULL,
    -- 新老报告状态 1老报告 2新报告
    new_old_report_status INTEGER,
    -- 创建时间
    create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    -- 更新时间
    update_time TEXT
);

`;

export const CREATE_ORDER_COUPON_SNAPSHOT_TABLE = `
-- 订单优惠券快照表；支付完成后从后端订单详情抓取，用于本地订单详情展示。
CREATE TABLE IF NOT EXISTS order_coupon_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 关联的内部订单编号，一个订单可对应多张优惠券
    related_order TEXT NOT NULL,
    -- 优惠券名称
    coupon_name TEXT,
    -- 优惠券批次/ID
    coupon_batch_no TEXT,
    -- 优惠券票号
    coupon_code TEXT,
    -- 优惠券优惠金额
    coupon_amount INTEGER DEFAULT 0,
    -- 顾客编号
    user_no TEXT,
    -- 顾客姓名
    user_name TEXT,
    create_time TEXT NOT NULL,
    update_time TEXT
);


CREATE INDEX IF NOT EXISTS idx_order_coupon_snapshot_related_order
    ON order_coupon_snapshot (related_order);

CREATE INDEX IF NOT EXISTS idx_order_coupon_snapshot_coupon_code
    ON order_coupon_snapshot (coupon_code);

CREATE UNIQUE INDEX IF NOT EXISTS uk_order_coupon_snapshot_order_code
    ON order_coupon_snapshot (related_order, coupon_code)
    WHERE coupon_code IS NOT NULL AND coupon_code != '';
`;

export const CREATE_ORDER_SUMMARY_TABLE = `
-- 订单统计表，每日所有订单汇总成一条
CREATE TABLE IF NOT EXISTS order_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务器主键ID，本地 id 始终由 SQLite 生成
    server_id INTEGER,
    -- 餐厅主键ID
    restaurant_id INTEGER DEFAULT 0 NOT NULL,
    -- 总金额
    total_amount INTEGER,
    -- 总订单数
    total_orders INTEGER,
    -- 线上金额
    online_amount INTEGER,
    -- 线上订单数
    online_orders INTEGER,
    -- 手续费
    fee INTEGER,
    -- 线下金额
    cash_amount INTEGER,
    -- 线下订单数
    cash_orders INTEGER,
    -- 去手续费线上总额
    net_settlement INTEGER,
    -- 未含税销售额
    vat_sales INTEGER,
    -- 税费
    vat_amount INTEGER,
    -- 免税商品税前、折前价格
    vat_exempt_sales INTEGER,
    -- 免税的税费金额
    vat_exemption INTEGER,
    -- 默认0，免税商品
    zero_rated_sales INTEGER,
    -- PWD折扣金额
    pwd_discount INTEGER,
    -- 减免 VAT
    less_vat INTEGER,
    -- 普通折扣金额
    promo_discount INTEGER,
    -- 订单渠道 1线下订单 2线上订单 3.all
    order_channel INTEGER DEFAULT 1,
    -- 统计日期
    trans_date TEXT,
    create_time TEXT,
    update_time TEXT,
    -- sc折扣
    sc_discount INTEGER,
    -- 三方服务费（目前就grab配送费）
    third_party_fee INTEGER DEFAULT 0,
    -- 服务费统计
    service_fee INTEGER DEFAULT 0,
    -- 历史来源 POS，仅为兼容旧汇总记录保留
    device_no TEXT
);


CREATE INDEX IF NOT EXISTS idx_order_summary_restaurant_id
    ON order_summary (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_order_summary_trans_date
    ON order_summary (trans_date);
`;

export const orderSchemas: Array<string> = [
  CREATE_FOOD_ORDER_TABLE,
  CREATE_FOOD_ORDER_PRINT_INFO_TABLE,
  CREATE_ORDER_DETAIL_TABLE,
  CREATE_ORDER_DETAIL_SNAP_TABLE,
  CREATE_ORDER_PAYMENT_TABLE,
  CREATE_ORDER_PAYMENT_INFO_TABLE,
  CREATE_ORDER_PAYMENT_TAX_TABLE,
  CREATE_ORDER_STATUS_CHANGE_TABLE,
  CREATE_WAITER_CLOCK_ORDER_TABLE,
  CREATE_ORDER_COUPON_SNAPSHOT_TABLE,
  CREATE_ORDER_SUMMARY_TABLE,
];
