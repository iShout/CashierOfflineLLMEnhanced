import { SnowflakeId } from '@akashrajpurohit/snowflake-id'
/**
 * 构建SQL参数 -- 为了处理表定义了某些字段，但是服务器获取的数据中没有这些字段的情况。
 * @param record 服务器获取的原始数据
 * @param fields 表需要同步的字段
 * @param defaults 如果服务器获取的原始数据中没有某个字段，则使用默认值【如果没有显示指定该字段的默认值，则设置其为null】
 * @returns 构建后的SQL参数
 */
const buildSqlParams = <T extends Record<string, any>>(
  record: T,
  fields: string[],
  defaults: Record<string, any> = {},
) => {
  const params: Record<string, any> = {}

  for (const field of fields) {
    if (field in record) {
      params[field] = record[field]
    } else if (field in defaults) {
      params[field] = defaults[field]
    } else {
      params[field] = null
    }
  }

  return params
}

const camelToSnakeCase = (key: string): string => {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

// 递归转换对象字段为下划线命名，供 IPC 出参统一格式使用
const convertKeysToSnakeCase = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map((item) => convertKeysToSnakeCase(item))
  }

  if (
    value === null ||
    typeof value !== 'object' ||
    value instanceof Date ||
    Buffer.isBuffer(value)
  ) {
    return value
  }

  return Object.entries(value).reduce<Record<string, any>>((acc, [key, item]) => {
    acc[camelToSnakeCase(key)] = convertKeysToSnakeCase(item)
    return acc
  }, {})
}

/**
 * 生成 较短的雪花 ID
 * @returns 返回字符串格式的 ID，防止精度丢失
 */
export const generateSnowflakeId = (): string => {
  const snowflake = SnowflakeId({
    workerId: 1,
    // 将 epoch 设置为今天或未来的某个时间点（毫秒）
    // 这样时间差很小，生成的 ID 起步会非常短
    epoch: 1776086400000, // 示例：设置为 2026-04-13
  })

  return snowflake.generate()
}
// 构建order_inner_no（TB + 16位随机数）
const constructOrderInnerNo = () => {
  return `TB${generateSnowflakeId()}`
}

// 构建order_no（T + 16位随机数）
const constructOrderNo = () => {
  return `T${generateSnowflakeId()}`
}

// 构建mch_merchant_id（T + 16位随机数）
const construcMchOrderId = () => {
    return `OFF${generateSnowflakeId()}`
}

export {
  buildSqlParams,
  convertKeysToSnakeCase,
  constructOrderInnerNo,
  constructOrderNo,
  construcMchOrderId
}
