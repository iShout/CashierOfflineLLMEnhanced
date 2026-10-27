export const CREATE_DISH_CATEGORY_TABLE = `
-- 菜单分类表
CREATE TABLE IF NOT EXISTS dish_category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 餐厅主键ID
    restaurant_id INTEGER DEFAULT 0 NOT NULL,
    -- 商户自定义分类名称
    mch_category_id TEXT,
    name TEXT NOT NULL,
    -- 分类编号
    category_no TEXT NOT NULL,
    -- 启用状态: 1.可用 2.不可用
    valid_status INTEGER DEFAULT 2 NOT NULL,
    -- 排序顺序
    sort INTEGER DEFAULT 0 NOT NULL,
    -- 最新操作人
    operator_id INTEGER DEFAULT 0,
    -- 类目图片地址
    img_url TEXT,
    -- 逻辑删除 1.未删除 2.已删除
    del_status INTEGER DEFAULT 1,
    -- 备注
    remark TEXT,
    create_time TEXT,
    update_time TEXT,
    UNIQUE (category_no)
);

CREATE INDEX IF NOT EXISTS idx_dish_category_name
    ON dish_category (name);

CREATE INDEX IF NOT EXISTS idx_dish_category_operator_id
    ON dish_category (operator_id);

CREATE INDEX IF NOT EXISTS idx_dish_category_restaurant_id_sort
    ON dish_category (restaurant_id, sort);
`;

export const CREATE_DISH_PRODUCT_TABLE = `
-- 菜品表
CREATE TABLE IF NOT EXISTS dish_product (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 菜单分类主键ID
    category_id INTEGER DEFAULT 0,
    -- 餐厅主键ID
    restaurant_id INTEGER DEFAULT 0 NOT NULL,
    -- 菜品编号
    product_no TEXT NOT NULL,
    -- 菜品名称
    name TEXT NOT NULL,
    -- 菜品概述
    brief TEXT,
    -- 菜品描述
    description TEXT,
    -- 排序顺序
    sort INTEGER DEFAULT 0 NOT NULL,
    -- 菜单图片url
    menu_img_url TEXT,
    -- 详情图片url
    detail_img_url TEXT,
    -- 是否多规格 1.是 2.否
    variant INTEGER DEFAULT 2 NOT NULL,
    -- 是否销售 1.是 2.否
    sold_out INTEGER DEFAULT 2 NOT NULL,
    -- 是否启用 1.是 2.否
    valid_status INTEGER DEFAULT 2 NOT NULL,
    -- 逻辑删除 1.未删除 2.已删除
    del_status INTEGER DEFAULT 1,
    -- 备注
    remark TEXT,
    -- 最新操作人
    operator_id INTEGER DEFAULT 0,
    create_time TEXT NOT NULL,
    update_time TEXT
);

CREATE INDEX IF NOT EXISTS idx_dish_product_name
    ON dish_product (name);

CREATE INDEX IF NOT EXISTS idx_dish_product_operator_id
    ON dish_product (operator_id);

CREATE INDEX IF NOT EXISTS idx_dish_product_restaurant_id_category_id_sort
    ON dish_product (restaurant_id, category_id, sort);

CREATE INDEX IF NOT EXISTS idx_dish_product_restaurant_product_no
    ON dish_product (restaurant_id, product_no);
`;

export const CREATE_DISH_PRODUCT_SKU_TABLE = `
-- 菜品sku表
CREATE TABLE IF NOT EXISTS dish_product_sku (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 餐厅主键ID
    restaurant_id INTEGER DEFAULT 0 NOT NULL,
    -- 菜品主键ID
    product_id INTEGER DEFAULT 0 NOT NULL,
    -- sku编码
    sku_no TEXT NOT NULL,
    -- sku名称
    name TEXT NOT NULL,
    -- 规格排列（以规格item的ID顺序正序排序）
    spec_permutation TEXT,
    -- 价格
    price INTEGER DEFAULT 0,
    -- 是否销售 1.是 2.否
    sold_out INTEGER DEFAULT 2 NOT NULL,
    -- 是否启用 1.是 2.否
    valid_status INTEGER DEFAULT 2 NOT NULL,
    -- 逻辑删除 1.未删除 2.已删除
    del_status INTEGER DEFAULT 1,
    -- 备注
    remark TEXT,
    -- 版本号，当更新sku时版本+1
    version INTEGER DEFAULT 1,
    -- 最新操作人
    operator_id INTEGER DEFAULT 0,
    create_time TEXT,
    update_time TEXT,
    UNIQUE (sku_no)
);

CREATE INDEX IF NOT EXISTS idx_dish_product_sku_operator_id
    ON dish_product_sku (operator_id);

CREATE INDEX IF NOT EXISTS idx_dish_product_sku_product_id
    ON dish_product_sku (product_id);

CREATE INDEX IF NOT EXISTS idx_dish_product_sku_restaurant_id
    ON dish_product_sku (restaurant_id);
`;

