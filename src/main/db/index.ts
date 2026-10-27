import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";
import { schemas } from "./schemas/schemas";
import { CREATE_ORDER_PAYMENT_TABLE } from "./schemas/order-schemas";
import { CREATE_RESTAURANT_WAITER_CLOCK_RECORD_TABLE } from "./schemas/shift-schemas";
import { CREATE_RESTAURANT_REPORT_PRINT_TABLE } from "./schemas/report-schemas";
import { CREATE_SCHEDULED_ORDER_TASK_TABLE } from "./schemas/scheduled-order-task-schemas";
import { CREATE_RESTAURANT_OPERATION_CONFIG_TABLE } from "./schemas/settings-shemas";
import {
  normalizeEndOfDayOrderInnerNos,
  normalizeWaiterClockReportJsonText,
} from "./DBManager/report-json-normalizers";

type BSDatabase = Database.Database;
let db: BSDatabase;

const initDB = (dbPathOverride?: string): void => {
  const dbPath =
    dbPathOverride ??
    (app.isPackaged
      ? path.join(app.getPath("userData"), "database.db")
      : path.join(__dirname, "../../resources/database.db"));

  db = new Database(dbPath);
  createTables();
  migrateTables();
};

const createTables = (): void => {
  schemas.forEach((schema) => {
    db.exec(schema);
  });
};

const addColumnIfMissing = (tableName: string, columnName: string, columnDefinition: string): void => {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
};

const addServerIdIfMissing = (tableName: string): void => {
  addColumnIfMissing(tableName, "server_id", "server_id INTEGER");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_${tableName}_server_id
      ON ${tableName} (server_id)
      WHERE server_id IS NOT NULL
  `);
};

const getColumnInfo = (
  tableName: string,
): Array<{ name: string; notnull: number; dflt_value: string | null }> => {
  return db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
    notnull: number;
    dflt_value: string | null;
  }>;
};

const rebuildTableFromSchema = (tableName: string, createSchema: string): void => {
  const backupTableName = `${tableName}_rebuild_backup`;
  const sourceColumns = getColumnInfo(tableName).map((column) => column.name);

  db.transaction(() => {
    db.exec(`DROP TABLE IF EXISTS ${backupTableName}`);
    db.exec(`ALTER TABLE ${tableName} RENAME TO ${backupTableName}`);

    const oldIndexes = db
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND tbl_name = @tableName
            AND name NOT LIKE 'sqlite_autoindex%'
        `,
      )
      .all({ tableName: backupTableName }) as Array<{ name: string }>;
    oldIndexes.forEach((index) => {
      db.exec(`DROP INDEX IF EXISTS ${index.name}`);
    });

    db.exec(createSchema);
    const targetColumns = getColumnInfo(tableName).map((column) => column.name);
    const copyColumns = sourceColumns.filter((columnName) => targetColumns.includes(columnName));

    if (copyColumns.length > 0) {
      const columnList = copyColumns.join(", ");
      db.exec(`
        INSERT INTO ${tableName} (${columnList})
        SELECT ${columnList}
        FROM ${backupTableName}
      `);
    }

    db.exec(`DROP TABLE ${backupTableName}`);
    db.exec(createSchema);
  })();
};

// 旧数据库可能把 POS 字段声明为必填；重建后只保留为可空历史元数据。
const makeLegacyDeviceNoColumnsNullable = (): void => {
  const tableSchemas = [
    ["order_payment", CREATE_ORDER_PAYMENT_TABLE],
    ["restaurant_waiter_clock_record", CREATE_RESTAURANT_WAITER_CLOCK_RECORD_TABLE],
    ["restaurant_report_print", CREATE_RESTAURANT_REPORT_PRINT_TABLE],
    ["scheduled_order_task", CREATE_SCHEDULED_ORDER_TASK_TABLE],
    ["restaurant_operation_config", CREATE_RESTAURANT_OPERATION_CONFIG_TABLE],
  ] as const;

  tableSchemas.forEach(([tableName, createSchema]) => {
    const deviceColumn = getColumnInfo(tableName).find((column) => column.name === "device_no");

    if (deviceColumn?.notnull === 1 || deviceColumn?.dflt_value != null) {
      rebuildTableFromSchema(tableName, createSchema);
    }
  });
};

