import type Database from "better-sqlite3";

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord => {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
};

const asArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

const numberValue = (value: unknown): number => Number(value ?? 0) || 0;
const nullableNumber = (value: unknown): number | null =>
  value === undefined || value === null ? null : numberValue(value);

type EndOfDayLegacyOrderColumn = "receipt_no" | "refund_serial_no";

// EOD 持久化只允许保存 order_inner_no；旧 SI/退款流水号在写库前统一反查转换。
export const normalizeEndOfDayOrderInnerNos = (
  db: Database.Database,
  restaurantId: number,
  values: unknown[],
  legacyColumn: EndOfDayLegacyOrderColumn,
): string[] => {
  const resolveStmt = db.prepare(`
    SELECT order_inner_no
    FROM order_payment
    WHERE restaurant_id = @restaurantId
      AND (order_inner_no = @value OR ${legacyColumn} = @value)
    ORDER BY final_payment_status DESC, id DESC
    LIMIT 1
  `);

  return [
    ...new Set(
      values.map((value) => {
        const normalizedValue = String(value ?? "").trim();
        if (!normalizedValue) return "";

        const resolved = resolveStmt.get({ restaurantId, value: normalizedValue }) as
          | { order_inner_no: string }
          | undefined;

        // 已知订单直接使用数据库里的内部单号；TB 格式用于兼容订单表暂未同步完成的服务端快照。
        if (resolved?.order_inner_no) return resolved.order_inner_no;
        return /^TB[0-9A-Za-z]+$/i.test(normalizedValue) ? normalizedValue : "";
      }),
    ),
  ].filter(Boolean);
};

// 报告同步写库前只修正订单号语义，其余服务端字段保持原样。
export const normalizeEndOfDayReportOrderNosText = (
  db: Database.Database,
  restaurantId: number,
  value: string | null | undefined,
): string | null => {
  if (!value) return value ?? null;

  try {
    const report = JSON.parse(value) as JsonRecord;
    const {
      orderNos: _orderNos,
      order_nos: _orderNosSnakeCase,
      refundOrderNos: _refundOrderNos,
      refund_order_nos: _refundOrderNosSnakeCase,
      ...reportWithoutOrderNos
    } = report;

    return JSON.stringify({
      ...reportWithoutOrderNos,
      orderNos: normalizeEndOfDayOrderInnerNos(
        db,
        restaurantId,
        asArray(_orderNos ?? _orderNosSnakeCase),
        "receipt_no",
      ),
      refundOrderNos: normalizeEndOfDayOrderInnerNos(
        db,
        restaurantId,
        asArray(_refundOrderNos ?? _refundOrderNosSnakeCase),
        "refund_serial_no",
      ),
    });
  } catch {
    return value;
  }
};

// 服务员签退快照只保留线上 restaurant_waiter_clock_record.report_json 使用的字段。
export const toOnlineWaiterClockReportJson = (value: unknown): JsonRecord => {
  const report = asRecord(value);
  const channelSettlementReports = asArray(
    report.channelSettlementReports ?? report.channel_settlement_reports,
  ).map((item) => {
    const channel = asRecord(item);

    return {
      channelName: String(channel.channelName ?? channel.channel_name ?? ""),
      transactionAmount: numberValue(channel.transactionAmount ?? channel.transaction_amount),
      transactionCount: numberValue(channel.transactionCount ?? channel.transaction_count),
    };
  });
  const withdrawalRecord = asArray(
    report.withdrawalRecord ??
      report.withdrawal_record ??
      report.withdrawalRecords ??
      report.withdrawal_records,
  ).map((item) => {
    const withdrawal = asRecord(item);

    return {
      onceLessWithdrawal: numberValue(
        withdrawal.onceLessWithdrawal ?? withdrawal.once_less_withdrawal ?? withdrawal.amount,
      ),
      remark: String(withdrawal.remark ?? ""),
    };
  });

  return {
    cancelled: numberValue(report.cancelled ?? report.cancelledAmount ?? report.cancelled_amount),
    cashOnHand: nullableNumber(report.cashOnHand ?? report.cash_on_hand),
    channelSettlementReports,
    lessWithdrawal: nullableNumber(report.lessWithdrawal ?? report.less_withdrawal),
    openingFund: nullableNumber(report.openingFund ?? report.opening_fund),
    orderNos: asArray(report.orderNos ?? report.order_nos).map((orderNo) => String(orderNo)),
    refundOrderNos: asArray(report.refundOrderNos ?? report.refund_order_nos).map((orderNo) => String(orderNo)),
    cancelOrderNos: asArray(report.cancelOrderNos ?? report.cancel_order_nos).map((orderNo) => String(orderNo)),
    paymentReceived: numberValue(report.paymentReceived ?? report.payment_received),
    refund: numberValue(report.refund ?? report.refundAmount ?? report.refund_amount),
    shortOrOver: nullableNumber(report.shortOrOver ?? report.short_or_over),
    withdrawal: numberValue(report.withdrawal),
    withdrawalRecord,
    isCashOnHand:
      report.isCashOnHand ?? report.is_cash_on_hand ?? null,
  };
};

export const normalizeWaiterClockReportJsonText = (value: string | null | undefined): string | null => {
  if (!value) return value ?? null;

  try {
    return JSON.stringify(toOnlineWaiterClockReportJson(JSON.parse(value)));
  } catch {
    return value;
  }
};