export const CREATE_DISH_PRODUCT_SPEC_TABLE = `
-- 菜品规格表
CREATE TABLE IF NOT EXISTS dish_product_spec (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 菜品主键ID
    product_id INTEGER DEFAULT 0 NOT NULL,
    -- 菜品规格编号
    spec_no TEXT,
    -- 菜品规格名称
    name TEXT NOT NULL,
    -- 排序顺序
    sort INTEGER DEFAULT 0 NOT NULL,
    -- 逻辑删除 1.未删除 2.已删除
    del_status INTEGER DEFAULT 1,
    -- 最新操作人
    operator_id INTEGER DEFAULT 0,
    create_time TEXT,
    update_time TEXT,
    UNIQUE (spec_no)
);

CREATE INDEX IF NOT EXISTS idx_dish_product_spec_operator_id
    ON dish_product_spec (operator_id);

CREATE INDEX IF NOT EXISTS idx_dish_product_spec_product_id_sort
    ON dish_product_spec (product_id, sort);
`;

export const CREATE_DISH_PRODUCT_SPEC_ITEM_TABLE = `
-- 菜品规格明细
CREATE TABLE IF NOT EXISTS dish_product_spec_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 菜品规格主键ID
    spec_id INTEGER DEFAULT 0 NOT NULL,
    -- 菜品规格明细编号
    spec_item_no TEXT,
    name TEXT NOT NULL,
    -- 价格
    price INTEGER DEFAULT 0,
    -- 排序顺序
    sort INTEGER DEFAULT 0 NOT NULL,
    -- 逻辑删除 1.未删除 2.已删除
    del_status INTEGER DEFAULT 1,
    -- 最新操作人
    operator_id INTEGER DEFAULT 0,
    create_time TEXT,
    update_time TEXT,
    UNIQUE (spec_item_no)
);

CREATE INDEX IF NOT EXISTS idx_dish_product_spec_item_operator_id
    ON dish_product_spec_item (operator_id);

CREATE INDEX IF NOT EXISTS idx_dish_product_spec_item_spec_id_sort
    ON dish_product_spec_item (spec_id, sort);
`;

export const CREATE_PRODUCT_OPTION_ITEM_TABLE = `
-- 菜品附加元素关联关系表
CREATE TABLE IF NOT EXISTS product_option_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 菜品option关联NO
    product_option_item_no TEXT,
    -- 菜品主键ID
    product_id INTEGER NOT NULL,
    -- 附加元素主键ID
    option_id INTEGER NOT NULL,
    -- 附加属性明细主键ID
    option_item_id INTEGER NOT NULL,
    -- 排序顺序
    sort INTEGER DEFAULT 0 NOT NULL,
    -- 是否推荐: 1.默认 2.是
    recommended_status INTEGER DEFAULT 1 NOT NULL,
    create_time TEXT,
    update_time TEXT,
    UNIQUE (product_option_item_no),
    UNIQUE (product_id, option_id, option_item_id)
);

CREATE INDEX IF NOT EXISTS idx_product_option_item_option_id
    ON product_option_item (option_id);

CREATE INDEX IF NOT EXISTS idx_product_option_item_product_id_option_id_sort
    ON product_option_item (product_id, option_id, sort);
`;

export const CREATE_RESTAURANT_OPTION_TABLE = `
-- 商户菜品全局附加属性表
CREATE TABLE IF NOT EXISTS restaurant_option (
    -- 主键id
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- option no
    option_no TEXT,
    -- 餐厅主键ID
    restaurant_id INTEGER DEFAULT 0 NOT NULL,
    -- 名称
    name TEXT NOT NULL,
    -- 是否必选 1.必选 2.可选
    required_type INTEGER DEFAULT 1 NOT NULL,
    -- 选项类型 1.单选 2.复选
    choice_type INTEGER DEFAULT 1 NOT NULL,
    -- 删除状态 1：删除 2：不删
    del_status INTEGER DEFAULT 2 NOT NULL,
    -- 备注
    remark TEXT,
    -- 最新操作人
    operator_id INTEGER DEFAULT 0,
    create_time TEXT,
    update_time TEXT,
    UNIQUE (option_no)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_option_operator_id
    ON restaurant_option (operator_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_option_restaurant_id
    ON restaurant_option (restaurant_id);
`;

export const CREATE_RESTAURANT_OPTION_ITEM_TABLE = `
-- 菜品全局附加属性明细表
CREATE TABLE IF NOT EXISTS restaurant_option_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 附加属性主键ID
    option_id INTEGER DEFAULT 0 NOT NULL,
    -- option item id
    option_item_no TEXT,
    name TEXT NOT NULL,
    -- 价格
    price INTEGER DEFAULT 0,
    -- 排序顺序
    sort INTEGER DEFAULT 0 NOT NULL,
    -- 删除状态 1：删除 2：不删
    del_status INTEGER DEFAULT 2 NOT NULL,
    -- 最新操作人
    operator_id INTEGER DEFAULT 0,
    create_time TEXT,
    update_time TEXT,
    UNIQUE (option_item_no)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_option_item_option_id_sort
    ON restaurant_option_item (option_id, sort);
`;

export const dishSchemas: Array<string> = [
    CREATE_DISH_CATEGORY_TABLE,
    CREATE_DISH_PRODUCT_TABLE,
    CREATE_DISH_PRODUCT_SKU_TABLE,
    CREATE_DISH_PRODUCT_SPEC_TABLE,
    CREATE_DISH_PRODUCT_SPEC_ITEM_TABLE,
    CREATE_PRODUCT_OPTION_ITEM_TABLE,
    CREATE_RESTAURANT_OPTION_TABLE,
    CREATE_RESTAURANT_OPTION_ITEM_TABLE
];
