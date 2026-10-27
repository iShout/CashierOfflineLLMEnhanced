import type Database from "better-sqlite3";
import { getDB } from "../index";
import { SYSTEM_RECEIPT_NO_LENGTH } from "@shared/constants/enums";

const INITIAL_SYSTEM_TRANSACTION_NO = "0000000000000000001";
const INITIAL_ORDER_SERIAL_NUMBER = "00000000000000000001";
const INITIAL_REFUND_SERIAL_NO = "0000000000000000001";
const INITIAL_RECEIPT_NO = "1".padStart(SYSTEM_RECEIPT_NO_LENGTH, "0");
const INITIAL_RECEIPT_ID = "1".padStart(20, "0");
const INITIAL_TAKE_FOOD_NO = "001";
const MAX_TAKE_FOOD_NO = 999;

const LOCAL_SEQUENCE_DEFINITIONS = {
  local_system_transaction_no: {
    initialValue: INITIAL_SYSTEM_TRANSACTION_NO,
    maxValue: BigInt("9999999999999999999"),
    width: 19,
    exceededMessage: "local_system_transaction_no 已超过19位上限",
  },
  next_order_serial_number: {
    initialValue: INITIAL_ORDER_SERIAL_NUMBER,
    maxValue: BigInt("9".repeat(20)),
    width: 20,
    exceededMessage: "order_serial_number 已超过20位上限",
  },
  next_refund_serial_no: {
    initialValue: INITIAL_REFUND_SERIAL_NO,
    maxValue: BigInt("9".repeat(19)),
    width: 19,
    exceededMessage: "refund_serial_no 已超过19位上限",
  },
  next_receipt_no: {
    initialValue: INITIAL_RECEIPT_NO,
    maxValue: BigInt("9".repeat(SYSTEM_RECEIPT_NO_LENGTH)),
    width: SYSTEM_RECEIPT_NO_LENGTH,
    exceededMessage: `receipt_no 已超过${SYSTEM_RECEIPT_NO_LENGTH}位上限`,
  },
  next_receipt_id: {
    initialValue: INITIAL_RECEIPT_ID,
    maxValue: BigInt("9".repeat(20)),
    width: 20,
    exceededMessage: "receipt_id 已超过20位上限",
  },
} as const;

type LocalSequenceName = keyof typeof LOCAL_SEQUENCE_DEFINITIONS;

type LocalSettingRecord = {
  id: number;
  restaurant_id: number;
  local_system_transaction_no: string | null;
  next_order_serial_number: string | null;
  next_refund_serial_no: string | null;
  next_receipt_no: string | null;
  next_receipt_id: string | null;
  next_take_food_no: string | null;
  create_time: string;
  update_time: string | null;
};

const formatLocalSettingTime = (): string => new Date().toISOString();

const formatLocalSequenceValue = (sequenceName: LocalSequenceName, value: bigint): string => {
  const definition = LOCAL_SEQUENCE_DEFINITIONS[sequenceName];

  return value.toString().padStart(definition.width, "0");
};

const parseLocalSequenceValue = (sequenceName: LocalSequenceName, value?: string | null): bigint => {
  const definition = LOCAL_SEQUENCE_DEFINITIONS[sequenceName];
  const normalizedValue = String(value || definition.initialValue).trim();

  if (!/^\d+$/.test(normalizedValue)) {
    return BigInt(definition.initialValue);
  }

  return BigInt(normalizedValue);
};

const assertLocalSequenceAvailable = (sequenceName: LocalSequenceName, value: bigint): void => {
  const definition = LOCAL_SEQUENCE_DEFINITIONS[sequenceName];

  if (value > definition.maxValue) {
    throw new Error(definition.exceededMessage);
  }
};

const normalizeTakeFoodNoValue = (value?: string | null): number => {
  const normalizedValue = String(value || INITIAL_TAKE_FOOD_NO).trim();

  if (!/^\d+$/.test(normalizedValue)) {
    return 1;
  }

  const numericValue = Number(normalizedValue);

  if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > MAX_TAKE_FOOD_NO) {
    return 1;
  }

  return numericValue;
};

const formatTakeFoodNoValue = (value: number): string => String(value).padStart(3, "0");

const nextTakeFoodNoValue = (value: number): number => (value >= MAX_TAKE_FOOD_NO ? 1 : value + 1);