const normalizeLocalSettingSequenceColumns = (): void => {
  const sequenceColumns = [
    "local_system_transaction_no",
    "next_order_serial_number",
    "next_refund_serial_no",
    "next_receipt_no",
    "next_receipt_id",
    "next_take_food_no",
  ];
  const columns = db.prepare("PRAGMA table_info(local_setting)").all() as Array<{
    name: string;
    notnull: number;
    dflt_value: string | null;
  }>;
  const columnByName = new Map(columns.map((column) => [column.name, column]));
  const shouldRebuild = sequenceColumns.some((columnName) => {
    const column = columnByName.get(columnName);

    return !column || column.notnull === 1 || column.dflt_value != null;
  });

  if (!shouldRebuild) {
    return;
  }

  db.transaction(() => {
    db.exec("DROP TABLE IF EXISTS local_setting_new");
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_setting_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurant_id INTEGER NOT NULL,
        local_system_transaction_no TEXT,
        next_order_serial_number TEXT,
        next_refund_serial_no TEXT,
        next_receipt_no TEXT,
        next_receipt_id TEXT,
        next_take_food_no TEXT,
        create_time TEXT NOT NULL,
        update_time TEXT,
        UNIQUE (restaurant_id)
      )
    `);
    db.exec(`
      INSERT INTO local_setting_new (
        id,
        restaurant_id,
        local_system_transaction_no,
        next_order_serial_number,
        next_refund_serial_no,
        next_receipt_no,
        next_receipt_id,
        next_take_food_no,
        create_time,
        update_time
      )
      SELECT
        id,
        restaurant_id,
        local_system_transaction_no,
        next_order_serial_number,
        next_refund_serial_no,
        next_receipt_no,
        next_receipt_id,
        next_take_food_no,
        create_time,
        update_time
      FROM local_setting
    `);
    db.exec("DROP TABLE local_setting");
    db.exec("ALTER TABLE local_setting_new RENAME TO local_setting");
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_local_setting_restaurant_id
      ON local_setting (restaurant_id)
    `);
  })();
};

type OptionJsonRecord = Record<string, unknown>;

const asOptionJsonRecord = (value: unknown): OptionJsonRecord => {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as OptionJsonRecord) : {};
};

const asOptionJsonArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

// 历史订单快照可能保存了 snake_case/name 小料结构，启动时统一修正为后端 camelCase 结构。
const normalizeOrderDetailSnapOptionItemJson = (value: string | null): string | null => {
  if (!value) return value;

  try {
    const optionList = JSON.parse(value);
    const normalized = asOptionJsonArray(optionList).map((option) => {
      const optionRecord = asOptionJsonRecord(option);
      const optionItemList = optionRecord.option_item_list ?? optionRecord.optionItemList;

      return {
        optionNo: optionRecord.optionNo ?? optionRecord.option_no ?? null,
        optionName: optionRecord.optionName ?? optionRecord.option_name ?? optionRecord.name ?? "",
        optionItemList: asOptionJsonArray(optionItemList).map((optionItem) => {
          const optionItemRecord = asOptionJsonRecord(optionItem);

          return {
            optionItemNo: optionItemRecord.optionItemNo ?? optionItemRecord.option_item_no ?? null,
            productOptionItemNo:
              optionItemRecord.productOptionItemNo ?? optionItemRecord.product_option_item_no ?? null,
            optionItemName:
              optionItemRecord.optionItemName ?? optionItemRecord.option_item_name ?? optionItemRecord.name ?? "",
            price: Number(optionItemRecord.price ?? 0),
          };
        }),
      };
    });

    return JSON.stringify(normalized);
  } catch {
    return value;
  }
};

const normalizeExistingOrderDetailSnapOptionItemJson = (): void => {
  const rows = db
    .prepare(
      `
        SELECT id, option_item_json
        FROM order_detail_snap
        WHERE option_item_json IS NOT NULL
          AND option_item_json <> ''
      `,
    )
    .all() as Array<{ id: number; option_item_json: string | null }>;

  if (rows.length === 0) {
    return;
  }

  const updateStmt = db.prepare(`
    UPDATE order_detail_snap
    SET option_item_json = @option_item_json
    WHERE id = @id
  `);

  db.transaction((records: Array<{ id: number; option_item_json: string | null }>) => {
    for (const row of records) {
      const normalizedJson = normalizeOrderDetailSnapOptionItemJson(row.option_item_json);

      if (normalizedJson && normalizedJson !== row.option_item_json) {
        updateStmt.run({
          id: row.id,
          option_item_json: normalizedJson,
        });
      }
    }
  })(rows);
};

