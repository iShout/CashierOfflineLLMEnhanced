import fs from "fs";
import os from "os";
import path from "path";
import dayjs from "dayjs";
import iconv from "iconv-lite";
import { Resvg } from "@resvg/resvg-js";
import type Database from "better-sqlite3";
import type { FoodOrderRecord, OrderPaymentRecord, OrderPaymentTaxRecord } from "@app-types/models/orders";
import type {
  PaymentChannelRecord,
  RestaurantOperationConfigRecord,
  RestaurantRecord,
  RestaurantSettingRecord,
} from "@app-types/models/settings";
import type { RestaurantReportPrintRecord } from "@app-types/models/report";
import { AUDIT_STATUS, ORDER_TYPE, PAYMENT_STATUS } from "@main/db/constants/order";
import { generateEndOfDayReport } from "@main/services/printReportGenerator";
import { renderReceiptTextToImageDataUrl } from "@main/services/receiptImageRenderer";
import type { EndOfDayReportData } from "@app-types/models/printReport";

// 商场类型：与在线端和后端 MallTypeEnum 保持一致。
export const MALL_TYPE = {
  SM: 1,
  PARQAL: 2,
  MEGAWORLD: 3,
} as const;

// SM 默认文件夹：Windows 生产环境使用 C:\SIA，非 Windows 开发环境落到桌面便于测试。
export const DEFAULT_SM_DIRECTORY =
  os.platform() === "win32" ? "C:\\SIA" : path.join(os.homedir(), "Desktop", "electron-download");

// Megaworld 默认保存目录；用户可在设置页改为自定义目录。
export const DEFAULT_MEGAWORLD_DIRECTORY = "D:\\Megaworld";

// 日终报告类型：兼容后端预览类型 2 和本项目打印类型 9。
const END_OF_DAY_REPORT_TYPE = 2;

// 本项目本地打印类型常量里 End-of-Day Report 使用 9。
const LOCAL_END_OF_DAY_REPORT_TYPE = 9;

// 支付最终状态：1 表示当前订单实际最终支付记录。
const FINAL_PAYMENT_STATUS_YES = 1;

const BACKEND_ORDER_CHANNEL_OFFLINE = 0;

// 本地商场认证设置结构，字段名对齐在线 Web 表单。
export type MallCertificationSettings = {
  mall_type: number;
  file_download_url: string;
  external_id?: string;
  external_no?: string;
  pos_id?: string;
};

// 商场认证文件生成结果，renderer 用于展示生成位置和缺失数据。
export type MallCertificationGenerateResult = {
  files: string[];
  missing_tables: string[];
  warnings: string[];
};

// SM 交易列表导出列，顺序对齐在线端 xlsx/csv 语义。
const SM_TRANSACTION_COLUMNS: Array<[string, string]> = [
  ["Order Num/Bill Num", "order_num_bill_num"],
  ["Business Day", "business_day"],
  ["Check Open", "check_open"],
  ["Check Close", "check_close"],
  ["Sales Type", "sales_type"],
  ["Transaction Type", "transaction_type"],
  ["Void", "void"],
  ["Void Amount", "void_amount"],
  ["Refund", "refund"],
  ["Refund Amount", "refund_amount"],
  ["Guest Count", "guest_count"],
  ["Guest Count (Senior)", "guest_count_senior"],
  ["Guest Count (PWD)", "guest_count_pwd"],
  ["Gross Sales Amount", "gross_sales_amount"],
  ["Net Sales Amount", "net_sales_amount"],
  ["Total Tax", "total_tax"],
  ["Other/Local Tax", "other_local_tax"],
  ["Total Service Charge", "total_service_charge"],
  ["Total Tip", "total_tip"],
  ["Total Discount", "total_discount"],
  ["Less Tax Amount", "less_tax_amount"],
  ["Tax Exempt Sales", "tax_exempt_sales"],
  ["Regular / Other Discount Name", "regular_other_discount_name"],
  ["Regular / Other Discount Amount", "regular_other_discount_amount"],
  ["Employee Discount Amount", "employee_discount_amount"],
  ["Senior Citizen Discount Amount", "senior_citizen_discount_amount"],
  ["VIP Discount Amount", "vip_discount_amount"],
  ["PWD Discount Amount", "pwd_discount_amount"],
  ["National Coach / Athlete / Medal of Valor Discount amount", "national_discount_amount"],
  ["SMAC Discount Amount", "smac_discount_amount"],
  ["Online Deals Discount Name", "online_deals_discount_name"],
  ["Online Deals Discount Amount", "online_deals_discount_amount"],
  ["Discount Field 1 Name", "discount_field_1_name"],
  ["Discount Field 2 Name", "discount_field_2_name"],
  ["Discount Field 3 Name", "discount_field_3_name"],
  ["Discount Field 4 Name", "discount_field_4_name"],
  ["Discount Field 5 Name", "discount_field_5_name"],
  ["Discount Field 6 Name", "discount_field_6_name"],
  ["Discount Field 1 Amount", "discount_field_1_amount"],
  ["Discount Field 2 Amount", "discount_field_2_amount"],
  ["Discount Field 3 Amount", "discount_field_3_amount"],
  ["Discount Field 4 Amount", "discount_field_4_amount"],
  ["Discount Field 5 Amount", "discount_field_5_amount"],
  ["Discount Field 6 Amount", "discount_field_6_amount"],
  ["Payment Type_1", "payment_type_1"],
  ["Payment Amount_1", "payment_amount_1"],
  ["Payment Type_2", "payment_type_2"],
  ["Payment Amount_2", "payment_amount_2"],
  ["Payment Type_3", "payment_type_3"],
  ["Payment Amount_3", "payment_amount_3"],
  ["Total Cash Sales Amount", "total_cash_sales_amount"],
  ["Total Gift Cheque / Gift Card Sales Amount", "total_gift_card_sales_amount"],
  ["Total Debit Card Sales Amount", "total_debit_card_sales_amount"],
  ["Total E-wallet / Online Sales Amount", "total_online_sales_amount"],
  ["Total Other Tender Sales Amount", "total_other_tender_sales_amount"],
  ["Total Mastercard Sales Amount", "total_mastercard_sales_amount"],
  ["Total Visa Sales Amount", "total_visa_sales_amount"],
  ["Total American Express Sales Amount", "total_american_express_sales_amount"],
  ["Total Diners Sales Amount", "total_diners_sales_amount"],
  ["Total JCB Sales Amount", "total_jcb_sales_amount"],
  ["Total Other Credit Card Sales Amount", "total_other_credit_card_sales_amount"],
  ["Terminal Number", "terminal_number"],
  ["Serial Number", "serial_number"],
];

// SM 交易明细列顺序与后端 getSMTransactionsDetailHead 保持一致。
const SM_TRANSACTION_DETAIL_COLUMNS: Array<[string, string]> = [
  ["Order Num/Bill Num", "order_num_bill_num"],
  ["Item ID", "item_id"],
  ["Item Name", "item_name"],
  ["Item Parent Category", "item_parent_category"],
  ["Item Category", "item_category"],
  ["Item Sub-Category", "item_sub_category"],
  ["Item Quantity", "item_quantity"],
  ["Transaction Item Price", "transaction_item_price"],
  ["Menu Item Price", "menu_item_price"],
  ["Discount Code", "discount_code"],
  ["Discount Amount", "discount_amount"],
  ["Modifier (1) Name", "modifier_1_name"],
  ["Modifier (1) Quantity", "modifier_1_quantity"],
  ["Modifier (2) Name", "modifier_2_name"],
  ["Modifier (2) Quantity", "modifier_2_quantity"],
  ["Void", "void"],
  ["Void Amount", "void_amount"],
  ["Refund", "refund"],
  ["Refund Amount", "refund_amount"],
];

// CSV 需要 GBK 写入，和旧 Windows 项目保持一致。
const writeTextFile = (filePath: string, content: string, encoding: "utf8" | "gbk" = "utf8"): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const data = encoding === "gbk" ? iconv.encode(content, "gbk") : content;
  fs.writeFileSync(filePath, data);
};

// 金额统一从分转换成两位小数字符串。
const formatAmount = (amount?: number | null): string => ((amount ?? 0) / 100).toFixed(2);

const formatAmountSigned = (amount?: number | null, negative = false): string => {
  const value = amount ?? 0;
  if (negative && value !== 0) {
    // 退款场景由调用方决定负号，避免传入负数时出现双负号。
    return `-${formatAmount(Math.abs(value))}`;
  }
  return formatAmount(value);
};

const formatAmountDouble = (amount?: number | null): string => (((amount ?? 0) as number) / 100).toFixed(2);

const megaworldRawAmount = (amount?: number | null): string => {
  const value = amount ?? 0;
  return value === 0 ? "000" : String(value);
};

const toBackendReceiptNo = (value?: string | number | null): string => {
  const text = String(value ?? "0");
  return /^\d+$/.test(text) ? BigInt(text || "0").toString() : text;
};

const getFileNameReceiptNo = (value?: string | number | null): string => {
  const text = String(value ?? "0");
  return text.length > 5 ? text.slice(-5) : text;
};

const getReportValue = (reportJson: Record<string, any>, snakeKey: string, camelKey: string, fallback = 0): number =>
  Number(reportJson[snakeKey] ?? reportJson[camelKey] ?? fallback) || 0;

const getReportArray = <T = any>(reportJson: Record<string, any>, snakeKey: string, camelKey: string): T[] => {
  const value = reportJson[snakeKey] ?? reportJson[camelKey];
  return Array.isArray(value) ? value : [];
};

// CSV 单元格转义，避免逗号和换行破坏文件结构。
const csvCell = (value: unknown): string => {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

// 按指定列生成 CSV 字符串。
const toCsv = (
  columns: Array<[string, string]>,
  rows: Array<Record<string, unknown>>,
  includeHeader = true,
): string => {
  const lines: string[] = [];
  if (includeHeader) {
    lines.push(columns.map(([header]) => csvCell(header)).join(","));
  }
  for (const row of rows) {
    lines.push(columns.map(([, key]) => csvCell(row[key])).join(","));
  }
  return `${lines.join("\n")}\n`;
};

// 去掉 CSV 表头，仅保留数据行，用于单笔追加。
const removeCsvHeader = (csvData: string): string => {
  const lines = csvData.split("\n");
  return (
    lines
      .slice(1)
      .filter((line) => line.trim() !== "")
      .join("\n") + "\n"
  );
};

// 查找目录中已存在的 SM CSV 文件；不存在时使用当前月份默认文件名。
const resolveSmCsvPath = (directory: string, keyword: string): string => {
  if (fs.existsSync(directory)) {
    const target = fs.readdirSync(directory).find((file) => file.includes(keyword) && file.endsWith(".csv"));
    if (target) {
      return path.join(directory, target);
    }
  }

  return path.join(directory, `${dayjs().format("MM_YYYY")}_${keyword}.csv`);
};

// 查找已有 SM CSV 文件；初始化更新时只有两份文件都存在才走增量。
const findSmCsvPath = (directory: string, keyword: string): string | null => {
  if (!fs.existsSync(directory)) {
    return null;
  }

  const target = fs.readdirSync(directory).find((file) => file.includes(keyword) && file.endsWith(".csv"));

  return target ? path.join(directory, target) : null;
};

// 解析 CSV 行，支持基础双引号转义。
const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
};

// 读取 CSV 文件内容，兼容旧 Windows 项目写入的 GBK 编码。
const readCsvFile = (filePath: string): string => {
  const buffer = fs.readFileSync(filePath);
  return iconv.decode(buffer, "gbk");
};