const advanceLocalSequencePastUsedValue = (
  restaurantId: number,
  sequenceName: LocalSequenceName,
  usedValue?: string | null,
  db: Database.Database = getDB(),
): void => {
  const normalizedUsedValue = String(usedValue || "").trim();

  if (!/^\d+$/.test(normalizedUsedValue)) {
    return;
  }

  const localSetting = db.prepare("SELECT * FROM local_setting WHERE restaurant_id = @restaurant_id LIMIT 1").get({
    restaurant_id: restaurantId,
  }) as LocalSettingRecord | undefined;

  if (!localSetting) {
    return;
  }

  const currentValue = parseLocalSequenceValue(sequenceName, localSetting[sequenceName]);
  const targetValue = BigInt(normalizedUsedValue) + BigInt(1);

  if (currentValue >= targetValue) {
    return;
  }

  db.prepare(
    `
      UPDATE local_setting
      SET ${sequenceName} = @sequence_value,
          update_time = @update_time
      WHERE restaurant_id = @restaurant_id
    `,
  ).run({
    restaurant_id: restaurantId,
    sequence_value: formatLocalSequenceValue(sequenceName, targetValue),
    update_time: formatLocalSettingTime(),
  });
};

const getLatestOrderSerialNumber = (restaurantId: number, db: Database.Database = getDB()): string | null => {
  const row = db
    .prepare(
      `
        SELECT order_serial_number
        FROM food_order
        WHERE restaurant_id = @restaurant_id
          AND order_serial_number IS NOT NULL
          AND length(order_serial_number) = 20
        ORDER BY order_serial_number DESC
        LIMIT 1
      `,
    )
    .get({ restaurant_id: restaurantId }) as { order_serial_number: string } | undefined;

  return row?.order_serial_number ?? null;
};

const getLatestSystemTransactionNo = (restaurantId: number, db: Database.Database = getDB()): string | null => {
  const rows = db
    .prepare(
      `
        SELECT system_transaction_no
        FROM order_payment
        WHERE restaurant_id = @restaurant_id
          AND system_transaction_no IS NOT NULL
          AND system_transaction_no <> ''
      `,
    )
    .all({ restaurant_id: restaurantId }) as Array<{ system_transaction_no: string | null }>;
  let maxValue: bigint | null = null;

  for (const row of rows) {
    const values = String(row.system_transaction_no || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value));

    for (const value of values) {
      const numericValue = BigInt(value);
      maxValue = maxValue == null || numericValue > maxValue ? numericValue : maxValue;
    }
  }

  return maxValue == null ? null : formatLocalSequenceValue("local_system_transaction_no", maxValue);
};

const getLatestRefundSerialNo = (restaurantId: number, db: Database.Database = getDB()): string | null => {
  const row = db
    .prepare(
      `
        SELECT refund_serial_no
        FROM order_payment
        WHERE restaurant_id = @restaurant_id
          AND refund_serial_no IS NOT NULL
          AND length(refund_serial_no) = 19
        ORDER BY refund_serial_no DESC
        LIMIT 1
      `,
    )
    .get({ restaurant_id: restaurantId }) as { refund_serial_no: string } | undefined;

  return row?.refund_serial_no ?? null;
};

const getLatestReceiptNo = (restaurantId: number, db: Database.Database = getDB()): string | null => {
  const row = db
    .prepare(
      `
        SELECT receipt_no
        FROM order_payment
        WHERE restaurant_id = @restaurant_id
          AND receipt_no IS NOT NULL
          AND length(receipt_no) = @receipt_no_length
          AND receipt_no NOT GLOB '*[^0-9]*'
        ORDER BY receipt_no DESC
        LIMIT 1
      `,
    )
    .get({ restaurant_id: restaurantId, receipt_no_length: SYSTEM_RECEIPT_NO_LENGTH }) as
    | { receipt_no: string }
    | undefined;

  return row?.receipt_no ?? null;
};

const getLatestReceiptId = (restaurantId: number, db: Database.Database = getDB()): string | null => {
  const row = db
    .prepare(
      `
        SELECT receipt_id
        FROM restaurant_report_print
        WHERE restaurant_id = @restaurant_id
          AND print_type = 2
          AND receipt_id IS NOT NULL
          AND length(receipt_id) = 20
          AND receipt_id NOT GLOB '*[^0-9]*'
        ORDER BY receipt_id DESC
        LIMIT 1
      `,
    )
    .get({ restaurant_id: restaurantId }) as { receipt_id: string } | undefined;

  return row?.receipt_id ?? null;
};

