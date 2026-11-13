import Big from "big.js";
import type { SalesComparison, SalesResult } from "./schema.js";

export function compareSales(current: SalesResult, baseline: SalesResult): SalesComparison {
  const result: SalesComparison = {
    currency: current.currency,
    currentAmount: current.has_data ? current.total_amount : null,
    baselineAmount: baseline.has_data ? baseline.total_amount : null,
    difference: null,
    changePercent: null,
    status: "missing_data",
  };
  // 没有业务数据与真实金额为零分开处理。
  if (!current.has_data || !baseline.has_data) {
    return result;
  }

  // 币种缺失或不一致时，不计算可比金额。
  if (!current.currency || current.currency !== baseline.currency) {
    return { ...result, status: "currency_unavailable" };
  }
  const currentAmount = new Big(current.total_amount);
  const baselineAmount = new Big(baseline.total_amount);
  const difference = currentAmount.minus(baselineAmount);

  result.difference = difference.toFixed(2);

  // 基准为零时仍可计算差额，但变化率没有可用的除数。
  if (baselineAmount.eq(0)) {
    return { ...result, status: "zero_baseline" };
  }

  result.changePercent = difference.div(baselineAmount).times(100).toFixed(2);

  return { ...result, status: "ok" };
}