// 旧版误把完整菜品对象写入 detail_snapshot；后端只保存 optionList。
const normalizeExistingOrderDetailSnapshot = (): void => {
  const rows = db
    .prepare(
      `
        SELECT id, detail_snapshot
        FROM order_detail
        WHERE detail_snapshot IS NOT NULL
          AND detail_snapshot <> ''
      `,
    )
    .all() as Array<{ id: number; detail_snapshot: string | null }>;

  const updateStmt = db.prepare(`
    UPDATE order_detail
    SET detail_snapshot = @detail_snapshot
    WHERE id = @id
  `);

  db.transaction((records: Array<{ id: number; detail_snapshot: string | null }>) => {
    for (const row of records) {
      if (!row.detail_snapshot) continue;

      try {
        const parsed = JSON.parse(row.detail_snapshot) as unknown;
        const optionList = Array.isArray(parsed)
          ? parsed
          : asOptionJsonRecord(parsed).option_list ?? asOptionJsonRecord(parsed).optionList ?? [];
        const normalizedJson = normalizeOrderDetailSnapOptionItemJson(JSON.stringify(optionList));

        if (normalizedJson && normalizedJson !== row.detail_snapshot) {
          updateStmt.run({ id: row.id, detail_snapshot: normalizedJson });
        }
      } catch {
        // 无法解析的历史值原样保留，避免启动迁移破坏未知数据。
      }
    }
  })(rows);
};