const getLatestUsedSequenceValue = (
  restaurantId: number,
  sequenceName: LocalSequenceName,
  db: Database.Database = getDB(),
): string | null => {
  if (sequenceName === "local_system_transaction_no") {
    return getLatestSystemTransactionNo(restaurantId, db);
  }

  if (sequenceName === "next_order_serial_number") {
    return getLatestOrderSerialNumber(restaurantId, db);
  }

  if (sequenceName === "next_refund_serial_no") {
    return getLatestRefundSerialNo(restaurantId, db);
  }

  if (sequenceName === "next_receipt_id") {
    return getLatestReceiptId(restaurantId, db);
  }

  return getLatestReceiptNo(restaurantId, db);
};

const initializeLocalSettingSequenceForRestaurant = (
  restaurantId: number,
  sequenceName: LocalSequenceName,
  db: Database.Database = getDB(),
): void => {
  const localSetting = db.prepare("SELECT * FROM local_setting WHERE restaurant_id = @restaurant_id LIMIT 1").get({
    restaurant_id: restaurantId,
  }) as LocalSettingRecord | undefined;

  if (!localSetting || String(localSetting[sequenceName] || "").trim()) {
    return;
  }

  const definition = LOCAL_SEQUENCE_DEFINITIONS[sequenceName];
  const latestUsedValue = getLatestUsedSequenceValue(restaurantId, sequenceName, db);
  const nextValue = latestUsedValue
    ? formatLocalSequenceValue(sequenceName, BigInt(latestUsedValue) + BigInt(1))
    : definition.initialValue;

  // 空值代表当前餐厅该序列尚未初始化；只在登录/首次实际取用时写入一次初始 next 值。
  db.prepare(
    `
      UPDATE local_setting
      SET ${sequenceName} = @sequence_value,
          update_time = @update_time
      WHERE restaurant_id = @restaurant_id
    `,
  ).run({
    restaurant_id: restaurantId,
    sequence_value: nextValue,
    update_time: formatLocalSettingTime(),
  });
};

export const initializeLocalSettingSequencesForRestaurant = (
  restaurantId?: number | null,
  db: Database.Database = getDB(),
): void => {
  if (!restaurantId) return;

  ensureLocalSettingForRestaurant(restaurantId, db);
  initializeLocalSettingSequenceForRestaurant(restaurantId, "local_system_transaction_no", db);
  initializeLocalSettingSequenceForRestaurant(restaurantId, "next_order_serial_number", db);
  initializeLocalSettingSequenceForRestaurant(restaurantId, "next_refund_serial_no", db);
  initializeLocalSettingSequenceForRestaurant(restaurantId, "next_receipt_no", db);
  initializeLocalSettingSequenceForRestaurant(restaurantId, "next_receipt_id", db);
  resetLocalTakeFoodNoIfEmpty(restaurantId, db);
};

export const ensureLocalSettingForRestaurant = (
  restaurantId?: number | null,
  db: Database.Database = getDB(),
): LocalSettingRecord | null => {
  if (!restaurantId) {
    return null;
  }

  const now = formatLocalSettingTime();

  // 每个餐厅只保留一条本地设置；登录和打印都会调用，保证升级老库也能兜底创建。
  db.prepare(
    `
      INSERT INTO local_setting (
        restaurant_id,
        create_time,
        update_time
      ) VALUES (
        @restaurant_id,
        @create_time,
        @update_time
      )
      ON CONFLICT(restaurant_id) DO NOTHING
    `,
  ).run({
    restaurant_id: restaurantId,
    create_time: now,
    update_time: now,
  });

  return db.prepare("SELECT * FROM local_setting WHERE restaurant_id = @restaurant_id LIMIT 1").get({
    restaurant_id: restaurantId,
  }) as LocalSettingRecord;
};

export const resetLocalTakeFoodNoIfEmpty = (
  restaurantId: number,
  db: Database.Database = getDB(),
): void => {
  const localSetting = ensureLocalSettingForRestaurant(restaurantId, db);

  if (!localSetting || String(localSetting.next_take_food_no || "").trim()) {
    return;
  }

  // 取餐号源首次使用默认从 001 开始，后续由 EOD 生成节点负责重置。
  db.prepare(
    `
      UPDATE local_setting
      SET next_take_food_no = @next_take_food_no,
          update_time = @update_time
      WHERE restaurant_id = @restaurant_id
    `,
  ).run({
    restaurant_id: restaurantId,
    next_take_food_no: INITIAL_TAKE_FOOD_NO,
    update_time: formatLocalSettingTime(),
  });
};