// 解析 CSV 中的业务日期，兼容 YYYY-MM-DD 和 YYYY/MM/DD。
const parseCsvBusinessDay = (value: string): dayjs.Dayjs => dayjs(String(value ?? "").replaceAll("/", "-"));

// 获取 transaction CSV 最后一条业务数据的 Business Day。
const getLatestSmCsvBusinessDay = (transactionPath: string): string => {
  const lines = readCsvFile(transactionPath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return dayjs().subtract(30, "day").format("YYYY-MM-DD");
  }

  const latestRow = parseCsvLine(lines[lines.length - 1]);
  const businessDay = latestRow[1];
  const parsedBusinessDay = parseCsvBusinessDay(businessDay);

  return parsedBusinessDay.isValid()
    ? parsedBusinessDay.format("YYYY-MM-DD")
    : dayjs().subtract(30, "day").format("YYYY-MM-DD");
};

// 更新 transaction CSV：清理 30 天前数据，并移除 latestDate 之后需要重新生成的数据。
const pruneSmTransactionCsv = (
  transactionPath: string,
  latestDate: string,
): { content: string; removedOrderIds: Set<string> } => {
  const lines = readCsvFile(transactionPath)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return { content: toCsv(SM_TRANSACTION_COLUMNS, []), removedOrderIds: new Set() };
  }

  const header = lines[0];
  const threshold = dayjs().subtract(30, "day").startOf("day");
  const latestDay = dayjs(latestDate).startOf("day");
  const keptRows: string[] = [];
  const removedOrderIds = new Set<string>();

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const orderId = cells[0];
    const businessDay = parseCsvBusinessDay(cells[1]).startOf("day");
    const shouldRemove = !businessDay.isValid() || businessDay.isBefore(threshold) || !businessDay.isBefore(latestDay);

    if (shouldRemove) {
      if (orderId) {
        removedOrderIds.add(orderId);
      }
      continue;
    }

    keptRows.push(line);
  }

  return {
    content: `${[header, ...keptRows].join("\n")}\n`,
    removedOrderIds,
  };
};

// 更新 detail CSV：按 transaction 被移除的订单号同步删除对应明细。
const pruneSmDetailCsv = (detailPath: string, removedOrderIds: Set<string>): string => {
  const lines = readCsvFile(detailPath)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return toCsv(SM_TRANSACTION_DETAIL_COLUMNS, []);
  }

  const header = lines[0];
  const keptRows = lines.slice(1).filter((line) => {
    const orderId = parseCsvLine(line)[0];
    return !removedOrderIds.has(orderId);
  });

  return `${[header, ...keptRows].join("\n")}\n`;
};

// XML 文本转义，避免商场 XML 文件格式损坏。
const xmlEscape = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

// Megaworld 月份编码，复刻后端 MegawordUtils.convertMonth 的文件名意图。
const megaworldMonthCode = (month: number): string => {
  const codes = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C"];
  return codes[month] ?? String(month);
};

// Megaworld 文件名裁剪规则复刻后端：商场号取前缀、POS 号取后缀，不补 0。
const getTopLengthStr = (value: string | undefined, length: number): string => {
  const text = String(value ?? "");
  return text.length <= length ? text : text.slice(0, length);
};

const getLastLengthStr = (value: string | undefined, length: number): string => {
  const text = String(value ?? "");
  return text.length <= length ? text : text.slice(-length);
};

const xmlLine = (indent: number, tag: string, value: unknown): string =>
  `${" ".repeat(indent)}<${tag}>${xmlEscape(value)}</${tag}>`;

const dayjsOrEndOfDay = (value: string | null | undefined, date: string): dayjs.Dayjs => {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : dayjs(`${date} 23:59:59`);
};

// 通用 IN 条件占位符，空数组调用前应直接返回。
const inPlaceholders = (values: unknown[]): string => values.map(() => "?").join(",");

// 默认商场认证设置：未配置时按 SM Mall 处理。
export const defaultMallCertificationSettings = (): MallCertificationSettings => ({
  mall_type: MALL_TYPE.SM,
  file_download_url: DEFAULT_SM_DIRECTORY,
  external_id: "",
  external_no: "",
  pos_id: "",
});

// 获取餐厅商场认证设置。
export const readMallCertificationSettings = (
  db: Database.Database,
  restaurantId: number,
): MallCertificationSettings => {
  const row = db
    .prepare(
      `
        SELECT
          mall_type,
          file_download_url,
          external_id,
          external_no,
          pos_id
        FROM restaurant_pos_download_file_setting
        WHERE restaurant_id = ?
        LIMIT 1
      `,
    )
    .get(restaurantId) as
    | {
        mall_type: number | null;
        file_download_url: string | null;
        external_id: string | null;
        external_no: string | null;
        pos_id: string | null;
      }
    | undefined;

  if (!row) {
    return defaultMallCertificationSettings();
  }

  return normalizeMallCertificationSettings({
    mall_type: row.mall_type ?? MALL_TYPE.SM,
    file_download_url: row.file_download_url ?? "",
    external_id: row.external_id ?? "",
    external_no: row.external_no ?? "",
    pos_id: row.pos_id ?? "",
  });
};

// 保存餐厅商场认证设置。
export const writeMallCertificationSettings = (
  db: Database.Database,
  restaurantId: number,
  settings: MallCertificationSettings,
): MallCertificationSettings => {
  const normalized = normalizeMallCertificationSettings(settings);
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

  // 本地实现对齐后端 restaurant_pos_download_file_setting：按 restaurant_id 单条 upsert。
  db.prepare(
    `
      INSERT INTO restaurant_pos_download_file_setting (
        restaurant_id,
        mall_type,
        external_no,
        external_id,
        pos_id,
        create_time,
        update_time,
        file_download_url
      ) VALUES (
        @restaurant_id,
        @mall_type,
        @external_no,
        @external_id,
        @pos_id,
        @create_time,
        @update_time,
        @file_download_url
      )
      ON CONFLICT(restaurant_id) DO UPDATE SET
        mall_type = excluded.mall_type,
        external_no = excluded.external_no,
        external_id = excluded.external_id,
        pos_id = excluded.pos_id,
        update_time = excluded.update_time,
        file_download_url = excluded.file_download_url
    `,
  ).run({
    restaurant_id: restaurantId,
    mall_type: normalized.mall_type,
    external_no: normalized.external_no ?? "",
    external_id: normalized.external_id ?? "",
    pos_id: normalized.pos_id ?? "",
    create_time: now,
    update_time: now,
    file_download_url: normalized.file_download_url,
  });

  return normalized;
};

// 规范化设置字段，保证 UI 和生成逻辑拿到稳定目录。
export const normalizeMallCertificationSettings = (settings: MallCertificationSettings): MallCertificationSettings => {
  const mallType = Number(settings.mall_type || MALL_TYPE.SM);
  const next: MallCertificationSettings = {
    mall_type: mallType,
    file_download_url: settings.file_download_url ?? "",
    external_id: settings.external_id ?? "",
    external_no: settings.external_no ?? "",
    pos_id: settings.pos_id ?? "",
  };

  if (mallType === MALL_TYPE.SM) {
    return {
      mall_type: MALL_TYPE.SM,
      file_download_url: DEFAULT_SM_DIRECTORY,
      external_id: "",
      external_no: "",
      pos_id: "",
    };
  }

  if (mallType === MALL_TYPE.MEGAWORLD && !next.file_download_url) {
    next.file_download_url = DEFAULT_MEGAWORLD_DIRECTORY;
  }

  return next;
};

// 检查商场认证依赖的 BIR 审核记录，保存设置时与后端按餐厅维度校验保持一致。
export const getApprovedBirConfig = (
  db: Database.Database,
  restaurantId: number,
): RestaurantOperationConfigRecord | null => {
  // 商场认证按餐厅选取最新已审核配置，不再依赖本机 POS 绑定。
  const record = db
    .prepare(
      `
        SELECT *
        FROM restaurant_operation_config
        WHERE restaurant_id = @restaurantId
          AND audit_status = @auditStatus
          AND audit_time IS NOT NULL
        ORDER BY audit_time DESC, id DESC
        LIMIT 1
      `,
    )
    .get({
      restaurantId,
      auditStatus: AUDIT_STATUS.PASS_THE_EXAMINATION,
    }) as RestaurantOperationConfigRecord | undefined;

  return record ?? null;
};

// 获取指定日期的日终报告快照。
const getEndOfDayReport = (
  db: Database.Database,
  restaurantId: number,
  date: string,
): RestaurantReportPrintRecord | null => {
  // Parqal/Megaworld 文件使用餐厅级日终快照。
  const startTime = `${date} 00:00:00`;
  const endTime = `${date} 23:59:59`;
  const record = db
    .prepare(
      `
        SELECT *
        FROM restaurant_report_print
        WHERE restaurant_id = @restaurantId
          AND print_type IN (@printType, @localPrintType)
          AND create_time BETWEEN @startTime AND @endTime
        ORDER BY create_time DESC
        LIMIT 1
      `,
    )
    .get({
      restaurantId,
      printType: END_OF_DAY_REPORT_TYPE,
      localPrintType: LOCAL_END_OF_DAY_REPORT_TYPE,
      startTime,
      endTime,
    }) as RestaurantReportPrintRecord | undefined;

  return record ?? null;
};

// 解析报告快照，字段不完整时返回空对象让生成逻辑降级。
const parseReportJson = (record: RestaurantReportPrintRecord): Record<string, any> => {
  try {
    return record.report_json ? JSON.parse(record.report_json) : {};
  } catch {
    return {};
  }
};

// 读取当前餐厅基本信息。
const getRestaurant = (db: Database.Database, restaurantId: number): RestaurantRecord | null => {
  const restaurant = db.prepare("SELECT * FROM restaurant WHERE id = ? LIMIT 1").get(restaurantId) as
    | RestaurantRecord
    | undefined;
  return restaurant ?? null;
};

// 读取支付渠道名称映射。
const getPaymentChannelNameMap = (db: Database.Database): Map<string, string> => {
  const rows = db.prepare("SELECT code, name FROM payment_channel").all() as Array<
    Pick<PaymentChannelRecord, "code" | "name">
  >;
  return new Map(rows.map((row) => [row.code, row.name]));
};

const getReportOrderInnerNos = (
  db: Database.Database,
  restaurantId: number,
  reportRecord: RestaurantReportPrintRecord,
  type: "sale" | "refund",
): string[] => {
  const status = type === "refund" ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PAY_SUCCESS;
  const rows = db
    .prepare(
      `
        SELECT DISTINCT order_inner_no
        FROM order_payment
        WHERE restaurant_id = @restaurantId
          AND transaction_status = @status
          AND final_payment_status = @finalPaymentStatus
          AND datetime(transaction_return_time) BETWEEN datetime(@startTime) AND datetime(@endTime)
        ORDER BY datetime(transaction_return_time) ASC, id ASC
      `,
    )
    .all({
      restaurantId,
      status,
      finalPaymentStatus: FINAL_PAYMENT_STATUS_YES,
      startTime: reportRecord.print_start_time,
      endTime: reportRecord.print_end_time,
    }) as Array<{ order_inner_no: string }>;

  return rows.map((row) => row.order_inner_no).filter(Boolean);
};