const normalizeExistingFoodOrderPrintContentJson = (): void => {
  const rows = db
    .prepare(
      `
        SELECT id, content_json
        FROM food_order_print_info
        WHERE content_json IS NOT NULL
          AND content_json <> ''
      `,
    )
    .all() as Array<{ id: number; content_json: string }>;
  const updateStmt = db.prepare(`
    UPDATE food_order_print_info
    SET content_json = @content_json
    WHERE id = @id
  `);

  db.transaction((records: Array<{ id: number; content_json: string }>) => {
    for (const row of records) {
      try {
        const content = JSON.parse(row.content_json) as Record<string, unknown>;
        const rawDate = String(content.orderDate ?? "");
        const rawTime = String(content.orderTime ?? "");
        const itemList = asOptionJsonArray(content.itemList).map((item) => {
          const record = asOptionJsonRecord(item);
          const count = Number(record.number ?? 0) || 0;
          const rawPrice = String(record.price ?? "");
          const linePrice = rawPrice.includes(".") ? Number(rawPrice) : (Number(rawPrice) || 0) / 100;
          const unitPrice = count > 0 ? linePrice / count : linePrice;
          const itemName = String(record.itemName ?? "");

          return {
            number: record.number ?? null,
            itemName: itemName.includes("@") ? itemName : `${itemName}@${unitPrice.toFixed(2)}`,
            price: linePrice.toFixed(2),
            categoryId: record.categoryId ?? null,
            chinese: record.chinese ?? null,
            is80Paper: record.is80Paper ?? null,
          };
        });
        const normalizePrintItems = (value: unknown) => asOptionJsonArray(value).map((item) => {
          const record = asOptionJsonRecord(item);
          return {
            number: record.number ?? null,
            itemName: record.itemName ?? null,
            price: record.price ?? null,
            categoryId: record.categoryId ?? null,
            chinese: record.chinese ?? null,
            is80Paper: record.is80Paper ?? null,
          };
        });
        const bir = asOptionJsonRecord(content.birPrintInfo);
        const printOrderKeys = [
          "restaurantNo", "orderId", "orderInnerNo", "associationType", "printType", "restaurantName",
          "restaurantAddress", "orderDate", "orderTime", "waiterName", "paymentWaiterName", "refundWaiterName",
          "tableNo", "customerNum", "note", "serviceFee", "itemNum", "totalAmount", "discountAmount",
          "discountNumber", "paymentChannel", "chinese", "copy", "showOrderNo", "paymentAmount", "transactionFee",
          "itemList", "kitchenItemList", "deviceNo", "restaurantNameOrderType", "printerType", "taxAmount",
          "discountType", "vatableSales", "vatExemptSales", "vatExemption", "zeroRatedSales", "lessVat",
          "promoDiscount", "taxFee", "userAddress", "userPhone", "deliveryNote", "deliveryFee", "deliveryType",
          "merchantDeliveryFee", "packagingFee", "tableFoodNo", "paymentReceiptId", "paymentSystemTransNo",
          "refundReceiptId", "refundSystemTransNo", "orderSerialNumber", "paymentPrintCount", "orderPrintCount",
          "kitchenPrintCount", "billPrintCount", "refundPrintCount", "change", "cashReceiptAmount", "nonVat",
          "timeZoneCode", "countryName", "channelReferenceNo", "discounterName", "discountValidityPeriod",
          "discountId", "discountSerialNo", "customizeInfo", "isReprint", "receiptStatement", "vatRegisterStatus",
          "refundSerialNo", "orderFirstPrintTime", "billFirstPrintTime", "paymentFirstPrintTime",
          "refundFirstPrintTime", "firstPrintTime", "takeoutChannel", "couponsAmount", "qrCodeContent",
          "isCrmOrder", "companyName", "companyTin", "rePrintContent", "birStatus", "birPrintInfo", "senderInfo",
          "discountFirstPrint", "customerDiningStyle", "printerFontSize", "senderInfoReq",
        ] as const;
        const normalized = {
          ...Object.fromEntries(printOrderKeys.map((key) => [key, content[key] === "" || content[key] === undefined ? null : content[key]])),
          itemList,
          kitchenItemList: normalizePrintItems(content.kitchenItemList),
          chinese: content.chinese ?? false,
          copy: content.copy ?? 1,
          vatRegisterStatus: content.vatRegisterStatus ?? false,
          isCrmOrder: content.isCrmOrder ?? false,
          // 离线模式没有外卖、二维码和寄件数据，字段按后端模型保留并置空。
          userAddress: null,
          userPhone: null,
          deliveryNote: null,
          deliveryFee: null,
          deliveryType: null,
          merchantDeliveryFee: null,
          packagingFee: null,
          takeoutChannel: null,
          qrCodeContent: null,
          senderInfo: null,
          senderInfoReq: null,
          orderDate: rawDate.slice(0, 10).replaceAll("-", "/"),
          orderTime: rawTime.length >= 19 ? rawTime.slice(11, 19) : rawTime,
          birPrintInfo: content.birPrintInfo ? {
            tinNumber: bir.tinNumber ?? null, merchantAddress: bir.merchantAddress ?? null,
            minNumber: bir.minNumber ?? null, serialNumber: bir.serialNumber ?? null,
            ptuNumber: bir.ptuNumber ?? null, ptuIssueDate: bir.ptuIssueDate ?? null,
            ptuValidUntil: bir.ptuValidUntil ?? null, swifoodAddress: bir.swifoodAddress ?? null,
            accreditationNumber: bir.accreditationNumber ?? null, taxpayerName: bir.taxpayerName ?? null,
            validUntil: bir.validUntil ?? null, tradeName: bir.tradeName ?? null,
          } : null,
        };
        const normalizedJson = JSON.stringify(normalized);

        if (normalizedJson !== row.content_json) {
          updateStmt.run({ id: row.id, content_json: normalizedJson });
        }
      } catch {
        // 无法解析的历史打印快照原样保留。
      }
    }
  })(rows);
};

const END_OF_DAY_REPORT_TYPE = 2;

const reportNumberValue = (value: unknown): number => Number(value ?? 0) || 0;
const reportNullableNumber = (value: unknown): number | null =>
  value === undefined || value === null ? null : reportNumberValue(value);

