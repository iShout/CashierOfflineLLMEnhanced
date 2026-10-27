export const CREATE_RESTAURANT_WAITER_TABLE = `
-- 服务员
CREATE TABLE IF NOT EXISTS restaurant_waiter (
    -- 主键id
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 服务员编号
    waiter_no TEXT,
    -- 餐厅id
    restaurant_id INTEGER,
    -- 名称
    name TEXT,
    -- 用户邮箱或手机号
    account TEXT,
    -- 密码
    password TEXT NOT NULL,
    -- 是否启用 1=启用, 2=禁用
    on_off INTEGER DEFAULT 1 NOT NULL,
    -- 上次登录设备
    last_device TEXT,
    -- 上次登录时间
    last_login_time TEXT,
    -- 创建人id
    creator INTEGER DEFAULT 0 NOT NULL,
    -- fcm_token
    fcm_token TEXT,
    -- 收银模式 1桌台收银 3排队点餐
    cashier_mode INTEGER DEFAULT 1 NOT NULL,
    create_time TEXT,
    update_time TEXT,
    -- 考勤状态 1开启 2关闭
    clock_status INTEGER DEFAULT 1 NOT NULL,
    -- 自助下单模式 1开启 2关闭 默认关闭
    self_order_mode INTEGER DEFAULT 2 NOT NULL,
    UNIQUE (account, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_id
    ON restaurant_waiter (restaurant_id);
`;

export const CREATE_SYS_PERMISSION_TABLE = `
-- 系统权限表
CREATE TABLE IF NOT EXISTS sys_permission (
    -- 主键id
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 权限代码名称
    code TEXT DEFAULT '' NOT NULL,
    -- 创建时间
    create_time TEXT,
    -- 更新时间
    update_time TEXT,
    -- 权限路径
    url TEXT DEFAULT '' NOT NULL,
    -- 平台标识 MGR:运营 MCH:商户 APP:用户 WAITER:服务端
    platform TEXT DEFAULT 'MGR' NOT NULL,
    -- 名称
    name TEXT DEFAULT '' NOT NULL,
    -- 所属类目名称
    category TEXT DEFAULT '' NOT NULL,
    -- 国家名称
    country_name TEXT DEFAULT 'Philippines' NOT NULL,
    UNIQUE (code, country_name)
);
`;

export const CREATE_SYS_ROLE_TABLE = `
-- 系统角色
CREATE TABLE IF NOT EXISTS sys_role (
    -- 主键id
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 角色名称
    role_name TEXT DEFAULT '' NOT NULL,
    -- 状态 1：开启 2：关闭
    status INTEGER DEFAULT 1 NOT NULL,
    restaurant_id INTEGER,
    -- 备注
    remark TEXT DEFAULT '',
    create_time TEXT,
    update_time TEXT,
    -- 编辑人id
    editor INTEGER DEFAULT 0 NOT NULL,
    -- 平台标识 MGR:运营 MCH:商户 APP:用户 WAITER:服务端
    platform TEXT DEFAULT 'MGR' NOT NULL,
    -- 编辑人名称
    editor_name TEXT DEFAULT '' NOT NULL
);
`;

export const CREATE_SYS_ROLE_PERMISSION_TABLE = `
-- 系统角色权限关联表
CREATE TABLE IF NOT EXISTS sys_role_permission (
    -- 主键id
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 角色id
    role_id INTEGER DEFAULT 0 NOT NULL,
    -- 权限id
    permission_id INTEGER DEFAULT 0 NOT NULL,
    -- 创建时间
    create_time TEXT,
    -- 更新时间
    update_time TEXT,
    -- 平台标识 MGR:运营, MCH:商户 APP:用户app WAITER:服务端
    platform TEXT DEFAULT 'MGR' NOT NULL
);
`;

export const CREATE_SYS_USER_ROLE_TABLE = `
-- 系统用户角色关联表
CREATE TABLE IF NOT EXISTS sys_user_role (
    -- 主键id
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 用户id
    user_id INTEGER DEFAULT 0 NOT NULL,
    -- 角色id
    role_id INTEGER DEFAULT 0 NOT NULL,
    -- 创建时间
    create_time TEXT,
    -- 更新时间
    update_time TEXT,
    -- 平台标识 MGR:运营 MCH:商户 APP:用户 WAITER:服务端
    platform TEXT DEFAULT 'MGR' NOT NULL
);
`;

export const permissionSchemas: Array<string> = [
  CREATE_RESTAURANT_WAITER_TABLE,
  CREATE_SYS_PERMISSION_TABLE,
  CREATE_SYS_ROLE_TABLE,
  CREATE_SYS_ROLE_PERMISSION_TABLE,
  CREATE_SYS_USER_ROLE_TABLE,
];