const getReportOrderNos = (
  db: Database.Database,
  restaurantId: number,
  reportRecord: RestaurantReportPrintRecord,
  reportJson: Record<string, any>,
  type: "sale" | "refund",
): string[] => {
  const snapshotOrderNos = getReportArray<string>(
    reportJson,
    type === "refund" ? "refund_order_nos" : "order_nos",
    type === "refund" ? "refundOrderNos" : "orderNos",
  );

  return snapshotOrderNos.length > 0 ? snapshotOrderNos : getReportOrderInnerNos(db, restaurantId, reportRecord, type);
};

const getReportChannelSettlementReports = (
  db: Database.Database,
  restaurantId: number,
  reportRecord: RestaurantReportPrintRecord,
  reportJson: Record<string, any>,
): Array<{ channelName: string; channelCode: string; transactionCount: number; transactionAmount: number }> => {
  const snapshotRows = getReportArray<any>(reportJson, "channel_settlement_reports", "channelSettlementReports");
  if (snapshotRows.length > 0) {
    return snapshotRows;
  }

  const channelNameMap = getPaymentChannelNameMap(db);
  const rows = db
    .prepare(
      `
        SELECT channel_code, COUNT(*) AS transaction_count, SUM(real_amount) AS transaction_amount
        FROM order_payment
        WHERE restaurant_id = @restaurantId
          AND transaction_status = @status
          AND final_payment_status = @finalPaymentStatus
          AND datetime(transaction_return_time) BETWEEN datetime(@startTime) AND datetime(@endTime)
        GROUP BY channel_code
        ORDER BY channel_code ASC
      `,
    )
    .all({
      restaurantId,
      status: PAYMENT_STATUS.PAY_SUCCESS,
      finalPaymentStatus: FINAL_PAYMENT_STATUS_YES,
      startTime: reportRecord.print_start_time,
      endTime: reportRecord.print_end_time,
    }) as Array<{ channel_code: string; transaction_count: number; transaction_amount: number }>;

  const reports = rows.map((row) => ({
    channelName: channelNameMap.get(row.channel_code) ?? row.channel_code,
    channelCode: row.channel_code,
    transactionCount: Number(row.transaction_count ?? 0),
    transactionAmount: Number(row.transaction_amount ?? 0),
  }));
  reports.push({
    channelName: "TOTAL",
    channelCode: "TOTAL",
    transactionCount: reports.reduce((sum, row) => sum + row.transactionCount, 0),
    transactionAmount: reports.reduce((sum, row) => sum + row.transactionAmount, 0),
  });

  return reports;
};

// 按时间或订单号读取最终支付记录。
const getFinalPayments = (
  db: Database.Database,
  restaurantId: number,
  params: { startTime?: string; endTime?: string; orderInnerNo?: string; refundStatus?: boolean },
): OrderPaymentRecord[] => {
  if (params.orderInnerNo) {
    return db
      .prepare(
        `
          SELECT *
          FROM order_payment
          WHERE restaurant_id = @restaurantId
            AND order_inner_no = @orderInnerNo
            AND transaction_status NOT IN (@unpaid, @failed)
            AND final_payment_status = @finalPaymentStatus
            AND (@refundStatus = 0 OR transaction_status = @refunded)
          ORDER BY transaction_return_time ASC
        `,
      )
      .all({
        restaurantId,
        orderInnerNo: params.orderInnerNo,
        unpaid: PAYMENT_STATUS.UNPAY,
        failed: PAYMENT_STATUS.FAILED,
        refunded: PAYMENT_STATUS.REFUNDED,
        refundStatus: params.refundStatus ? 1 : 0,
        finalPaymentStatus: FINAL_PAYMENT_STATUS_YES,
      }) as OrderPaymentRecord[];
  }

  if (!params.startTime || !params.endTime) {
    throw new Error("Parameter error");
  }
  // SM 按时间下载最多允许 31 天，和后端请求校验一致。
  if (dayjs(params.startTime).add(31, "day").isBefore(dayjs(params.endTime))) {
    throw new Error("Obtain data for a maximum of 31 days");
  }

  return db
    .prepare(
      `
        SELECT *
        FROM order_payment
        WHERE restaurant_id = @restaurantId
          AND transaction_return_time BETWEEN @startTime AND @endTime
          AND transaction_status NOT IN (@unpaid, @failed)
          AND final_payment_status = @finalPaymentStatus
        ORDER BY transaction_return_time ASC
      `,
    )
    .all({
      restaurantId,
      startTime: params.startTime,
      endTime: params.endTime,
      unpaid: PAYMENT_STATUS.UNPAY,
      failed: PAYMENT_STATUS.FAILED,
      finalPaymentStatus: FINAL_PAYMENT_STATUS_YES,
    }) as OrderPaymentRecord[];
};

// 批量读取订单主单。
const getMasterOrders = (
  db: Database.Database,
  restaurantId: number,
  orderInnerNos: string[],
): FoodOrderRecord[] => {
  if (orderInnerNos.length === 0) return [];
  return db
    .prepare(
      `
        SELECT *
        FROM food_order
        WHERE restaurant_id = ?
          AND order_inner_no IN (${inPlaceholders(orderInnerNos)})
          AND order_type = ?
      `,
    )
    .all(restaurantId, ...orderInnerNos, ORDER_TYPE.MASTER) as FoodOrderRecord[];
};

// 批量读取订单全量子单；商场文件按餐厅和 order_inner_no 查订单。
const getMallOrdersByInnerNos = (
  db: Database.Database,
  restaurantId: number,
  orderInnerNos: string[],
): FoodOrderRecord[] => {
  if (orderInnerNos.length === 0) return [];
  return db
    .prepare(
      `
        SELECT *
        FROM food_order
        WHERE restaurant_id = ?
          AND order_inner_no IN (${inPlaceholders(orderInnerNos)})
      `,
    )
    .all(restaurantId, ...orderInnerNos) as FoodOrderRecord[];
};

const getOrdersByInnerNos = (
  db: Database.Database,
  restaurantId: number,
  orderInnerNos: string[],
): FoodOrderRecord[] => {
  if (orderInnerNos.length === 0) return [];
  return db
    .prepare(
      `
        SELECT *
        FROM food_order
        WHERE restaurant_id = ?
          AND order_inner_no IN (${inPlaceholders(orderInnerNos)})
      `,
    )
    .all(restaurantId, ...orderInnerNos) as FoodOrderRecord[];
};

// 批量读取支付税务记录。
// 本地 EOD report_json 可能保存 SI/退款流水号，生成商场文件前需还原 order_inner_no。
const resolveMallOrderInnerNos = (
  db: Database.Database,
  restaurantId: number,
  values: string[],
  type: "sale" | "refund",
  reportRecord: RestaurantReportPrintRecord,
): string[] => {
  const normalizedValues = [...new Set(values.filter((value) => Boolean(value)))];
  if (normalizedValues.length === 0) return [];

  const orderRows = db
    .prepare(
      `
        SELECT order_inner_no
        FROM food_order
        WHERE restaurant_id = ?
          AND (
            order_inner_no IN (${inPlaceholders(normalizedValues)})
            OR order_no IN (${inPlaceholders(normalizedValues)})
            OR order_serial_number IN (${inPlaceholders(normalizedValues)})
          )
          AND (
            (? = 'sale' AND datetime(complete_time) BETWEEN datetime(?) AND datetime(?))
            OR (? = 'refund' AND datetime(refund_time) BETWEEN datetime(?) AND datetime(?))
          )
      `,
    )
    .all(
      restaurantId,
      ...normalizedValues,
      ...normalizedValues,
      ...normalizedValues,
      type,
      reportRecord.print_start_time,
      reportRecord.print_end_time,
      type,
      reportRecord.print_start_time,
      reportRecord.print_end_time,
    ) as Array<{ order_inner_no: string }>;

  const resolved = new Set(orderRows.map((row) => row.order_inner_no));

  if (type === "refund") {
    const refundRows = db
      .prepare(
        `
          SELECT op.order_inner_no
          FROM order_payment op
          JOIN food_order fo ON fo.order_inner_no = op.order_inner_no AND fo.restaurant_id = op.restaurant_id
          WHERE op.restaurant_id = ?
            AND op.refund_serial_no IN (${inPlaceholders(normalizedValues)})
            AND datetime(fo.refund_time) BETWEEN datetime(?) AND datetime(?)
        `,
      )
      .all(restaurantId, ...normalizedValues, reportRecord.print_start_time, reportRecord.print_end_time) as Array<{
      order_inner_no: string;
    }>;
    for (const row of refundRows) {
      resolved.add(row.order_inner_no);
    }
  }

  return [...resolved];
};

const getPaymentTaxMap = (db: Database.Database, paymentIds: number[]): Map<number, OrderPaymentTaxRecord> => {
  if (paymentIds.length === 0) return new Map();
  const rows = db
    .prepare(`SELECT * FROM order_payment_tax WHERE order_payment_id IN (${inPlaceholders(paymentIds)})`)
    .all(...paymentIds) as OrderPaymentTaxRecord[];
  return new Map(rows.map((row) => [row.order_payment_id, row]));
};

type MallOrderDetailRow = {
  order_id: number;
  sku_id: number;
  count: number;
  sku_amount: number;
  option_amount: number | null;
  product_name: string | null;
  sku_name: string | null;
};

type PreviousParqalSummary = {
  totalAmount: number;
  totalVatSales: number;
  totalVatAmount: number;
  totalVatExemptionSales: number;
  totalExemption: number;
  totalPromoDiscount: number;
};

type ParqalLine = Record<string, string>;

type ParqalTrx = Record<string, string | ParqalLine[]>;

type ParqalProduct = {
  sku: string;
  name: string;
  inventory: string;
  price: string;
  category: string;
};

type ParqalBuildData = {
  sales: Record<string, string>;
  trxList: ParqalTrx[];
  products: ParqalProduct[];
};

type ParqalTotals = {
  gross: number;
  vat: number;
  taxSale: number;
  vatExempt: number;
  promo: number;
  promoCount: number;
  refund: number;
  refundCount: number;
  senior: number;
  seniorCount: number;
  pwd: number;
  pwdCount: number;
  service: number;
  serviceCount: number;
  trxCount: number;
  cash: number;
  cashCount: number;
  credit: number;
  creditCount: number;
  charge: number;
  chargeCount: number;
  giftcheck: number;
  giftcheckCount: number;
  othertender: number;
  othertenderCount: number;
  minReceipt: bigint | null;
  maxReceipt: bigint | null;
};

const getMallPaymentsByReport = (
  db: Database.Database,
  restaurantId: number,
  orderNos: string[],
  refundOrderNos: string[],
): OrderPaymentRecord[] => {
  const payments: OrderPaymentRecord[] = [];

  // 后端按日终报告中的正向/退款订单号分别读取最终支付单，再按支付回调时间排序。
  if (orderNos.length > 0) {
    payments.push(
      ...(db
        .prepare(
          `
            SELECT *
            FROM order_payment
            WHERE restaurant_id = ?
              AND order_inner_no IN (${inPlaceholders(orderNos)})
              AND transaction_status = ?
              AND final_payment_status = ?
          `,
        )
        .all(restaurantId, ...orderNos, PAYMENT_STATUS.PAY_SUCCESS, FINAL_PAYMENT_STATUS_YES) as OrderPaymentRecord[]),
    );
  }

  if (refundOrderNos.length > 0) {
    payments.push(
      ...(db
        .prepare(
          `
            SELECT *
            FROM order_payment
            WHERE restaurant_id = ?
              AND order_inner_no IN (${inPlaceholders(refundOrderNos)})
              AND transaction_status = ?
              AND final_payment_status = ?
          `,
        )
        .all(
          restaurantId,
          ...refundOrderNos,
          PAYMENT_STATUS.REFUNDED,
          FINAL_PAYMENT_STATUS_YES,
        ) as OrderPaymentRecord[]),
    );
  }

  return payments.sort(
    (left, right) =>
      dayjs(left.transaction_return_time ?? left.update_time ?? left.create_time).valueOf() -
      dayjs(right.transaction_return_time ?? right.update_time ?? right.create_time).valueOf(),
  );
};