const normalizeEndOfDayReportJsonForBackend = (restaurantId: number, value: string | null): string | null => {
  if (!value) return value;

  try {
    const report = JSON.parse(value) as Record<string, any>;
    const orderNos = normalizeEndOfDayOrderInnerNos(
      db,
      restaurantId,
      Array.isArray(report.orderNos) ? report.orderNos : [],
      "receipt_no",
    );
    const refundOrderNos = normalizeEndOfDayOrderInnerNos(
      db,
      restaurantId,
      Array.isArray(report.refundOrderNos) ? report.refundOrderNos : [],
      "refund_serial_no",
    );

    return JSON.stringify({
      presentAccumulatedSales: reportNumberValue(report.presentAccumulatedSales),
      pastAccumulatedSales: reportNumberValue(report.pastAccumulatedSales),
      salesOfTheDay: reportNumberValue(report.salesOfTheDay),
      channelSettlementReports: (Array.isArray(report.channelSettlementReports) ? report.channelSettlementReports : []).map(
        (channel: Record<string, unknown>) => ({
          channelName: channel.channelName ?? null,
          transactionCount: reportNullableNumber(channel.transactionCount),
          transactionAmount: reportNullableNumber(channel.transactionAmount),
        }),
      ),
      openingFund: reportNullableNumber(report.openingFund),
      cashInDrawer: reportNullableNumber(report.cashInDrawer),
      lessWithdrawal: reportNullableNumber(report.lessWithdrawal),
      paymentReceived: reportNumberValue(report.paymentReceived),
      shortOrOver: reportNullableNumber(report.shortOrOver),
      vatableSales: reportNumberValue(report.vatableSales),
      vatAmount: reportNumberValue(report.vatAmount),
      vatExemptSales: reportNumberValue(report.vatExemptSales),
      vatExemption: reportNumberValue(report.vatExemption),
      zeroRatedSales: reportNumberValue(report.zeroRatedSales),
      grossAmount: reportNumberValue(report.grossAmount),
      lessDiscount: reportNumberValue(report.lessDiscount),
      lessRefund: reportNumberValue(report.lessRefund),
      lessCancelled: reportNumberValue(report.lessCancelled),
      lessVatAdjustment: reportNumberValue(report.lessVatAdjustment),
      netAmount: reportNumberValue(report.netAmount),
      pwdDiscount: reportNumberValue(report.pwdDiscount),
      scDiscount: reportNumberValue(report.scDiscount),
      naacDiscount: reportNumberValue(report.naacDiscount),
      soloParentDiscount: reportNumberValue(report.soloParentDiscount),
      otherDiscount: reportNumberValue(report.otherDiscount),
      cancelled: reportNumberValue(report.cancelled),
      refund: reportNumberValue(report.refund),
      pwdTransactions: reportNumberValue(report.pwdTransactions),
      scTransactions: reportNumberValue(report.scTransactions),
      regularDiscountTransactions: reportNumberValue(report.regularDiscountTransactions),
      zeroRatedTransactions: reportNumberValue(report.zeroRatedTransactions),
      vatOnRefund: reportNumberValue(report.vatOnRefund),
      otherVatAdjustments: reportNumberValue(report.otherVatAdjustments),
      serviceFee: reportNumberValue(report.serviceFee),
      serviceFeeTax: reportNumberValue(report.serviceFeeTax),
      totalServiceFee: reportNumberValue(report.totalServiceFee),
      salesSubTax: reportNumberValue(report.salesSubTax),
      tax: reportNumberValue(report.tax),
      exemptSales: reportNumberValue(report.exemptSales),
      orderNos,
      refundOrderNos,
    });
  } catch {
    return value;
  }
};

const normalizeExistingEndOfDayReportJson = (): void => {
  const rows = db
    .prepare(
      `
        SELECT id, restaurant_id, report_json
        FROM restaurant_report_print
        WHERE print_type = @printType
          AND report_json IS NOT NULL
          AND report_json <> ''
          AND (
            report_json LIKE '%orderNos%'
            OR report_json LIKE '%refundOrderNos%'
            OR report_json LIKE '%channelSettlementReports%'
            OR report_json LIKE '%openingFund%'
            OR report_json LIKE '%cashInDrawer%'
          )
      `,
    )
    .all({ printType: END_OF_DAY_REPORT_TYPE }) as Array<{
    id: number;
    restaurant_id: number;
    report_json: string | null;
  }>;

  if (rows.length === 0) {
    return;
  }

  const updateStmt = db.prepare(`
    UPDATE restaurant_report_print
    SET report_json = @reportJson
    WHERE id = @id
  `);

  db.transaction((records: Array<{ id: number; restaurant_id: number; report_json: string | null }>) => {
    for (const row of records) {
      const normalizedJson = normalizeEndOfDayReportJsonForBackend(row.restaurant_id, row.report_json);

      if (normalizedJson && normalizedJson !== row.report_json) {
        updateStmt.run({
          id: row.id,
          reportJson: normalizedJson,
        });
      }
    }
  })(rows);
};

