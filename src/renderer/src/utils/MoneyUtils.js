import Big from "big.js";

/**
 * 将分转换为元 (除以 100)
 * @param {number|string} cents 分
 * @param {boolean} asNumber 是否返回数字类型（默认返回字符串以保证展示精度）
 * @returns {string|number} 转换后的结果
 */
export function fromCents(cents, asNumber = false) {
  if (cents === null || cents === undefined) return asNumber ? 0 : "0.00";

  // 1. 使用 Big 对象包装，避免原生浮点数除法误差
  // 2. toFixed(2) 强制保留两位小数（四舍五入）
  const result = new Big(cents).div(100).toFixed(2);

  return asNumber ? parseFloat(result) : result;
}

/**
 * 专门用于展示的方法：始终返回带 2 位小数的字符串
 */
export function format(cents) {
  return fromCents(cents, false);
}

export default { fromCents, format };