const getMallOrderDetailRows = (db: Database.Database, orderIds: number[]): Map<number, MallOrderDetailRow[]> => {
  if (orderIds.length === 0) return new Map();
  const rows = db
    .prepare(
      `
        SELECT
          od.order_id,
          od.sku_id,
          od.count,
          od.sku_amount,
          od.option_amount,
          ods.product_name,
          ods.sku_name
        FROM order_detail od
        LEFT JOIN order_detail_snap ods ON ods.order_detail_id = od.id
        WHERE od.order_id IN (${inPlaceholders(orderIds)})
          AND od.detail_type = 1
      `,
    )
    .all(...orderIds) as MallOrderDetailRow[];

  const detailMap = new Map<number, MallOrderDetailRow[]>();
  for (const row of rows) {
    const list = detailMap.get(row.order_id) ?? [];
    list.push(row);
    detailMap.set(row.order_id, list);
  }
  return detailMap;
};

const getRestaurantSetting = (db: Database.Database, restaurantId: number): RestaurantSettingRecord | null => {
  const row = db.prepare("SELECT * FROM restaurant_setting WHERE restaurant_id = ? LIMIT 1").get(restaurantId) as
    | RestaurantSettingRecord
    | undefined;
  return row ?? null;
};

const getPreviousParqalSummary = (
  db: Database.Database,
  restaurantId: number,
  startDate: string,
  endDate: string,
): PreviousParqalSummary => {
  if (dayjs(endDate).isBefore(dayjs(startDate), "day")) {
    return {
      totalAmount: 0,
      totalVatSales: 0,
      totalVatAmount: 0,
      totalVatExemptionSales: 0,
      totalExemption: 0,
      totalPromoDiscount: 0,
    };
  }

  // 历史累计汇总改为餐厅维度，覆盖该餐厅的全部离线订单。
  const row = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(total_amount), 0) AS totalAmount,
          COALESCE(SUM(vat_sales), 0) AS totalVatSales,
          COALESCE(SUM(vat_amount), 0) AS totalVatAmount,
          COALESCE(SUM(vat_exempt_sales), 0) AS totalVatExemptionSales,
          COALESCE(SUM(vat_exemption), 0) AS totalExemption,
          COALESCE(SUM(promo_discount), 0) AS totalPromoDiscount
        FROM order_summary
        WHERE restaurant_id = @restaurantId
          AND date(trans_date) BETWEEN @startDate AND @endDate
          AND order_channel = @orderChannel
      `,
    )
    .get({
      restaurantId,
      startDate,
      endDate,
      orderChannel: BACKEND_ORDER_CHANNEL_OFFLINE,
    }) as PreviousParqalSummary | undefined;

  return (
    row ?? {
      totalAmount: 0,
      totalVatSales: 0,
      totalVatAmount: 0,
      totalVatExemptionSales: 0,
      totalExemption: 0,
      totalPromoDiscount: 0,
    }
  );
};

const classifyParqalTender = (
  payment: OrderPaymentRecord,
  channelNameMap: Map<string, string>,
): "cash" | "credit" | "charge" | "giftcheck" | "othertender" => {
  const channelCode = String(payment.channel_code ?? "").toUpperCase();
  const channelName = String(channelNameMap.get(payment.channel_code ?? "") ?? "").toUpperCase();
  if (channelCode === "CASH" || channelName === "CASH") return "cash";
  if (channelName === "CREDIT") return "credit";
  if (channelName === "COUPONS") return "giftcheck";
  if (channelName === "CHARGE") return "charge";
  return "othertender";
};

// 普通折扣或优惠券存在时，Parqal VAT 按后端逻辑扣除折扣中包含的 12% VAT。
const getParqalVatAmount = (payment: OrderPaymentRecord, tax?: OrderPaymentTaxRecord): number => {
  if (!tax) return 0;
  const originalVat = Number(tax.tax_amount ?? 0);
  const amount = Number(payment.amount ?? 0);
  const realAmount = Number(payment.real_amount ?? amount);
  if (originalVat === 0 || amount <= realAmount) return originalVat;

  const discount = Number(payment.discount_amount ?? 0) || Number(payment.coupon_amount ?? 0);
  return originalVat - Math.round((discount * 12) / 112);
};

const emptyParqalTrx = (): ParqalTrx => ({
  receiptno: "",
  void: "0",
  cash: "0.00",
  credit: "0.00",
  charge: "0.00",
  giftcheck: "0.00",
  othertender: "0.00",
  linedisc: "0.00",
  linesenior: "0.00",
  evat: "0.00",
  linepwd: "0.00",
  linediplomat: "0.00",
  linenac: "0.00",
  linespd: "0.00",
  subtotal: "0.00",
  disc: "0.00",
  senior: "0.00",
  pwd: "0.00",
  diplomat: "0.00",
  nac: "0.00",
  vat: "0.00",
  exvat: "0.00",
  incvat: "0.00",
  localtax: "0.00",
  amusement: "0.00",
  ewt: "0.00",
  service: "0.00",
  taxsale: "0.00",
  notaxsale: "0.00",
  taxexsale: "0.00",
  taxincsale: "0.00",
  zerosale: "0.00",
  vatexempt: "0.00",
  customercount: "0",
  gross: "0.00",
  refund: "0.00",
  taxrate: "12.00",
  posted: "",
  qty: "0",
  created: "1",
  memo: "",
  line: [],
});

const addReceiptRange = (totals: ParqalTotals, receiptNo: string): void => {
  if (!/^\d+$/.test(receiptNo)) return;
  const numeric = BigInt(receiptNo || "0");
  totals.minReceipt = totals.minReceipt == null || numeric < totals.minReceipt ? numeric : totals.minReceipt;
  totals.maxReceipt = totals.maxReceipt == null || numeric > totals.maxReceipt ? numeric : totals.maxReceipt;
};

const applyParqalTender = (
  totals: ParqalTotals,
  trx: ParqalTrx,
  tender: ReturnType<typeof classifyParqalTender>,
  amount: number,
  isRefund: boolean,
): void => {
  const signedAmount = isRefund ? -amount : amount;
  switch (tender) {
    case "cash":
      totals.cash += signedAmount;
      totals.cashCount += 1;
      break;
    case "credit":
      totals.credit += signedAmount;
      totals.creditCount += 1;
      break;
    case "charge":
      totals.charge += signedAmount;
      totals.chargeCount += 1;
      break;
    case "giftcheck":
      totals.giftcheck += signedAmount;
      totals.giftcheckCount += 1;
      break;
    default:
      totals.othertender += signedAmount;
      totals.othertenderCount += 1;
      break;
  }
  trx[tender] = formatAmountSigned(amount, isRefund);
};

const buildParqalLineData = (
  payment: OrderPaymentRecord,
  order: FoodOrderRecord | undefined,
  detailMap: Map<number, MallOrderDetailRow[]>,
  productMap: Map<string, ParqalProduct>,
  inventory: string,
  trx: ParqalTrx,
  isRefund: boolean,
): number => {
  const details = order ? (detailMap.get(order.id) ?? []) : [];
  const lines = trx.line as ParqalLine[];
  let productAmount = 0;
  let qty = 0;
  const paymentAmount = payment.real_amount ?? payment.amount ?? 0;
  const vatAmount = Math.abs(Number(trx.vat ?? "0.00") * 100);

  for (const detail of details) {
    const unitAmount = (detail.sku_amount ?? 0) + (detail.option_amount ?? 0);
    const lineTotal = unitAmount * (detail.count ?? 0);
    productAmount += lineTotal;
    qty += detail.count ?? 0;
    // 先用正数分摊商品行税额，再由退款标记统一添加负号。
    const lineTaxAmount = paymentAmount === 0 ? 0 : (vatAmount * lineTotal) / Math.abs(paymentAmount);
    const sku = String(detail.sku_id);
    const name = detail.sku_name || detail.product_name || `SKU-${sku}`;

    lines.push({
      sku,
      qty: String(isRefund ? -(detail.count ?? 0) : (detail.count ?? 0)),
      unitprice: formatAmount(unitAmount),
      disc: "0.00",
      senior: "0.00",
      pwd: "0.00",
      diplomat: "0.00",
      nac: "0.00",
      spd: "0.00",
      taxtype: "0",
      tax: formatAmountSigned(lineTaxAmount, isRefund),
      memo: "",
      total: formatAmountSigned(lineTotal, isRefund),
      choicetype: "",
    });

    if (!productMap.has(sku)) {
      productMap.set(sku, {
        sku,
        name,
        inventory,
        price: formatAmount(unitAmount),
        category: "99",
      });
    }
  }

  trx.qty = String(isRefund ? -qty : qty);
  trx.subtotal = formatAmountSigned(productAmount, isRefund);
  return productAmount;
};

const buildParqalData = (
  db: Database.Database,
  restaurantId: number,
  birConfig: RestaurantOperationConfigRecord,
  reportRecord: RestaurantReportPrintRecord,
  reportJson: Record<string, any>,
  date: string,
): ParqalBuildData => {
  const previousSummary = getPreviousParqalSummary(
    db,
    restaurantId,
    dayjs(birConfig.audit_time).format("YYYY-MM-DD"),
    dayjs(date).subtract(1, "day").format("YYYY-MM-DD"),
  );
  const previousNotax = previousSummary.totalVatExemptionSales * 0.8;
  const previousNrgt = previousSummary.totalAmount;
  // 后端累计税额会扣除普通优惠金额中包含的 VAT。
  const previousTax =
    previousSummary.totalVatAmount - Math.trunc((Number(previousSummary.totalPromoDiscount ?? 0) * 12) / 112);
  const previousTaxSale = previousSummary.totalAmount - previousNotax;
  const orderNos = resolveMallOrderInnerNos(
    db,
    restaurantId,
    getReportOrderNos(db, restaurantId, reportRecord, reportJson, "sale"),
    "sale",
    reportRecord,
  );
  const refundOrderNos = resolveMallOrderInnerNos(
    db,
    restaurantId,
    getReportOrderNos(db, restaurantId, reportRecord, reportJson, "refund"),
    "refund",
    reportRecord,
  );
  const payments = getMallPaymentsByReport(db, restaurantId, orderNos, refundOrderNos);
  const orders = getMallOrdersByInnerNos(
    db,
    restaurantId,
    Array.from(new Set(payments.map((payment) => payment.order_inner_no))),
  );
  const orderMap = new Map(
    orders.filter((order) => order.order_type === ORDER_TYPE.MASTER).map((order) => [order.order_inner_no, order]),
  );
  const detailMap = getMallOrderDetailRows(
    db,
    orders.map((order) => order.id),
  );
  const taxMap = getPaymentTaxMap(
    db,
    payments.map((payment) => payment.id),
  );
  const channelNameMap = getPaymentChannelNameMap(db);
  const restaurantSetting = getRestaurantSetting(db, restaurantId);
  const inventory = restaurantSetting?.inventory === 1 ? "1" : "0";
  const productMap = new Map<string, ParqalProduct>();
  const totals: ParqalTotals = {
    gross: 0,
    vat: 0,
    taxSale: 0,
    vatExempt: 0,
    promo: 0,
    promoCount: 0,
    refund: 0,
    refundCount: 0,
    senior: 0,
    seniorCount: 0,
    pwd: 0,
    pwdCount: 0,
    service: 0,
    serviceCount: 0,
    trxCount: 0,
    cash: 0,
    cashCount: 0,
    credit: 0,
    creditCount: 0,
    charge: 0,
    chargeCount: 0,
    giftcheck: 0,
    giftcheckCount: 0,
    othertender: 0,
    othertenderCount: 0,
    minReceipt: null,
    maxReceipt: null,
  };

  const trxList = payments.map((payment) => {
    const isRefund = payment.transaction_status === PAYMENT_STATUS.REFUNDED;
    const order = orderMap.get(payment.order_inner_no);
    const tax = taxMap.get(payment.id);
    const amount = payment.real_amount ?? payment.amount ?? 0;
    const serviceFee = payment.real_service_fee ?? 0;
    const discountAmount = payment.discount_amount ?? 0;
    const couponAmount = payment.coupon_amount ?? 0;
    const trx = emptyParqalTrx();
    const receiptNo = toBackendReceiptNo(payment.receipt_no || order?.order_no || payment.order_inner_no);
    const signed = isRefund ? -1 : 1;

    trx.receiptno = receiptNo;
    trx.posted = dayjsOrEndOfDay(
      payment.transaction_return_time ?? payment.update_time ?? payment.create_time,
      date,
    ).format("YYYYMMDDHHmmss");
    trx.customercount = String((isRefund ? -1 : 1) * (order?.customer_num ?? payment.real_customer_num ?? 1));
    addReceiptRange(totals, receiptNo);

    totals.gross += signed * amount;
    trx.gross = formatAmountSigned(amount, isRefund);
    if (tax) {
      const vatAmount = getParqalVatAmount(payment, tax);
      totals.vat += signed * vatAmount;
      trx.vat = formatAmountSigned(vatAmount, isRefund);
      trx.incvat = trx.vat;
      trx.evat = formatAmountSigned(tax.less_vat ?? 0, isRefund);
      const taxSale = !isScDiscount(payment.discount_type) && !isPwdDiscount(payment.discount_type) ? amount : 0;
      totals.taxSale += signed * taxSale;
      trx.taxsale = formatAmountSigned(taxSale, isRefund);
      trx.taxincsale = trx.taxsale;
      const vatExempt = (tax.vat_exempt_sales ?? 0) * 0.8;
      totals.vatExempt += signed * vatExempt;
      trx.vatexempt = formatAmountDouble(isRefund ? -vatExempt : vatExempt);
    }

    if (discountAmount !== 0) {
      if (isScDiscount(payment.discount_type)) {
        totals.senior += signed * discountAmount;
        totals.seniorCount += 1;
        trx.senior = formatAmountSigned(discountAmount, isRefund);
      } else if (isPwdDiscount(payment.discount_type)) {
        totals.pwd += signed * discountAmount;
        totals.pwdCount += 1;
        trx.pwd = formatAmountSigned(discountAmount, isRefund);
      } else {
        totals.promo += signed * discountAmount;
        totals.promoCount += 1;
        trx.disc = formatAmountSigned(discountAmount, isRefund);
      }
    }

    if (couponAmount !== 0) {
      totals.promo += signed * couponAmount;
      totals.promoCount += 1;
      trx.disc = formatAmountSigned(couponAmount, isRefund);
    }

    if (serviceFee !== 0) {
      totals.service += signed * serviceFee;
      totals.serviceCount += 1;
      trx.service = formatAmountSigned(serviceFee, isRefund);
    }

    if (isRefund) {
      totals.refund += amount;
      totals.refundCount += 1;
      trx.refund = formatAmount(amount);
    }

    applyParqalTender(totals, trx, classifyParqalTender(payment, channelNameMap), amount, isRefund);
    buildParqalLineData(payment, order, detailMap, productMap, inventory, trx, isRefund);
    totals.trxCount += 1;
    return trx;
  });

  const openTime =
    payments.length > 0
      ? dayjsOrEndOfDay(payments[0].transaction_return_time ?? payments[0].create_time, date).subtract(
          Math.floor(Math.random() * 17) + 3,
          "minute",
        )
      : dayjsOrEndOfDay(reportRecord.print_end_time, date);
  const closeTime = dayjsOrEndOfDay(reportRecord.print_end_time, date);
  const currentNrgt = previousNrgt + totals.gross;
  const currentTax = previousTax + totals.vat;
  const currentTaxSale = previousTaxSale + totals.taxSale;
  const currentNotax = previousNotax + totals.vatExempt;

  return {
    sales: {
      date: dayjs(date).format("YYYYMMDD"),
      zcounter: toBackendReceiptNo(reportRecord.receipt_id || "0"),
      previousnrgt: formatAmount(previousNrgt),
      nrgt: formatAmount(currentNrgt),
      previoustax: formatAmount(previousTax),
      newtax: formatAmount(currentTax),
      previoustaxsale: formatAmountDouble(previousTaxSale),
      newtaxsale: formatAmountDouble(currentTaxSale),
      previousnotaxsale: formatAmountDouble(previousNotax),
      newnotaxsale: formatAmountDouble(currentNotax),
      opentime: openTime.format("YYYYMMDDHHmmss"),
      closetime: closeTime.format("YYYYMMDDHHmmss"),
      gross: formatAmountDouble(totals.gross),
      vat: formatAmount(totals.vat),
      localtax: "0.00",
      amusement: "0.00",
      ewt: "0.00",
      taxsale: formatAmount(totals.taxSale),
      notaxsale: "0.00",
      zerosale: "0.00",
      vatexempt: formatAmountDouble(totals.vatExempt),
      void: "0.00",
      voidcnt: "0",
      disc: formatAmount(totals.promo),
      disccnt: String(totals.promoCount),
      refund: formatAmount(totals.refund),
      refundcnt: String(totals.refundCount),
      senior: formatAmount(totals.senior),
      seniorcnt: String(totals.seniorCount),
      pwd: formatAmount(totals.pwd),
      pwdcnt: String(totals.pwdCount),
      diplomat: "0.00",
      diplomatcnt: "0",
      nac: "0.00",
      naccnt: "0",
      spd: "0.00",
      spdcnt: "0",
      service: formatAmount(totals.service),
      servicecnt: String(totals.serviceCount),
      receiptstart: totals.minReceipt?.toString() ?? "0",
      receiptend: totals.maxReceipt?.toString() ?? "0",
      trxcnt: String(totals.trxCount),
      cash: formatAmount(totals.cash),
      cashcnt: String(totals.cashCount),
      credit: formatAmount(totals.credit),
      creditcnt: String(totals.creditCount),
      charge: formatAmount(totals.charge),
      chargecnt: String(totals.chargeCount),
      giftcheck: formatAmount(totals.giftcheck),
      giftcheckcnt: String(totals.giftcheckCount),
      othertender: formatAmount(totals.othertender),
      othertendercnt: String(totals.othertenderCount),
    },
    trxList,
    products: Array.from(productMap.values()),
  };
};

const renderParqalXml = (settings: MallCertificationSettings, data: ParqalBuildData): string => {
  const salesOrder = [
    "date",
    "zcounter",
    "previousnrgt",
    "nrgt",
    "previoustax",
    "newtax",
    "previoustaxsale",
    "newtaxsale",
    "previousnotaxsale",
    "newnotaxsale",
    "opentime",
    "closetime",
    "gross",
    "vat",
    "localtax",
    "amusement",
    "ewt",
    "taxsale",
    "notaxsale",
    "zerosale",
    "vatexempt",
    "void",
    "voidcnt",
    "disc",
    "disccnt",
    "refund",
    "refundcnt",
    "senior",
    "seniorcnt",
    "pwd",
    "pwdcnt",
    "diplomat",
    "diplomatcnt",
    "nac",
    "naccnt",
    "spd",
    "spdcnt",
    "service",
    "servicecnt",
    "receiptstart",
    "receiptend",
    "trxcnt",
    "cash",
    "cashcnt",
    "credit",
    "creditcnt",
    "charge",
    "chargecnt",
    "giftcheck",
    "giftcheckcnt",
    "othertender",
    "othertendercnt",
  ];
  const trxOrder = Object.keys(emptyParqalTrx()).filter((key) => key !== "line");
  const lineOrder = [
    "sku",
    "qty",
    "unitprice",
    "disc",
    "senior",
    "pwd",
    "diplomat",
    "nac",
    "spd",
    "taxtype",
    "tax",
    "memo",
    "total",
    "choicetype",
  ];
  const productOrder: Array<keyof ParqalProduct> = ["sku", "name", "inventory", "price", "category"];
  const lines = [
    "<root>",
    "  <id>",
    xmlLine(4, "tenantid", settings.external_id),
    xmlLine(4, "key", settings.external_no),
    xmlLine(4, "tmid", settings.pos_id),
    xmlLine(4, "doc", "SALES_EOD"),
    "  </id>",
    "  <sales>",
    ...salesOrder.map((key) => xmlLine(4, key, data.sales[key])),
  ];

  for (const trx of data.trxList) {
    lines.push("    <trx>");
    lines.push(...trxOrder.map((key) => xmlLine(6, key, trx[key] ?? "")));
    for (const line of trx.line as ParqalLine[]) {
      lines.push("      <line>");
      lines.push(...lineOrder.map((key) => xmlLine(8, key, line[key] ?? "")));
      lines.push("      </line>");
    }
    lines.push("    </trx>");
  }

  lines.push("  </sales>", "  <master>");
  for (const product of data.products) {
    lines.push("    <product>");
    lines.push(...productOrder.map((key) => xmlLine(6, key, product[key])));
    lines.push("    </product>");
  }
  lines.push("  </master>", "</root>", "");
  return lines.join("\n");
};

// 判断折扣类型是否属于 SC。
const isScDiscount = (discountType?: number | null): boolean => discountType === 4 || discountType === 5;

// 判断折扣类型是否属于 PWD。
const isPwdDiscount = (discountType?: number | null): boolean => discountType === 1 || discountType === 3;

// 生成 SM 交易汇总行。
const buildSmTransactionRows = (
  restaurant: RestaurantRecord | null,
  payments: OrderPaymentRecord[],
  orderMap: Map<string, FoodOrderRecord>,
  taxMap: Map<number, OrderPaymentTaxRecord>,
  channelNameMap: Map<string, string>,
): Array<Record<string, unknown>> =>
  payments.flatMap((payment) => {
    const order = orderMap.get(payment.order_inner_no);
    if (!order) return [];

    const tax = taxMap.get(payment.id);
    const isRefund = payment.transaction_status === PAYMENT_STATUS.REFUNDED;
    const guestCount = order.customer_num ?? payment.real_customer_num ?? 1;
    const baseDiscountAmount = (payment.discount_amount ?? 0) + (payment.coupon_amount ?? 0);
    const discountAmount = tax
      ? (tax.pwd_discount ?? 0) + (tax.promo_discount ?? 0) + (payment.coupon_amount ?? 0)
      : baseDiscountAmount;
    const realAmount = payment.real_amount ?? payment.amount ?? 0;
    const channelName = channelNameMap.get(payment.channel_code ?? "") ?? payment.channel_code ?? "";
    const pwdDiscountAmount = isPwdDiscount(payment.discount_type) ? discountAmount : 0;
    const seniorDiscountAmount = isScDiscount(payment.discount_type) ? discountAmount : 0;
    const regularDiscountAmount = discountAmount - pwdDiscountAmount - seniorDiscountAmount;
    const isOfflinePayment = payment.pay_product_type === 0 || payment.pay_product_type === 7;

    return [
      {
        order_num_bill_num: payment.receipt_no || order.order_no || payment.order_inner_no,
        business_day: dayjs(payment.transaction_return_time ?? payment.create_time).format("YYYY-MM-DD"),
        check_open: dayjs(payment.transaction_create_time ?? payment.create_time).format("YYYY-MM-DD HH:mm:ss"),
        check_close: dayjs(payment.transaction_return_time ?? payment.update_time).format("YYYY-MM-DD HH:mm:ss"),
        sales_type: "SM01",
        transaction_type: "",
        void: 0,
        void_amount: "0.00",
        refund: isRefund ? 1 : 0,
        refund_amount: formatAmount(isRefund ? realAmount : 0),
        guest_count: guestCount,
        guest_count_senior:
          payment.discount_type === 4 ? guestCount : payment.discount_type === 5 ? (payment.discount_number ?? 0) : 0,
        guest_count_pwd:
          payment.discount_type === 1 ? guestCount : payment.discount_type === 3 ? (payment.discount_number ?? 0) : 0,
        gross_sales_amount: formatAmount(isRefund ? 0 : (payment.amount ?? order.total_amount)),
        net_sales_amount: formatAmount(isRefund ? 0 : realAmount),
        total_tax: formatAmount(isRefund ? 0 : (tax?.tax_amount ?? payment.real_tax_amount)),
        other_local_tax: "0.00",
        total_service_charge: formatAmount(isRefund ? 0 : (payment.real_service_fee ?? order.service_fee)),
        total_tip: "0.00",
        total_discount: formatAmount(isRefund ? 0 : discountAmount),
        less_tax_amount: formatAmount(isRefund ? 0 : tax?.less_vat),
        tax_exempt_sales: formatAmount(isRefund ? 0 : Math.round(Number(tax?.vat_exempt_sales ?? 0) * 0.8)),
        regular_other_discount_name: regularDiscountAmount !== 0 ? "promoref001=PROMO" : "",
        regular_other_discount_amount: formatAmount(regularDiscountAmount),
        employee_discount_amount: "0.00",
        senior_citizen_discount_amount: formatAmount(isRefund ? 0 : seniorDiscountAmount),
        vip_discount_amount: "0.00",
        pwd_discount_amount: formatAmount(isRefund ? 0 : pwdDiscountAmount),
        national_discount_amount: "0.00",
        smac_discount_amount: "0.00",
        online_deals_discount_name: "",
        online_deals_discount_amount: "0.00",
        discount_field_1_name: "",
        discount_field_2_name: "",
        discount_field_3_name: "",
        discount_field_4_name: "",
        discount_field_5_name: "",
        discount_field_6_name: "",
        discount_field_1_amount: "0.00",
        discount_field_2_amount: "0.00",
        discount_field_3_amount: "0.00",
        discount_field_4_amount: "0.00",
        discount_field_5_amount: "0.00",
        discount_field_6_amount: "0.00",
        payment_type_1: channelName,
        payment_amount_1: formatAmount(realAmount),
        payment_type_2: "",
        payment_amount_2: "0.00",
        payment_type_3: "",
        payment_amount_3: "0.00",
        total_cash_sales_amount: isOfflinePayment ? formatAmount(realAmount) : "0.00",
        total_gift_card_sales_amount: "0.00",
        total_debit_card_sales_amount: "0.00",
        total_online_sales_amount: !isOfflinePayment ? formatAmount(realAmount) : "0.00",
        total_other_tender_sales_amount: "0.00",
        total_mastercard_sales_amount: "0.00",
        total_visa_sales_amount: "0.00",
        total_american_express_sales_amount: "0.00",
        total_diners_sales_amount: "0.00",
        total_jcb_sales_amount: "0.00",
        total_other_credit_card_sales_amount: "0.00",
        terminal_number: "POS001",
        serial_number: restaurant?.restaurant_no ?? "",
      },
    ];
  });

// 生成 SM 交易明细行。
const buildSmTransactionDetailRows = (
  db: Database.Database,
  _restaurant: RestaurantRecord | null,
  payments: OrderPaymentRecord[],
  orders: FoodOrderRecord[],
): Array<Record<string, unknown>> => {
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length === 0) return [];

  const details = db
    .prepare(
      `
        SELECT
          od.id,
          od.order_id,
          od.sku_id,
          od.count,
          od.sku_amount,
          od.option_amount,
          od.detail_type,
          ods.product_name,
          ods.sku_name,
          ods.sku_price,
          ods.variant,
          ods.option_item_json,
          sku.sku_no,
          category.name AS category_name
        FROM order_detail od
        LEFT JOIN order_detail_snap ods ON ods.order_detail_id = od.id
        LEFT JOIN dish_product_sku sku ON sku.id = od.sku_id
        LEFT JOIN dish_product product ON product.id = sku.product_id
        LEFT JOIN dish_category category ON category.id = product.category_id
        WHERE od.order_id IN (${inPlaceholders(orderIds)})
          AND od.detail_type = 1
      `,
    )
    .all(...orderIds) as Array<{
    order_id: number;
    sku_id: number;
    count: number;
    sku_amount: number;
    option_amount: number | null;
    product_name: string | null;
    sku_name: string | null;
    sku_price: number | null;
    variant: number | null;
    option_item_json: string | null;
    sku_no: string | null;
    category_name: string | null;
  }>;

  const paymentMap = new Map(payments.map((payment) => [payment.order_inner_no, payment]));
  const orderById = new Map(orders.map((order) => [order.id, order]));

  return details.flatMap((detail) => {
    const order = orderById.get(detail.order_id);
    if (!order) return [];

    const payment = paymentMap.get(order.order_inner_no);
    if (!payment) return [];

    const isRefund = payment.transaction_status === PAYMENT_STATUS.REFUNDED;
    const menuItemPrice = detail.count * detail.sku_amount + (detail.option_amount ?? 0);
    const totalDiscount = (payment.discount_amount ?? 0) + (payment.coupon_amount ?? 0);
    const paymentAmount = Number(payment.amount ?? 0);
    let discountAmount = 0;
    let transactionItemPrice = 0;
    let discountCode = "";

    if (totalDiscount !== 0 && paymentAmount !== 0) {
      discountAmount = Math.round(menuItemPrice * (totalDiscount / paymentAmount));
      transactionItemPrice = menuItemPrice - discountAmount;
      discountCode = "Promo";
    }
    if (isScDiscount(payment.discount_type) || isPwdDiscount(payment.discount_type)) {
      transactionItemPrice = Math.round((menuItemPrice / 1.12) * 0.8);
      discountAmount = menuItemPrice - transactionItemPrice;
      discountCode = isScDiscount(payment.discount_type) ? "SC" : "PWD";
    }

    // 后端只取前两个 option 名称作为 Modifier。
    const optionNames = getSmModifierNames(detail.option_item_json);
    return [
      {
        order_num_bill_num: payment.receipt_no || order.order_no || payment.order_inner_no,
        item_id: detail.sku_no ?? String(detail.sku_id),
        item_name:
          detail.variant === 1
            ? `${detail.product_name ?? ""}(${detail.sku_name ?? ""})`
            : detail.product_name || detail.sku_name || `SKU-${detail.sku_id}`,
        item_parent_category: detail.category_name ?? "",
        item_category: detail.category_name ?? "",
        item_sub_category: detail.category_name ?? "",
        item_quantity: detail.count,
        transaction_item_price: formatAmount(isRefund ? 0 : transactionItemPrice),
        menu_item_price: formatAmount(menuItemPrice),
        discount_code: discountCode,
        discount_amount: formatAmount(isRefund ? 0 : discountAmount),
        modifier_1_name: optionNames[0] ?? "",
        modifier_1_quantity: optionNames[0] ? detail.count : 0,
        modifier_2_name: optionNames[1] ?? "",
        modifier_2_quantity: optionNames[1] ? detail.count : 0,
        void: 0,
        void_amount: "0.00",
        refund: isRefund ? 1 : 0,
        refund_amount: formatAmount(isRefund ? menuItemPrice : 0),
      },
    ];
  });
};

const getSmModifierNames = (optionItemJson?: string | null): string[] => {
  if (!optionItemJson) return [];
  try {
    const options = JSON.parse(optionItemJson) as Array<Record<string, unknown>>;
    return options
      .map((option) => String(option.option_name ?? option.optionName ?? option.name ?? ""))
      .filter(Boolean)
      .slice(0, 2);
  } catch {
    return [];
  }
};

// 查询并生成 SM CSV 内容。
const buildSmCsvData = (
  db: Database.Database,
  restaurantId: number,
  params: { startTime?: string; endTime?: string; orderInnerNo?: string; refundStatus?: boolean },
): { transactionCsv: string; detailCsv: string; transactionRows: number; detailRows: number } => {
  const payments = getFinalPayments(db, restaurantId, params);
  const orderInnerNos = Array.from(new Set(payments.map((payment) => payment.order_inner_no)));
  const masterOrders = getMasterOrders(db, restaurantId, orderInnerNos);
  const allOrders = getOrdersByInnerNos(db, restaurantId, orderInnerNos);
  const paymentTaxMap = getPaymentTaxMap(
    db,
    payments.map((payment) => payment.id),
  );
  const restaurant = getRestaurant(db, restaurantId);
  const channelNameMap = getPaymentChannelNameMap(db);
  const orderMap = new Map(masterOrders.map((order) => [order.order_inner_no, order]));
  const transactionRows = buildSmTransactionRows(restaurant, payments, orderMap, paymentTaxMap, channelNameMap);
  const detailRows = buildSmTransactionDetailRows(db, restaurant, payments, allOrders);

  return {
    transactionCsv: toCsv(SM_TRANSACTION_COLUMNS, transactionRows),
    detailCsv: toCsv(SM_TRANSACTION_DETAIL_COLUMNS, detailRows),
    transactionRows: transactionRows.length,
    detailRows: detailRows.length,
  };
};

// 生成或覆盖 SM 指定日期范围 CSV 文件。
export const generateSmCsvFiles = (
  db: Database.Database,
  restaurantId: number,
  directory: string,
  startTime: string,
  endTime: string,
): MallCertificationGenerateResult => {
  const result: MallCertificationGenerateResult = { files: [], missing_tables: [], warnings: [] };
  const csvData = buildSmCsvData(db, restaurantId, { startTime, endTime });
  const monthYear = dayjs(endTime).format("MM_YYYY");
  const transactionPath = path.join(directory, `${monthYear}_transactions.csv`);
  const detailPath = path.join(directory, `${monthYear}_transactiondetails.csv`);

  writeTextFile(transactionPath, csvData.transactionCsv, "gbk");
  writeTextFile(detailPath, csvData.detailCsv, "gbk");
  result.files.push(transactionPath, detailPath);

  if (csvData.transactionRows === 0) {
    result.warnings.push("当前日期范围没有可生成的 SM 交易记录。");
  }

  if (csvData.detailRows === 0) {
    result.warnings.push("当前日期范围没有可生成的 SM 交易明细，可能缺少 order_detail/order_detail_snap 数据。");
  }

  return result;
};

// 初始化 SM CSV：无文件时生成最近 30 天；有文件时从 CSV 最后日期增量更新到今天。
export const initializeSmCsvFiles = (
  db: Database.Database,
  restaurantId: number,
  directory: string,
): MallCertificationGenerateResult => {
  const result: MallCertificationGenerateResult = { files: [], missing_tables: [], warnings: [] };
  const transactionPath = findSmCsvPath(directory, "transactions");
  const detailPath = findSmCsvPath(directory, "transactiondetails");
  const today = dayjs().format("YYYY-MM-DD");

  if (!transactionPath || !detailPath) {
    return generateSmCsvFiles(
      db,
      restaurantId,
      directory,
      `${dayjs().subtract(30, "day").format("YYYY-MM-DD")} 00:00:00`,
      `${today} 23:59:59`,
    );
  }

  const latestCsvDate = getLatestSmCsvBusinessDay(transactionPath);
  const last30DaysDate = dayjs().subtract(30, "day").format("YYYY-MM-DD");
  const updateStartDate = dayjs(latestCsvDate).isBefore(dayjs(last30DaysDate)) ? last30DaysDate : latestCsvDate;
  const csvData = buildSmCsvData(db, restaurantId, {
    startTime: `${updateStartDate} 00:00:00`,
    endTime: `${today} 23:59:59`,
  });
  const prunedTransaction = pruneSmTransactionCsv(transactionPath, updateStartDate);
  const prunedDetail = pruneSmDetailCsv(detailPath, prunedTransaction.removedOrderIds);

  writeTextFile(transactionPath, prunedTransaction.content + removeCsvHeader(csvData.transactionCsv), "gbk");
  writeTextFile(detailPath, prunedDetail + removeCsvHeader(csvData.detailCsv), "gbk");
  result.files.push(transactionPath, detailPath);

  if (csvData.transactionRows === 0) {
    result.warnings.push(`从 ${updateStartDate} 到 ${today} 没有可更新的 SM 交易记录。`);
  }

  if (csvData.detailRows === 0) {
    result.warnings.push("SM 增量更新没有可写入的交易明细，可能缺少 order_detail/order_detail_snap 数据。");
  }

  return result;
};

// 向已有 SM CSV 文件追加单笔交易或退款记录。
export const appendSmOrderCsvRecord = (
  db: Database.Database,
  restaurantId: number,
  directory: string,
  orderInnerNo: string,
  refundStatus = false,
): MallCertificationGenerateResult => {
  const result: MallCertificationGenerateResult = { files: [], missing_tables: [], warnings: [] };
  const csvData = buildSmCsvData(db, restaurantId, { orderInnerNo, refundStatus });
  const transactionPath = resolveSmCsvPath(directory, "transactions");
  const detailPath = resolveSmCsvPath(directory, "transactiondetails");

  fs.mkdirSync(directory, { recursive: true });

  if (!fs.existsSync(transactionPath)) {
    writeTextFile(transactionPath, toCsv(SM_TRANSACTION_COLUMNS, []), "gbk");
  }
  if (!fs.existsSync(detailPath)) {
    writeTextFile(detailPath, toCsv(SM_TRANSACTION_DETAIL_COLUMNS, []), "gbk");
  }

  if (csvData.transactionRows > 0) {
    fs.appendFileSync(transactionPath, iconv.encode(removeCsvHeader(csvData.transactionCsv), "gbk"));
    result.files.push(transactionPath);
  }

  if (csvData.detailRows > 0) {
    fs.appendFileSync(detailPath, iconv.encode(removeCsvHeader(csvData.detailCsv), "gbk"));
    result.files.push(detailPath);
  }

  if (csvData.transactionRows === 0) {
    result.warnings.push(`未找到 order_inner_no=${orderInnerNo} 的 SM 交易记录。`);
  }

  return result;
};

// Parqal 汇总数据从日终报告快照读取，缺字段时按 0 降级。
const buildParqalXml = (
  db: Database.Database,
  restaurantId: number,
  birConfig: RestaurantOperationConfigRecord,
  settings: MallCertificationSettings,
  reportRecord: RestaurantReportPrintRecord,
  reportJson: Record<string, any>,
  date: string,
): string => {
  const data = buildParqalData(db, restaurantId, birConfig, reportRecord, reportJson, date);
  return renderParqalXml(settings, data);
};

// 生成 Parqal XML 文件。
export const generateParqalFile = (
  db: Database.Database,
  restaurantId: number,
  settings: MallCertificationSettings,
  date: string,
): MallCertificationGenerateResult => {
  const result: MallCertificationGenerateResult = { files: [], missing_tables: [], warnings: [] };
  const birConfig = getApprovedBirConfig(db, restaurantId);
  const reportRecord = getEndOfDayReport(db, restaurantId, date);

  if (!birConfig) {
    result.missing_tables.push("restaurant_operation_config");
    result.warnings.push("Parqal 认证文件需要餐厅存在已审核通过的 BIR 记录。");
    return result;
  }

  if (!reportRecord) {
    result.missing_tables.push("restaurant_report_print");
    result.warnings.push(`${date} 未找到餐厅已生成的日终报告，无法生成 Parqal 文件。`);
    return result;
  }

  const reportJson = parseReportJson(reportRecord);
  const filename = `sales_${settings.external_id}_${settings.pos_id}_${getFileNameReceiptNo(reportRecord.receipt_id)}.xml`;
  const filePath = path.join(settings.file_download_url, filename);
  writeTextFile(filePath, buildParqalXml(db, restaurantId, birConfig, settings, reportRecord, reportJson, date));
  result.files.push(filePath);
  return result;
};

// 按 SVG 原始宽高栅格化为 PNG，不缩放、不裁剪，保持预览排版和画布尺寸不变。
const svgDataUrlToPng = (dataUrl: string): Buffer => {
  const [, payload = ""] = dataUrl.split(",");
  const svg = Buffer.from(payload, "base64").toString("utf8");
  const renderer = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: { loadSystemFonts: true },
  });
  const image = renderer.render();

  if (image.width !== renderer.width || image.height !== renderer.height) {
    throw new Error("Failed to render Megaworld Z-reading SVG as PNG.");
  }

  return image.asPng();
};

const getReportDate = (value?: string | null): string => dayjs(value || undefined).format("YYYY-MM-DD");

const getReportTime = (value?: string | null): string => dayjs(value || undefined).format("HH:mm:ss");

// Megaworld 的 Z 文件复用本地 End-of-Day Report 文本，并按原始 SVG 尺寸输出 PNG。
const buildMegaworldZReadingPng = (
  db: Database.Database,
  restaurantId: number,
  restaurant: RestaurantRecord | null,
  birConfig: RestaurantOperationConfigRecord,
  reportRecord: RestaurantReportPrintRecord,
  reportJson: Record<string, any>,
): Buffer => {
  const orderNos = getReportOrderNos(db, restaurantId, reportRecord, reportJson, "sale");
  const refundOrderNos = getReportOrderNos(db, restaurantId, reportRecord, reportJson, "refund");
  const channelSettlementReports = getReportChannelSettlementReports(db, restaurantId, reportRecord, reportJson);
  const endTime = reportRecord.print_end_time ?? reportRecord.create_time ?? dayjs().format("YYYY-MM-DD HH:mm:ss");
  const printTime = reportRecord.create_time ?? dayjs().format("YYYY-MM-DD HH:mm:ss");
  const reportData: EndOfDayReportData & { restaurantAddress?: string } = {
    reportDate: getReportDate(reportRecord.print_start_time),
    reportTime: getReportTime(printTime),
    restaurantName: restaurant?.display_name || restaurant?.name || "",
    posName: String(reportRecord.device_no ?? birConfig.device_no ?? ""),
    restaurantAddress: birConfig.restaurant_address ?? "",
    chinese: false,
    vatRegisterStatus: birConfig.vat_register_status === 1,
    tinNumber: birConfig.tin_number ?? "",
    minNumber: birConfig.min_number ?? "",
    serialNumber: birConfig.serial_number ?? "",
    zCount: reportRecord.receipt_id ?? "",
    resetCounterNo: "0",
    printTime,
    startTime: reportRecord.print_start_time,
    endTime,
    begSiNumber: orderNos[0] ?? "",
    endSiNumber: orderNos[orderNos.length - 1] ?? "",
    begCancelledNumber: "",
    endCancelledNumber: "",
    begRefundNumber: refundOrderNos[0] ?? "",
    endRefundNumber: refundOrderNos[refundOrderNos.length - 1] ?? "",
    openingFund: getReportValue(reportJson, "opening_fund", "openingFund"),
    paymentSummaries: channelSettlementReports
      .filter((item: any) => String(item.channel_name ?? item.channelName ?? "").toUpperCase() !== "TOTAL")
      .map((item: any) => ({
        paymentMethod: String(item.channel_name ?? item.channelName ?? "UNKNOWN"),
        amount: Number(item.transaction_amount ?? item.transactionAmount ?? 0),
      })),
    totalPayments: getReportValue(reportJson, "payment_received", "paymentReceived"),
    cancelledAmount: getReportValue(reportJson, "cancelled", "cancelled"),
    refundAmount: getReportValue(reportJson, "refund", "refund"),
    withdrawalAmount: getReportValue(reportJson, "less_withdrawal", "lessWithdrawal"),
    presentAccumulatedSales: getReportValue(reportJson, "present_accumulated_sales", "presentAccumulatedSales"),
    previousAccumulatedSales: getReportValue(reportJson, "past_accumulated_sales", "pastAccumulatedSales"),
    salesOfTheDay: getReportValue(reportJson, "sales_of_the_day", "salesOfTheDay"),
    vatableSales:
      getReportValue(reportJson, "vatable_sales", "vatableSales") ||
      getReportValue(reportJson, "sales_sub_tax", "salesSubTax"),
    vatAmount: getReportValue(reportJson, "vat_amount", "vatAmount") || getReportValue(reportJson, "tax", "tax"),
    // Megaworld Z-reading 复用 EOD 小票字段，VAT EXEMPT SALES 需保持后端同名字段。
    vatExemptSales: getReportValue(reportJson, "vat_exempt_sales", "vatExemptSales"),
    zeroRatedSales: getReportValue(reportJson, "zero_rated_sales", "zeroRatedSales"),
    salesSubTax: getReportValue(reportJson, "sales_sub_tax", "salesSubTax"),
    percentageTax: getReportValue(reportJson, "tax", "tax"),
    exemptSales: getReportValue(reportJson, "exempt_sales", "exemptSales"),
    grossAmount: getReportValue(reportJson, "gross_amount", "grossAmount"),
    lessDiscount: getReportValue(reportJson, "less_discount", "lessDiscount"),
    lessRefund:
      getReportValue(reportJson, "less_refund", "lessRefund") || getReportValue(reportJson, "refund", "refund"),
    lessCancelled:
      getReportValue(reportJson, "less_cancelled", "lessCancelled") ||
      getReportValue(reportJson, "cancelled", "cancelled"),
    lessVatAdjustment: getReportValue(reportJson, "less_vat_adjustment", "lessVatAdjustment"),
    netAmount: getReportValue(reportJson, "net_amount", "netAmount"),
    serviceChargeAmount: getReportValue(reportJson, "service_fee", "serviceFee"),
    serviceChargeTax: Math.max(
      0,
      getReportValue(reportJson, "total_service_fee", "totalServiceFee") -
        getReportValue(reportJson, "service_fee", "serviceFee"),
    ),
    totalServiceCharge: getReportValue(reportJson, "total_service_fee", "totalServiceFee"),
    pwdDiscount: getReportValue(reportJson, "pwd_discount", "pwdDiscount"),
    scDiscount: getReportValue(reportJson, "sc_discount", "scDiscount"),
    naacDiscount: getReportValue(reportJson, "naac_discount", "naacDiscount"),
    soloParentDiscount: getReportValue(reportJson, "solo_parent_discount", "soloParentDiscount"),
    otherDiscount: getReportValue(reportJson, "other_discount", "otherDiscount"),
    pwdTransCount: getReportValue(reportJson, "pwd_transactions", "pwdTransactions"),
    scTransCount: getReportValue(reportJson, "sc_transactions", "scTransactions"),
    regularDiscTransCount: getReportValue(reportJson, "regular_discount_transactions", "regularDiscountTransactions"),
    zeroRatedTransCount: getReportValue(reportJson, "zero_rated_transactions", "zeroRatedTransactions"),
    vatOnRefund: getReportValue(reportJson, "vat_on_refund", "vatOnRefund"),
    otherVatAdjustments: getReportValue(reportJson, "other_vat_adjustments", "otherVatAdjustments"),
    companyName: "Swifood Innovation Inc.",
    companyAddress:
      "Unit 9D, 9th Floor The Valero Tower, 122 Valero Street Salcedo Village, Bel-Air, City of Makati, NCR, Fourth District, Philippines",
    companyTin: "625-748-670-00000",
    birInfo: {
      accNumber: "",
      ptuIssueDate: birConfig.ptu_issue_date ?? "",
      ptuValidUntil: "",
      ptuNumber: birConfig.ptu_number ?? "",
    },
  };

  return svgDataUrlToPng(renderReceiptTextToImageDataUrl(generateEndOfDayReport(reportData, 32, 48)));
};

// 生成 Megaworld S/H/D TXT 与 Z-Reading PNG 文件内容。
const buildMegaworldFiles = (
  db: Database.Database,
  restaurantId: number,
  birConfig: RestaurantOperationConfigRecord,
  settings: MallCertificationSettings,
  reportRecord: RestaurantReportPrintRecord,
  reportJson: Record<string, any>,
  date: string,
): Array<{ filename: string; content: string | Buffer }> => {
  const day = dayjs(date);
  // 后端最新版移除了 S/H/D 文件名末尾的 .txt 扩展名。
  const suffix = `${megaworldMonthCode(day.month() + 1)}${day.format("DD")}`;
  const imageSuffix = `${megaworldMonthCode(day.month() + 1)}${day.format("DD")}.png`;
  const partner = getTopLengthStr(settings.external_id, 4);
  const pos = getLastLengthStr(settings.pos_id, 2);
  const base = `${partner}${pos}1`;
  const fileDate = day.format("MMDDYYYY");
  const previousSummary = getPreviousParqalSummary(
    db,
    restaurantId,
    dayjs(birConfig.audit_time).format("YYYY-MM-DD"),
    day.subtract(1, "day").format("YYYY-MM-DD"),
  );
  const orderNos = resolveMallOrderInnerNos(
    db,
    restaurantId,
    getReportOrderNos(db, restaurantId, reportRecord, reportJson, "sale"),
    "sale",
    reportRecord,
  );
  const refundOrderNos = resolveMallOrderInnerNos(
    db,
    restaurantId,
    getReportOrderNos(db, restaurantId, reportRecord, reportJson, "refund"),
    "refund",
    reportRecord,
  );
  const payments = getMallPaymentsByReport(db, restaurantId, orderNos, refundOrderNos);
  const orderMap = new Map(
    getMallOrdersByInnerNos(db, restaurantId, Array.from(new Set(payments.map((payment) => payment.order_inner_no))))
      .filter((order) => order.order_type === ORDER_TYPE.MASTER)
      .map((order) => [order.order_inner_no, order]),
  );
  const hourMap = new Map<string, { net: number; totalOrderCount: number; customerNum: number }>();
  let totalServiceAmount = 0;
  let totalOrderCount = 0;
  let totalCustomerNum = 0;

  // 后端按支付明细重算订单数、客数、服务费和小时净额；退款交易按负数扣减。
  for (const payment of payments) {
    const isRefund = payment.transaction_status === PAYMENT_STATUS.REFUNDED;
    const signed = isRefund ? -1 : 1;
    const order = orderMap.get(payment.order_inner_no);
    const customerNum = order?.customer_num ?? payment.real_customer_num ?? 1;
    const serviceAmount = payment.real_service_fee ?? 0;
    const netAmount = (payment.real_amount ?? payment.amount ?? 0) - serviceAmount;
    const hourValue = dayjsOrEndOfDay(
      payment.transaction_return_time ?? payment.update_time ?? payment.create_time,
      date,
    ).hour();
    const hourCode = String(hourValue === 0 ? 24 : hourValue).padStart(2, "0");
    const hourRow = hourMap.get(hourCode) ?? { net: 0, totalOrderCount: 0, customerNum: 0 };

    totalServiceAmount += signed * serviceAmount;
    totalOrderCount += signed;
    totalCustomerNum += signed * customerNum;
    hourRow.net += signed * netAmount;
    hourRow.totalOrderCount += signed;
    hourRow.customerNum += signed * customerNum;
    hourMap.set(hourCode, hourRow);
  }

  const net = getReportValue(reportJson, "net_amount", "netAmount");
  const gross = getReportValue(reportJson, "gross_amount", "grossAmount");
  const vat = getReportValue(reportJson, "vat_amount", "vatAmount");
  const refund = getReportValue(reportJson, "refund", "refund");
  const vatExemptSales = getReportValue(reportJson, "vat_exempt_sales", "vatExemptSales");
  const pwdDiscount = getReportValue(reportJson, "pwd_discount", "pwdDiscount");
  const scDiscount = getReportValue(reportJson, "sc_discount", "scDiscount");
  const otherDiscountOnly = getReportValue(reportJson, "other_discount", "otherDiscount");
  const settlementReports = getReportChannelSettlementReports(db, restaurantId, reportRecord, reportJson);
  const cash = settlementReports
    .filter((item: any) => String(item.channel_name ?? item.channelName ?? "").toUpperCase() === "CASH")
    .reduce((sum: number, item: any) => sum + Number(item.transaction_amount ?? item.transactionAmount ?? 0), 0);
  // CREDIT、DEBIT、CHARGE 都归入 Megaworld 信用卡金额。
  const credit = settlementReports
    .filter((item: any) =>
      ["CREDIT", "DEBIT", "CHARGE"].includes(String(item.channel_name ?? item.channelName ?? "").toUpperCase()),
    )
    .reduce((sum: number, item: any) => sum + Number(item.transaction_amount ?? item.transactionAmount ?? 0), 0);
  // S 文件第 16 项直接汇总非 CASH、CREDIT、DEBIT 的支付渠道；TOTAL 只是汇总行，不是支付方式。
  const totalOtherAmount = settlementReports
    .filter((item: any) => {
      const channelName = String(item.channel_name ?? item.channelName ?? "").toUpperCase();
      return !["CASH", "CREDIT", "DEBIT", "TOTAL"].includes(channelName);
    })
    .reduce((sum: number, item: any) => sum + Number(item.transaction_amount ?? item.transactionAmount ?? 0), 0);
  const allTodayRealAmount = previousSummary.totalAmount + net;
  const dailyReportNumber = toBackendReceiptNo(reportRecord.receipt_id || "0");
  const discountRows: string[] = [];

  if (otherDiscountOnly !== 0) discountRows.push(`PROMO, PROMO DISCOUNT, ${formatAmount(otherDiscountOnly)}`);
  if (scDiscount !== 0) discountRows.push(`SC, SC DISCOUNT, ${formatAmount(scDiscount)}`);
  if (pwdDiscount !== 0) discountRows.push(`PWD, PWD DISCOUNT, ${formatAmount(pwdDiscount)}`);

  const hourLines = Array.from(hourMap.entries())
    .sort(([left], [right]) => Number(left) - Number(right))
    .flatMap(([hourCode, row]) => [
      `04${hourCode}`,
      `05${megaworldRawAmount(row.net)}`,
      `06${row.totalOrderCount}`,
      `07${row.customerNum}`,
    ]);

  const restaurant = getRestaurant(db, restaurantId);

  return [
    {
      filename: `S${base}.${suffix}`,
      content: [
        `01${settings.external_id ?? ""}`,
        `02${settings.pos_id ?? ""}`,
        `03${fileDate}`,
        `04${megaworldRawAmount(previousSummary.totalAmount)}`,
        `05${megaworldRawAmount(allTodayRealAmount)}`,
        `06${megaworldRawAmount(gross)}`,
        `07${megaworldRawAmount(vatExemptSales)}`,
        `08${megaworldRawAmount(pwdDiscount + scDiscount)}`,
        `09${megaworldRawAmount(otherDiscountOnly)}`,
        `10${megaworldRawAmount(refund)}`,
        `11${megaworldRawAmount(vat)}`,
        `12${megaworldRawAmount(totalServiceAmount)}`,
        `13${megaworldRawAmount(net)}`,
        `14${megaworldRawAmount(cash)}`,
        `15${megaworldRawAmount(credit)}`,
        `16${megaworldRawAmount(totalOtherAmount)}`,
        `17${megaworldRawAmount(0)}`,
        `18${totalCustomerNum}`,
        `19${dailyReportNumber}`,
        `20${totalOrderCount}`,
        "2101",
        `22${megaworldRawAmount(net)}`,
        "",
      ].join("\n"),
    },
    {
      filename: `H${base}.${suffix}`,
      content: [
        `01${settings.external_id ?? ""}`,
        `02${settings.pos_id ?? ""}`,
        `03${fileDate}`,
        ...hourLines,
        `08${megaworldRawAmount(net)}`,
        `09${totalOrderCount}`,
        `10${totalCustomerNum}`,
        "",
      ].join("\n"),
    },
    {
      filename: `D${base}.${suffix}`,
      content: `${discountRows.join("\n")}${discountRows.length > 0 ? "\n" : ""}`,
    },
    {
      filename: `Z${base}.${imageSuffix}`,
      content: buildMegaworldZReadingPng(db, restaurantId, restaurant, birConfig, reportRecord, reportJson),
    },
  ];
};

// 生成 Megaworld 认证文件。
export const generateMegaworldFiles = (
  db: Database.Database,
  restaurantId: number,
  settings: MallCertificationSettings,
  date: string,
  _index = 1,
): MallCertificationGenerateResult => {
  const result: MallCertificationGenerateResult = { files: [], missing_tables: [], warnings: [] };
  const birConfig = getApprovedBirConfig(db, restaurantId);
  const reportRecord = getEndOfDayReport(db, restaurantId, date);

  if (!birConfig) {
    result.missing_tables.push("restaurant_operation_config");
    result.warnings.push("Megaworld 认证文件需要餐厅存在已审核通过的 BIR 记录。");
    return result;
  }

  if (!reportRecord) {
    result.missing_tables.push("restaurant_report_print");
    result.warnings.push(`${date} 未找到餐厅已生成的日终报告，无法生成 Megaworld 文件。`);
    return result;
  }

  const reportJson = parseReportJson(reportRecord);
  const files = buildMegaworldFiles(db, restaurantId, birConfig, settings, reportRecord, reportJson, date);
  for (const file of files) {
    const filePath = path.join(settings.file_download_url, file.filename);
    // PNG 按二进制写入；S/H/D 继续沿用原有 UTF-8 文本输出。
    if (Buffer.isBuffer(file.content)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content);
    } else {
      writeTextFile(filePath, file.content);
    }
    result.files.push(filePath);
  }

  return result;
};

// 合并多个生成结果。
export const mergeGenerateResults = (results: MallCertificationGenerateResult[]): MallCertificationGenerateResult => ({
  files: results.flatMap((result) => result.files),
  missing_tables: Array.from(new Set(results.flatMap((result) => result.missing_tables))),
  warnings: Array.from(new Set(results.flatMap((result) => result.warnings))),
});