// 历史签退记录保存的是完整打印模型，启动时收敛为线上 waiter clock report_json 结构。
const normalizeExistingWaiterClockReportJson = (): void => {
  const rows = db
    .prepare(
      `
        SELECT id, report_json
        FROM restaurant_waiter_clock_record
        WHERE report_json IS NOT NULL
          AND report_json <> ''
      `,
    )
    .all() as Array<{ id: number; report_json: string | null }>;

  if (rows.length === 0) {
    return;
  }

  const updateStmt = db.prepare(`
    UPDATE restaurant_waiter_clock_record
    SET report_json = @reportJson
    WHERE id = @id
  `);

  db.transaction((records: Array<{ id: number; report_json: string | null }>) => {
    for (const row of records) {
      const normalizedJson = normalizeWaiterClockReportJsonText(row.report_json);

      if (normalizedJson && normalizedJson !== row.report_json) {
        updateStmt.run({
          id: row.id,
          reportJson: normalizedJson,
        });
      }
    }
  })(rows);
};

const migrateTables = (): void => {
  // 账号不再绑定 POS，旧缓存表不承载业务数据，可在升级时直接移除。
  db.exec("DROP TABLE IF EXISTS local_device_binding");
  addColumnIfMissing("app_log", "tag", "tag TEXT DEFAULT NULL");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_app_log_tag
    ON app_log(tag)
  `);
  addColumnIfMissing(
    "restaurant_waiter_clock_record",
    "clock_in_local_image",
    "clock_in_local_image TEXT DEFAULT NULL",
  );
  addColumnIfMissing(
    "restaurant_waiter_clock_record",
    "clock_out_local_image",
    "clock_out_local_image TEXT DEFAULT NULL",
  );
  addColumnIfMissing("local_setting", "next_order_serial_number", "next_order_serial_number TEXT");
  addColumnIfMissing("local_setting", "next_refund_serial_no", "next_refund_serial_no TEXT");
  addColumnIfMissing("local_setting", "next_receipt_no", "next_receipt_no TEXT");
  addColumnIfMissing("local_setting", "next_receipt_id", "next_receipt_id TEXT");
  addColumnIfMissing("local_setting", "next_take_food_no", "next_take_food_no TEXT");
  normalizeLocalSettingSequenceColumns();
  [
    "food_order",
    "food_order_print_info",
    "order_detail",
    "order_detail_snap",
    "order_payment",
    "order_payment_info",
    "order_payment_tax",
    "order_status_change",
    "waiter_clock_order",
    "order_summary",
  ].forEach(addServerIdIfMissing);
  // 班次同步沿用订单的本地主键与服务端主键分离模型。
  ["restaurant_waiter_clock_record", "restaurant_waiter_allowance", "withdrawal_record"].forEach(
    addServerIdIfMissing,
  );
  // 历史 POS 字段继续保留以兼容旧数据，但新数据不再要求终端号。
  addColumnIfMissing("order_payment", "device_no", "device_no TEXT");
  addColumnIfMissing("restaurant_report_print", "sync_status", "sync_status INTEGER DEFAULT 1 NOT NULL");
  makeLegacyDeviceNoColumnsNullable();
  db.exec("DROP INDEX IF EXISTS idx_order_payment_restaurant_id_device_no");
  db.exec(`
    UPDATE restaurant_report_print
    SET sync_status = push_status
    WHERE sync_status = 1
      AND push_status = 2
  `);
  normalizeExistingOrderDetailSnapOptionItemJson();
  normalizeExistingOrderDetailSnapshot();
  normalizeExistingFoodOrderPrintContentJson();
  normalizeExistingEndOfDayReportJson();
  normalizeExistingWaiterClockReportJson();
};

const getDB = (): BSDatabase => {
  if (!db) {
    throw new Error("Database has not been initialized. Call initDB() first.");
  }

  return db;
};

export { initDB, getDB };