export const nextLocalSequenceValue = (
  restaurantId: number,
  sequenceName: LocalSequenceName,
  db: Database.Database = getDB(),
): string => {
  let localSetting = ensureLocalSettingForRestaurant(restaurantId, db);

  if (!localSetting) {
    throw new Error("restaurant_id is required for local sequence value.");
  }

  if (!String(localSetting[sequenceName] || "").trim()) {
    initializeLocalSettingSequenceForRestaurant(restaurantId, sequenceName, db);
    localSetting = db.prepare("SELECT * FROM local_setting WHERE restaurant_id = @restaurant_id LIMIT 1").get({
      restaurant_id: restaurantId,
    }) as LocalSettingRecord;
  }

  const currentValue = parseLocalSequenceValue(sequenceName, localSetting[sequenceName]);

  assertLocalSequenceAvailable(sequenceName, currentValue);

  const currentNo = formatLocalSequenceValue(sequenceName, currentValue);
  const nextNo = formatLocalSequenceValue(sequenceName, currentValue + BigInt(1));

  db.prepare(
    `
      UPDATE local_setting
      SET ${sequenceName} = @sequence_value,
          update_time = @update_time
      WHERE restaurant_id = @restaurant_id
    `,
  ).run({
    restaurant_id: restaurantId,
    sequence_value: nextNo,
    update_time: formatLocalSettingTime(),
  });

  return currentNo;
};

export const nextLocalSystemTransactionNo = (restaurantId: number, db: Database.Database = getDB()): string =>
  nextLocalSequenceValue(restaurantId, "local_system_transaction_no", db);

export const nextLocalOrderSerialNumber = (restaurantId: number, db: Database.Database = getDB()): string =>
  nextLocalSequenceValue(restaurantId, "next_order_serial_number", db);

export const nextLocalRefundSerialNo = (restaurantId: number, db: Database.Database = getDB()): string =>
  nextLocalSequenceValue(restaurantId, "next_refund_serial_no", db);

export const nextLocalReceiptNo = (restaurantId: number, db: Database.Database = getDB()): string =>
  nextLocalSequenceValue(restaurantId, "next_receipt_no", db);

export const nextLocalReceiptId = (restaurantId: number, db: Database.Database = getDB()): string =>
  nextLocalSequenceValue(restaurantId, "next_receipt_id", db);

export const nextLocalTakeFoodNo = (restaurantId: number, db: Database.Database = getDB()): string => {
  const localSetting = ensureLocalSettingForRestaurant(restaurantId, db);

  if (!localSetting) {
    throw new Error("restaurant_id is required for take_food_no.");
  }

  const currentValue = normalizeTakeFoodNoValue(localSetting.next_take_food_no);
  const currentNo = formatTakeFoodNoValue(currentValue);
  const nextNo = formatTakeFoodNoValue(nextTakeFoodNoValue(currentValue));

  // 排队取餐号在订单支付成功事务内取用并递增，保证 food_order 与号源同时提交。
  db.prepare(
    `
      UPDATE local_setting
      SET next_take_food_no = @next_take_food_no,
          update_time = @update_time
      WHERE restaurant_id = @restaurant_id
    `,
  ).run({
    restaurant_id: restaurantId,
    next_take_food_no: nextNo,
    update_time: formatLocalSettingTime(),
  });

  return currentNo;
};

export const resetLocalTakeFoodNo = (restaurantId: number, db: Database.Database = getDB()): void => {
  ensureLocalSettingForRestaurant(restaurantId, db);

  // EOD 生成成功后重新从 001 开始维护当前餐厅的排队取餐号。
  db.prepare(
    `
      UPDATE local_setting
      SET next_take_food_no = @next_take_food_no,
          update_time = @update_time
      WHERE restaurant_id = @restaurant_id
    `,
  ).run({
    restaurant_id: restaurantId,
    next_take_food_no: INITIAL_TAKE_FOOD_NO,
    update_time: formatLocalSettingTime(),
  });
};

export const advanceLocalOrderSerialNumberPastValue = (
  restaurantId: number,
  usedValue?: string | null,
  db: Database.Database = getDB(),
): void => advanceLocalSequencePastUsedValue(restaurantId, "next_order_serial_number", usedValue, db);

export const advanceLocalRefundSerialNoPastValue = (
  restaurantId: number,
  usedValue?: string | null,
  db: Database.Database = getDB(),
): void => advanceLocalSequencePastUsedValue(restaurantId, "next_refund_serial_no", usedValue, db);

export const advanceLocalReceiptNoPastValue = (
  restaurantId: number,
  usedValue?: string | null,
  db: Database.Database = getDB(),
): void => advanceLocalSequencePastUsedValue(restaurantId, "next_receipt_no", usedValue, db);

export const advanceLocalReceiptIdPastValue = (
  restaurantId: number,
  usedValue?: string | null,
  db: Database.Database = getDB(),
): void => advanceLocalSequencePastUsedValue(restaurantId, "next_receipt_id", usedValue, db);
