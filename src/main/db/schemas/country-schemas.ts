export const CREATE_COUNTRY_TABLE = `
-- 国家地区表
CREATE TABLE IF NOT EXISTS country (
    -- 主键id
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 国家中文名
    cn_name TEXT,
    -- 国家英文名
    en_name TEXT,
    -- 国家简称
    code TEXT,
    -- 权重
    sort INTEGER,
    -- 电话代码
    phone_code TEXT,
    create_time TEXT,
    update_time TEXT,
    -- 时区code
    time_zone_code TEXT,
    -- 名称缩写
    name_abbreviation TEXT,
    -- 单位
    currency_unit TEXT DEFAULT 'PHP',
    -- 符号
    currency_symbol TEXT DEFAULT '₱',
    UNIQUE (en_name)
);
`;

export const countrySchemas: Array<string> = [CREATE_COUNTRY_TABLE];
