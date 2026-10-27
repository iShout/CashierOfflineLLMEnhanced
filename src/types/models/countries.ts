export interface CountryRecord {
  /** 主键id */
  id: number;
  /** 国家中文名 */
  cn_name: string | null;
  /** 国家英文名 */
  en_name: string | null;
  /** 国家简称 */
  code: string | null;
  /** 权重 */
  sort: number | null;
  /** 电话代码 */
  phone_code: string | null;
  create_time: string | null;
  update_time: string | null;
  /** 时区code */
  time_zone_code: string | null;
  /** 名称缩写 */
  name_abbreviation: string | null;
  /** 单位 */
  currency_unit: string;
  /** 符号 */
  currency_symbol: string;
}
