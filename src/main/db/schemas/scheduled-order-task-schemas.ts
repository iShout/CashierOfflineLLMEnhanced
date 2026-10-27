export const CREATE_SCHEDULED_ORDER_TASK_TABLE = `
CREATE TABLE IF NOT EXISTS scheduled_order_task (
    -- 本地任务记录主键
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 任务幂等键，格式：restaurant_id:order_inner_no:task_type；同一订单同类任务只保留一条
    task_key TEXT NOT NULL,
    -- 任务所属餐厅的本地 restaurant.id
    restaurant_id INTEGER NOT NULL,
    -- 历史任务来源 POS，仅为兼容旧任务保留
    device_no TEXT,
    -- 被操作整单的内部订单号，同一个主单和加菜单共用此编号
    order_inner_no TEXT NOT NULL,
    -- 任务类型：QUEUE_AUTO_PREPARE=排队 Taken→Ready；QUEUE_AUTO_PICKUP=排队 Ready→Complete；
    -- QUEUE_UNPAID_CANCEL=排队订单创建后未支付自动取消；TABLE_ORDER_AUTO_COMPLETE=桌码订单支付三天后自动完成；
    -- QUEUE_AUTO_SERVE、PAID_ORDER_AUTO_COMPLETE=旧版本兼容类型，新任务不再创建
    task_type TEXT NOT NULL,
    -- 计划执行时间，Unix Epoch 毫秒时间戳
    execute_at_ms INTEGER NOT NULL,
    -- 任务状态：0=PENDING待执行；1=RUNNING执行中；2=SUCCEEDED执行成功；
    -- 3=SKIPPED订单状态已变化无需执行；4=FAILED最终失败；5=CANCELLED已取消
    status INTEGER NOT NULL DEFAULT 0,
    -- 任务创建时的配置快照 JSON；常见字段：delay_level时间枚举、delay_ms实际毫秒、source触发来源
    payload_json TEXT,
    -- 执行失败后的累计重试次数
    retry_count INTEGER NOT NULL DEFAULT 0,
    -- RUNNING 任务的领取租约截止时间，Unix Epoch 毫秒；防止进程退出后任务永久卡住
    lease_until_ms INTEGER,
    -- 最近一次执行失败的错误信息；成功或重新激活后清空
    last_error TEXT,
    -- 任务记录创建时间，跟 food_order 一致使用系统本地时间，格式 YYYY-MM-DD HH:mm:ss
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    -- 任务记录最后更新时间，跟 food_order 一致使用系统本地时间，格式 YYYY-MM-DD HH:mm:ss
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    -- 最近一次被执行器领取为 RUNNING 的系统本地时间
    started_at TEXT,
    -- 进入 SUCCEEDED、SKIPPED、FAILED 或 CANCELLED 终态的系统本地时间；终态满七天后可清理
    finished_at TEXT,
    UNIQUE (task_key)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_order_task_restaurant_status_execute_at
    ON scheduled_order_task (restaurant_id, status, execute_at_ms);

CREATE INDEX IF NOT EXISTS idx_scheduled_order_task_order_type
    ON scheduled_order_task (order_inner_no, task_type);

CREATE INDEX IF NOT EXISTS idx_scheduled_order_task_status_finished_at
    ON scheduled_order_task (status, finished_at);
`;

export const scheduledOrderTaskSchemas = [CREATE_SCHEDULED_ORDER_TASK_TABLE];
