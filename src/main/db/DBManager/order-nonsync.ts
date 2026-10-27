// order模块下非同步数据的方法
import { getDB } from "../index";
import iconv from "iconv-lite";
import {
  constructOrderInnerNo,
  constructOrderNo,
  buildSqlParams,
  construcMchOrderId,
  generateSnowflakeId,
} from "../utils";
import {
  CLOCK_ORDER_TYPE,
  ORDER_CHANGE_STATUS,
  ORDER_STATUS,
  ORDER_TYPE,
  PAYMENT_STATUS,
  PRODUCT_STATUS,
} from "../constants/order";
import { statusChangeRemark } from "../maps";
import dayjs from "dayjs";
import {
  getCreateOrderDetailStmt,
  getCreateOrderDetailSnapStmt,
  getCreateOrderPaymentStmt,
  getCreateOrderPaymentTaxStmt,
  getCreateOrderStatusChangeStmt,
  getSelectProcessingMasterOrderStmt,
  getSelectSuccessfulOrderPaymentByOrderInnerNoStmt,
  getSelectOrderPaymentTaxByOrderPaymentIdStmt,
  getSelectSkuIdBySkuNoStmt,
  getSelectOrderListByOrderInnerNoStmt,
  getSelectOrderDetailByOrderIdStmt,
  getSelectOrderDetailSnapByOrderIdStmt,
  getUpdateOrderPaymentFinishStmt,
  getUpdateFoodOrderPaymentStatusStmt,
  getUpdateFoodOrderRefundStatusStmt,
} from "./order-stmts";

import { getCurrentSession } from "@main/authManager";
import { getCurrentRestaurantSettings } from "./restaurant-settings-nonsync";

import { queryCurrentContry } from "./utils";
import { ensureCurrentWaiterClockOrder } from "./shift-nonsync";
import {
  CUSTOMER_DINING_STYLE,
  ORDER_CHANNEL,
  SERVICE_FEE_TYPE,
  SYSTEM_RECEIPT_NO_LENGTH,
} from "@shared/constants/enums";
import { MAX_RECEIPT_REPRINT_COUNT } from "@shared/constants/print";
import { generateDigitalCopyPreview } from "@main/services/digitalCopyPreview";
import { createPrintOrderSnapshot, stringifyBackendPrintOrder } from "@main/services/printOrderSnapshot";
import { PrintType, PrinterTypeEnum } from "@app-types/models/printEnums";
import {
  nextLocalOrderSerialNumber,
  nextLocalReceiptNo,
  nextLocalRefundSerialNo,
  nextLocalTakeFoodNo,
} from "./local-setting";
import {
  generateBillReceipt,
  generateKitchenReceipt,
  generateOrderReceipt,
  generatePaymentReceipt,
  generateRefundReceipt,
} from "@main/services/printReceiptGenerator";

import type {
  FoodOrderPrintInfoRecord,
  FoodOrderRecord,
  OrderDetailRecord,
  OrderDetailSnapRecord,
  OrderPaymentRecord,
  OrderPaymentTaxRecord,
  OrderStatusChangeRecord,
} from "@app-types/models/orders";
import type {
  RestaurantOperationConfigRecord,
  RestaurantRecord,
  RestaurantSettingRecord,
  RestaurantTableRecord,
  RestaurantWaiterBlueToothSettingRecord,
} from "@app-types/models/settings";
import type { PrintOrderBo } from "@app-types/models/printOrder";

type CreateOrderSkuOption = {
  option_no?: string | null;
  name?: string;
  option_name?: string | null;
  price?: number;
  option_item_list?: Array<{
    option_item_no?: string | null;
    product_option_item_no?: string | null;
    option_item_name?: string | null;
    name?: string;
    price?: number;
  }>;
};

// food_order_print_info.device_no 表示云打印机设备号，离线 Windows 收银不绑定云打印机。
const OFFLINE_CLOUD_PRINTER_DEVICE_NO = null;

const PWD_DISCOUNT_TYPES = [1, 3] as const;
const SC_DISCOUNT_TYPES = [4, 5] as const;
const PWD_SC_DISCOUNT_TYPES = [...PWD_DISCOUNT_TYPES, ...SC_DISCOUNT_TYPES] as const;
const isPwdScDiscountType = (discountType: unknown) =>
  PWD_SC_DISCOUNT_TYPES.some((type) => type === Number(discountType));
const PWD_SC_ACTIVE_PAYMENT_STATUSES = [
  PAYMENT_STATUS.PAY_SUCCESS,
  PAYMENT_STATUS.REFUNDING,
  PAYMENT_STATUS.REFUNDED,
  PAYMENT_STATUS.REFUND_PENDING,
  PAYMENT_STATUS.REFUND_FAILED,
  PAYMENT_STATUS.REFUND_CANCEL,
] as const;

type CreateOrderSkuItem = {
  name?: string;
  sku_no?: string | null;
  sku_name?: string | null;
  count?: number;
  price?: number;
  detail_type?: number;
  menu_img_url?: string | null;
  variant?: number;
  option_list?: Array<CreateOrderSkuOption> | null;
  currentDish?: {
    price?: number;
    sku_version?: number | null;
  } | null;
};

type CreateOrderReq = {
  /** 餐厅付款模式：1 餐前付款，2 餐后付款 */
  mode?: number | null;
  /** 服务员编号 */
  waiter_no: string;
  /** 餐厅id */
  restaurant_id: number;
  /** 下单APP */
  order_app: number;
  /** user no  -- 优惠券用 */
  user_no?: string;
  /** 桌子id */
  table_id?: number | string | null;
  /** 总金额 */
  total_amount: number;
  /** food_order.restaurant_type：使用餐厅点餐模式 */
  restaurant_type?: number | null;
  /** 服务费 */
  service_fee?: number;
  /** 用餐人数 */
  customer_num?: number;
  /** 备注 */
  remark?: string;
  /** 订单渠道：1 桌码点餐，3 排队点餐 */
  order_channel?: number;
  /** 顾客用餐方式：1 堂食，2 外带 */
  customer_dining_style?: number;
  /** 用户所选的sku */
  sku_list: Array<CreateOrderSkuItem>;
  /** 优惠券券码 */
  coupon_code?: string;
  /** 优惠券金额 */
  coupon_amount?: number;
};

type GetPendingOrderByTableParams = {
  table_id?: number | string | null;
};

const RESTAURANT_ORDER_MODE = {
  BEFORE_MEAL: 1,
  AFTER_MEAL: 2,
} as const;
const PRINT_ASSOCIATION_TYPE_ORDER_NO = 1;
const AUDIT_STATUS_PASS = 3;
const PRINT_STATUS = {
  NOT_PRINTED: 1,
  SUCCESS: 2,
  FAIL: 3,
} as const;

const PRINT_RECEIPT_TYPE = {
  REFUND_RECEIPT: 1,
  ORDER_RECEIPT: 2,
  PAYMENT_RECEIPT: 3,
  KITCHEN_RECEIPT: 4,
  BILL_RECEIPT: 5,
} as const;

// 排队点餐在支付成功时才占用取餐号，避免未支付订单提前消耗号码。
const assignQueueTakeFoodNoIfNeeded = (
  db: ReturnType<typeof getDB>,
  order: FoodOrderRecord | undefined,
  now: dayjs.Dayjs,
) => {
  if (!order || order.order_channel !== ORDER_CHANNEL.QUEUE || order.take_food_no) {
    return null;
  }

  // 取餐号源由 local_setting 维护；本函数在支付成功事务内调用，和 food_order 更新一起提交。
  const takeFoodNo = nextLocalTakeFoodNo(order.restaurant_id, db);

  db.prepare(
    `
      UPDATE food_order
      SET
        take_food_no = @take_food_no,
        update_time = @update_time
      WHERE restaurant_id = @restaurant_id
        AND order_inner_no = @order_inner_no
        AND (take_food_no IS NULL OR take_food_no = '')
    `,
  ).run({
    take_food_no: takeFoodNo,
    update_time: now.format("YYYY-MM-DD HH:mm:ss"),
    restaurant_id: order.restaurant_id,
    order_inner_no: order.order_inner_no,
  });

  return takeFoodNo;
};

const getUnitOptionAmount = (skuItem: Pick<CreateOrderSkuItem, "option_list">) => {
  return (skuItem.option_list ?? []).reduce((sum, option) => {
    if (Array.isArray(option?.option_item_list)) {
      return (
        sum +
        option.option_item_list.reduce((optionSum, optionItem) => {
          return optionSum + Number(optionItem?.price ?? 0);
        }, 0)
      );
    }

    return sum + Number(option?.price ?? 0);
  }, 0);
};

const getLineOptionAmount = (skuItem: CreateOrderSkuItem) => {
  return getUnitOptionAmount(skuItem) * Number(skuItem.count ?? 1);
};

type OptionJsonRecord = Record<string, unknown>;

const asOptionJsonRecord = (value: unknown): OptionJsonRecord => {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as OptionJsonRecord) : {};
};

const asOptionJsonArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

// 后端通过 FastJSON 序列化 OrderSkuOptionReq，库内 JSON 使用 Java DTO 的 camelCase 字段名。
const normalizeOptionItemJsonForBackend = (optionList: unknown) => {
  return asOptionJsonArray(optionList).map((option) => {
    const optionRecord = asOptionJsonRecord(option);
    const optionItemList = optionRecord.option_item_list ?? optionRecord.optionItemList;

    return {
      optionNo: optionRecord.optionNo ?? optionRecord.option_no ?? null,
      optionName: optionRecord.optionName ?? optionRecord.option_name ?? optionRecord.name ?? "",
      optionItemList: asOptionJsonArray(optionItemList).map((optionItem) => {
        const optionItemRecord = asOptionJsonRecord(optionItem);

        return {
          optionItemNo: optionItemRecord.optionItemNo ?? optionItemRecord.option_item_no ?? null,
          productOptionItemNo: optionItemRecord.productOptionItemNo ?? optionItemRecord.product_option_item_no ?? null,
          optionItemName:
            optionItemRecord.optionItemName ?? optionItemRecord.option_item_name ?? optionItemRecord.name ?? "",
          price: Number(optionItemRecord.price ?? 0),
        };
      }),
    };
  });
};

const normalizeOptionItemJsonTextForBackend = (value: string | null | undefined) => {
  if (!value) return value ?? null;

  try {
    return JSON.stringify(normalizeOptionItemJsonForBackend(JSON.parse(value)));
  } catch {
    return value;
  }
};

// 业务层仍沿用 snake_case，请只在读取库内 camelCase 快照后做边界转换。
const normalizeOptionItemJsonForLocal = (optionList: unknown) => {
  return normalizeOptionItemJsonForBackend(optionList).map((option) => ({
    option_no: option.optionNo,
    option_name: option.optionName,
    option_item_list: option.optionItemList.map((optionItem) => ({
      option_item_no: optionItem.optionItemNo,
      product_option_item_no: optionItem.productOptionItemNo,
      option_item_name: optionItem.optionItemName,
      price: optionItem.price,
    })),
  }));
};

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeCreateOrderReq = (req: CreateOrderReq): CreateOrderReq => {
  const orderChannel = req.order_channel === ORDER_CHANNEL.QUEUE ? ORDER_CHANNEL.QUEUE : ORDER_CHANNEL.TABLE;

  if (orderChannel === ORDER_CHANNEL.QUEUE) {
    return {
      ...req,
      table_id: 0,
      order_channel: orderChannel,
      customer_dining_style: req.customer_dining_style ?? CUSTOMER_DINING_STYLE.DINING_ROOM,
    };
  }

  return {
    ...req,
    order_channel: orderChannel,
  };
};

const attachRestaurantTypeFromCurrentSetting = (req: CreateOrderReq): CreateOrderReq => {
  const restaurantSetting = getCurrentRestaurantSettings();
  const isQueueOrder = req.order_channel === ORDER_CHANNEL.QUEUE;
  const restaurantType = isQueueOrder ? RESTAURANT_ORDER_MODE.BEFORE_MEAL : restaurantSetting.mode;

  return {
    ...req,
    // 只有桌码点餐读取餐厅餐前/餐后设置；排队点餐固定按餐前订单写入。
    mode: restaurantType,
    restaurant_type: restaurantType,
  };
};

type CreateOrderSelectStmts = {
  selectFoodOrderByIdStmt: any;
  selectOrderDetailByIdStmt: any;
  selectOrderDetailSnapByIdStmt: any;
  selectOrderStatusChangeByIdStmt: any;
};

type CreateFoodOrderResult = {
  id: number;
  order_inner_no: string;
  order_no: string;
  order_serial_number: string | null;
};

const createOrderSelectStmts = (db: ReturnType<typeof getDB>): CreateOrderSelectStmts => ({
  selectFoodOrderByIdStmt: db.prepare("SELECT * FROM food_order WHERE id = @id"),
  selectOrderDetailByIdStmt: db.prepare("SELECT * FROM order_detail WHERE id = @id"),
  selectOrderDetailSnapByIdStmt: db.prepare("SELECT * FROM order_detail_snap WHERE id = @id"),
  selectOrderStatusChangeByIdStmt: db.prepare("SELECT * FROM order_status_change WHERE id = @id"),
});

const getRestaurantById = (db: ReturnType<typeof getDB>, restaurantId: number): RestaurantRecord | null =>
  (db.prepare("SELECT * FROM restaurant WHERE id = @restaurant_id LIMIT 1").get({
    restaurant_id: restaurantId,
  }) as RestaurantRecord | undefined) ?? null;

const getRestaurantSettingById = (db: ReturnType<typeof getDB>, restaurantId: number): RestaurantSettingRecord | null =>
  (db.prepare("SELECT * FROM restaurant_setting WHERE restaurant_id = @restaurant_id LIMIT 1").get({
    restaurant_id: restaurantId,
  }) as RestaurantSettingRecord | undefined) ?? null;

const getApprovedOperationConfigByRestaurantId = (
  db: ReturnType<typeof getDB>,
  restaurantId: number,
): RestaurantOperationConfigRecord | null =>
  (db
    .prepare(
      `
        SELECT *
        FROM restaurant_operation_config
        WHERE restaurant_id = @restaurant_id
          AND audit_status = @audit_status
        ORDER BY update_time DESC, id DESC
        LIMIT 1
      `,
    )
    .get({
      restaurant_id: restaurantId,
      audit_status: AUDIT_STATUS_PASS,
    }) as RestaurantOperationConfigRecord | undefined) ?? null;

const getTableNameById = (db: ReturnType<typeof getDB>, tableId: number | null | undefined): string | null => {
  if (!tableId) {
    return null;
  }

  return (
    (
      db.prepare("SELECT name FROM restaurant_table WHERE id = @table_id LIMIT 1").get({
        table_id: tableId,
      }) as { name: string | null } | undefined
    )?.name ?? null
  );
};

const getWaiterNameByWaiterNo = (
  db: ReturnType<typeof getDB>,
  restaurantId: number,
  waiterNo: string | null | undefined,
): string | null => {
  if (!waiterNo) {
    return null;
  }

  return (
    (
      db
        .prepare(
          `
          SELECT name
          FROM restaurant_waiter
          WHERE restaurant_id = @restaurant_id
            AND waiter_no = @waiter_no
          LIMIT 1
        `,
        )
        .get({
          restaurant_id: restaurantId,
          waiter_no: waiterNo,
        }) as { name: string | null } | undefined
    )?.name ?? null
  );
};

const getWaiterNameById = (
  db: ReturnType<typeof getDB>,
  restaurantId: number,
  waiterId: number | null | undefined,
): string | null => {
  if (!waiterId) {
    return null;
  }

  return (
    (
      db
        .prepare(
          `
          SELECT name
          FROM restaurant_waiter
          WHERE restaurant_id = @restaurant_id
            AND id = @waiter_id
          LIMIT 1
        `,
        )
        .get({
          restaurant_id: restaurantId,
          waiter_id: waiterId,
        }) as { name: string | null } | undefined
    )?.name ?? null
  );
};

const selectPrintInfoByOrderNoAndType = (
  db: ReturnType<typeof getDB>,
  restaurantId: number,
  orderNo: string,
  printType: PrintType,
): FoodOrderPrintInfoRecord | null =>
  (db
    .prepare(
      `
        SELECT *
        FROM food_order_print_info
        WHERE restaurant_id = @restaurant_id
          AND order_no = @order_no
          AND print_type = @print_type
        ORDER BY id DESC
        LIMIT 1
      `,
    )
    .get({
      restaurant_id: restaurantId,
      order_no: orderNo,
      print_type: printType,
    }) as FoodOrderPrintInfoRecord | undefined) ?? null;

const upsertOrderPrintInfoSnapshot = (
  db: ReturnType<typeof getDB>,
  params: {
    foodOrder: FoodOrderRecord;
    payment?: OrderPaymentRecord | null;
    taxInfo?: OrderPaymentTaxRecord | null;
    refundPayment?: OrderPaymentRecord | null;
    now: string;
  },
): FoodOrderPrintInfoRecord => {
  const { foodOrder, payment = null, taxInfo = null, refundPayment = null, now } = params;
  const restaurant = getRestaurantById(db, foodOrder.restaurant_id);
  const restaurantSetting = getRestaurantSettingById(db, foodOrder.restaurant_id);
  const operationConfig = getApprovedOperationConfigByRestaurantId(db, foodOrder.restaurant_id);
  const detailSnaps = getSelectOrderDetailSnapByOrderIdStmt().all({
    id: foodOrder.id,
  }) as OrderDetailSnapRecord[];

  const printOrderSnapshot = createPrintOrderSnapshot({
    foodOrder,
    detailSnaps,
    payment,
    taxInfo,
    restaurant,
    restaurantSetting,
    operationConfig,
    tableName: getTableNameById(db, foodOrder.table_id),
    waiterName: getWaiterNameByWaiterNo(db, foodOrder.restaurant_id, foodOrder.waiter_no),
    paymentWaiterName: getWaiterNameById(db, foodOrder.restaurant_id, payment?.waiter_id),
    refundWaiterName:
      getWaiterNameByWaiterNo(db, foodOrder.restaurant_id, foodOrder.refund_waiter_no) ??
      getWaiterNameById(db, foodOrder.restaurant_id, refundPayment?.waiter_id),
    paymentChannelName: getPaymentChannelDisplayName(db, payment),
  });

  if (refundPayment) {
    // 退款不会重建支付小票主体，只补充退款流水，保持与后端 updatePaymentPrintInfo 的行为一致。
    printOrderSnapshot.refundSerialNo = refundPayment.refund_serial_no ?? "";
    printOrderSnapshot.refundSystemTransNo = refundPayment.system_transaction_no ?? "";
    printOrderSnapshot.refundFirstPrintTime =
      refundPayment.transaction_return_time ?? refundPayment.update_time ?? refundPayment.create_time ?? "";
  }

  const existingPrintInfo = selectPrintInfoByOrderNoAndType(
    db,
    foodOrder.restaurant_id,
    foodOrder.order_no,
    PrintType.ALL,
  );
  const contentJson = stringifyBackendPrintOrder(printOrderSnapshot);

  if (existingPrintInfo) {
    db.prepare(
      `
        UPDATE food_order_print_info
        SET
          association_type = @association_type,
          device_no = @device_no,
          content_json = @content_json,
          update_time = @update_time
        WHERE id = @id
      `,
    ).run({
      id: existingPrintInfo.id,
      association_type: PRINT_ASSOCIATION_TYPE_ORDER_NO,
      device_no: OFFLINE_CLOUD_PRINTER_DEVICE_NO,
      content_json: contentJson,
      update_time: now,
    });

    return db.prepare("SELECT * FROM food_order_print_info WHERE id = @id").get({
      id: existingPrintInfo.id,
    }) as FoodOrderPrintInfoRecord;
  }

  const result = db
    .prepare(
      `
        INSERT INTO food_order_print_info (
          restaurant_id,
          order_no,
          print_type,
          association_type,
          device_no,
          print_order_id,
          print_bill_id,
          print_payment_id,
          print_refund_id,
          content_json,
          create_time,
          update_time
        ) VALUES (
          @restaurant_id,
          @order_no,
          @print_type,
          @association_type,
          @device_no,
          @print_order_id,
          @print_bill_id,
          @print_payment_id,
          @print_refund_id,
          @content_json,
          @create_time,
          @update_time
        )
      `,
    )
    .run({
      restaurant_id: foodOrder.restaurant_id,
      order_no: foodOrder.order_no,
      print_type: PrintType.ALL,
      association_type: PRINT_ASSOCIATION_TYPE_ORDER_NO,
      device_no: OFFLINE_CLOUD_PRINTER_DEVICE_NO,
      print_order_id: null,
      print_bill_id: null,
      print_payment_id: null,
      print_refund_id: null,
      content_json: contentJson,
      create_time: now,
      update_time: now,
    });

  return db.prepare("SELECT * FROM food_order_print_info WHERE id = @id").get({
    id: Number(result.lastInsertRowid),
  }) as FoodOrderPrintInfoRecord;
};

const getPaymentChannelDisplayName = (
  db: ReturnType<typeof getDB>,
  payment: OrderPaymentRecord | null | undefined,
): string => {
  if (!payment) {
    return "";
  }

  const channelCode = String(payment.channel_code ?? "").trim();
  if (!channelCode) {
    return String(payment.payment_platform ?? "").trim();
  }

  const row = db
    .prepare(
      `
        SELECT name
        FROM payment_channel
        WHERE code = @code
          AND del_status = 1
          AND restaurant_id IN (@restaurant_id, 0)
        ORDER BY
          CASE WHEN restaurant_id = @restaurant_id THEN 0 ELSE 1 END,
          type DESC,
          id DESC
        LIMIT 1
      `,
    )
    .get({
      code: channelCode,
      restaurant_id: payment.restaurant_id,
    }) as { name: string | null } | undefined;

  // 自定义离线渠道同样是 pay_product_type=0，不能仅凭产品类型显示为 CASH。
  return String(row?.name ?? channelCode).trim();
};

const refreshOrderPrintInfoSnapshotsByInnerNo = (
  db: ReturnType<typeof getDB>,
  params: {
    orderInnerNo: string;
    payment?: OrderPaymentRecord | null;
    taxInfo?: OrderPaymentTaxRecord | null;
    refundPayment?: OrderPaymentRecord | null;
    now: string;
  },
): FoodOrderPrintInfoRecord[] => {
  const foodOrders = getSelectOrderListByOrderInnerNoStmt().all({
    order_inner_no: params.orderInnerNo,
  }) as FoodOrderRecord[];

  return foodOrders.map((foodOrder) =>
    upsertOrderPrintInfoSnapshot(db, {
      foodOrder,
      payment: params.payment,
      taxInfo: params.taxInfo,
      refundPayment: params.refundPayment,
      now: params.now,
    }),
  );
};

// 整单展示和打印必须聚合同一 order_inner_no 下的主单与加菜单，并排除已取消/减菜明细。
const getActiveOrderGroupDetailSnaps = (
  db: ReturnType<typeof getDB>,
  orderInnerNo: string,
  restaurantId?: number,
): OrderDetailSnapRecord[] => {
  const restaurantCondition = restaurantId ? "AND fo.restaurant_id = @restaurant_id" : "";

  return db
    .prepare(
      `
        SELECT ods.*
        FROM order_detail_snap ods
        INNER JOIN order_detail od
          ON od.id = ods.order_detail_id
        INNER JOIN food_order fo
          ON fo.id = od.order_id
        WHERE fo.order_inner_no = @order_inner_no
          AND od.detail_type = @active_detail_type
          AND fo.order_status != @cancel_order_status
          ${restaurantCondition}
        ORDER BY datetime(fo.create_time) ASC, fo.id ASC, ods.id ASC
      `,
    )
    .all({
      order_inner_no: orderInnerNo,
      active_detail_type: DETAIL_TYPE_INCREASE,
      cancel_order_status: ORDER_STATUS.CANCEL,
      restaurant_id: restaurantId,
    }) as OrderDetailSnapRecord[];
};

const getOrderGroupItemSummary = (detailSnaps: OrderDetailSnapRecord[]) => ({
  itemCount: detailSnaps.reduce((sum, item) => sum + Number(item.product_count ?? 0), 0),
  subTotalAmount: detailSnaps.reduce(
    (sum, item) => sum + Number(item.sku_price ?? 0) * Number(item.product_count ?? 0),
    0,
  ),
});

type OrderGroupAmountSummary = {
  serviceFee: number;
  taxAmount: number;
  packageFee: number;
};

const getActiveOrderGroupAmountSummary = (
  db: ReturnType<typeof getDB>,
  orderInnerNo: string,
  restaurantId?: number,
): OrderGroupAmountSummary => {
  const restaurantCondition = restaurantId ? "AND restaurant_id = @restaurant_id" : "";
  const row = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(service_fee), 0) AS service_fee,
          COALESCE(SUM(tax_amount), 0) AS tax_amount,
          COALESCE(SUM(package_fee), 0) AS package_fee
        FROM food_order
        WHERE order_inner_no = @order_inner_no
          AND order_status != @cancel_order_status
          ${restaurantCondition}
      `,
    )
    .get({
      order_inner_no: orderInnerNo,
      cancel_order_status: ORDER_STATUS.CANCEL,
      restaurant_id: restaurantId,
    }) as { service_fee: number | null; tax_amount: number | null; package_fee: number | null } | undefined;

  // food_order 的金额按主单/加菜单分别保存，整单页面的回退值必须按订单组汇总。
  return {
    serviceFee: Number(row?.service_fee ?? 0),
    taxAmount: Number(row?.tax_amount ?? 0),
    packageFee: Number(row?.package_fee ?? 0),
  };
};

const buildOrderGroupFoodOrder = (
  masterOrder: FoodOrderRecord,
  detailSnaps: OrderDetailSnapRecord[],
  payment?: OrderPaymentRecord | null,
): FoodOrderRecord => {
  const { itemCount, subTotalAmount } = getOrderGroupItemSummary(detailSnaps);
  const serviceFee = Number(payment?.real_service_fee ?? masterOrder.service_fee ?? 0);
  const taxAmount = Number(payment?.real_tax_amount ?? masterOrder.tax_amount ?? 0);

  // createPrintOrderSnapshot 会从 total_amount 中扣除服务费和税费，整组总额需先补回这两项。
  return {
    ...masterOrder,
    total_count: itemCount,
    total_amount: subTotalAmount + serviceFee + taxAmount,
  };
};

const mergeOrderGroupItemsIntoPrintOrder = (
  db: ReturnType<typeof getDB>,
  printOrder: PrintOrderBo,
  foodOrder: FoodOrderRecord,
): PrintOrderBo => {
  const detailSnaps = getActiveOrderGroupDetailSnaps(db, foodOrder.order_inner_no, foodOrder.restaurant_id);
  const { itemCount } = getOrderGroupItemSummary(detailSnaps);

  return {
    ...printOrder,
    itemNum: itemCount,
    itemList: detailSnaps.map((item) => {
      const count = Number(item.product_count ?? 0);
      const unitPrice = Number(item.sku_price ?? 0);

      return {
        number: String(count),
        itemName: `${item.product_name}${item.sku_name ? `(${item.sku_name})` : ""}@${(unitPrice / 100).toFixed(2)}`,
        price: ((unitPrice * count) / 100).toFixed(2),
        categoryId: 0,
        chinese: false,
        is80Paper: false,
      };
    }),
    // 厨房票优先读取 kitchenItemList，清空旧的主单列表后让它回退到本次聚合的 itemList。
    kitchenItemList: [],
  };
};

type PrintReceiptReq = {
  order_inner_no: string;
  order_no?: string | null;
  receipt_type: number;
  print_source?: "manual" | "auto";
  print_item_list?: Array<PrintReceiptItemOverride>;
  print_service_fee?: number | null;
};

type PrintReceiptItemOverride = Partial<OrderDetailSnapRecord> & {
  number?: string | number;
  itemName?: string;
  item_name?: string;
  price?: string | number;
  count?: string | number;
  sku_price?: string | number;
  product_count?: string | number;
  category_id?: string | number;
};

const formatPrintTime = (value: Date = new Date()): string => dayjs(value).format("YYYY-MM-DD HH:mm:ss");

const PRINTER_LANGUAGE = {
  CHINESE: 1,
  ENGLISH: 2,
} as const;

const KITCHEN_PRINTER_FONT_SIZE = {
  REGULAR: 1,
  LARGE: 2,
} as const;

const RECEIPT_PAPER_WIDTH = {
  WIDTH_58MM: 1,
  WIDTH_80MM: 2,
} as const;

const ESC_POS = {
  CENTER_INIT: Buffer.from("0D0A1B401B6101", "hex"),
  ALIGN_LEFT: Buffer.from("1B6100", "hex"),
  ALIGN_CENTER: Buffer.from("1B6101", "hex"),
  BOLD_ON: Buffer.from("1B4501", "hex"),
  BOLD_OFF: Buffer.from("1B4500", "hex"),
  FONT_SIZE_NORMAL: Buffer.from("1D2100", "hex"),
  FONT_SIZE_LARGE: Buffer.from("1D2101", "hex"),
  FONT_SIZE_DOUBLE: Buffer.from("1D2111", "hex"),
} as const;

const getReceiptPrintInfoByInnerNo = (
  db: ReturnType<typeof getDB>,
  orderInnerNo: string,
): { foodOrder: FoodOrderRecord; printInfo: FoodOrderPrintInfoRecord } => {
  const foodOrders = getSelectOrderListByOrderInnerNoStmt().all({
    order_inner_no: orderInnerNo,
  }) as FoodOrderRecord[];
  const foodOrder =
    foodOrders.find((order) => order.order_type === ORDER_TYPE.MASTER) ??
    foodOrders.slice().sort(sortOrdersByCreateTime)[0];

  if (!foodOrder) {
    throw new Error(`打印失败：未找到 order_inner_no=${orderInnerNo} 对应的订单`);
  }

  let printInfo = selectPrintInfoByOrderNoAndType(db, foodOrder.restaurant_id, foodOrder.order_no, PrintType.ALL);

  if (!printInfo) {
    // 老数据可能还没有步骤2生成的快照，打印前即时补建，避免按钮不可用。
    printInfo = upsertOrderPrintInfoSnapshot(db, {
      foodOrder,
      now: formatPrintTime(),
    });
  }

  return { foodOrder, printInfo };
};

const parseRequiredPrintOrder = (printInfo: FoodOrderPrintInfoRecord): PrintOrderBo => {
  if (!printInfo.content_json) {
    throw new Error("打印失败：打印快照内容为空");
  }

  return JSON.parse(printInfo.content_json) as PrintOrderBo;
};

const mergeOperationConfigIntoPrintOrder = (
  printOrder: PrintOrderBo,
  operationConfig: RestaurantOperationConfigRecord | null,
): PrintOrderBo => {
  if (!operationConfig) {
    return printOrder;
  }

  // 支付小票 BIR 信息以当前数据库审核通过配置为准，修复旧快照缺失 TIN/MIN 的情况。
  return {
    ...printOrder,
    restaurantAddress: operationConfig.restaurant_address ?? printOrder.restaurantAddress,
    vatRegisterStatus: operationConfig.vat_register_status === PRODUCT_STATUS.VALID,
    birPrintInfo: {
      ...(printOrder.birPrintInfo ?? {}),
      tinNumber: operationConfig.tin_number ?? printOrder.birPrintInfo?.tinNumber ?? "",
      merchantAddress: operationConfig.restaurant_address ?? printOrder.birPrintInfo?.merchantAddress ?? "",
      minNumber: operationConfig.min_number ?? printOrder.birPrintInfo?.minNumber ?? "",
      serialNumber: operationConfig.serial_number ?? printOrder.birPrintInfo?.serialNumber ?? "",
      ptuNumber: operationConfig.ptu_number ?? printOrder.birPrintInfo?.ptuNumber ?? "",
      ptuIssueDate: operationConfig.ptu_issue_date ?? printOrder.birPrintInfo?.ptuIssueDate ?? "",
      ptuValidUntil: operationConfig.ptu_issue_date ?? printOrder.birPrintInfo?.ptuValidUntil ?? "",
      taxpayerName: operationConfig.taxpayer_name ?? printOrder.birPrintInfo?.taxpayerName ?? "",
      tradeName: operationConfig.trade_name ?? printOrder.birPrintInfo?.tradeName ?? "",
    },
  };
};

const mergePaymentDiscountInfoIntoPrintOrder = (
  printOrder: PrintOrderBo,
  payment: OrderPaymentRecord | null,
): PrintOrderBo => {
  if (!payment) {
    return printOrder;
  }

  // 最终支付单是折扣类型的权威来源，避免旧快照把普通折扣继续识别成 PWD/SC。
  return {
    ...printOrder,
    discountType: Number(payment.discount_type ?? 0),
    discountNumber: printOrder.discountNumber || Number(payment.discount_number ?? 0),
    discountId: printOrder.discountId || payment.discount_no || "",
    discounterName: printOrder.discounterName || payment.discounter_name || "",
    discountValidityPeriod: printOrder.discountValidityPeriod || payment.discount_validity_period || "",
    discountSerialNo: printOrder.discountSerialNo || payment.discount_serial_no || "",
    // 优惠券在 payment 小票中归入 Promo Discount，旧快照缺失时用最终支付单补齐。
    couponsAmount: Number(printOrder.couponsAmount ?? 0) || Number(payment.coupon_amount ?? 0),
  };
};

const mergePaymentChannelInfoIntoPrintOrder = (
  db: ReturnType<typeof getDB>,
  printOrder: PrintOrderBo,
  payment: OrderPaymentRecord | null,
): PrintOrderBo => {
  if (!payment) {
    return printOrder;
  }

  const channelName = getPaymentChannelDisplayName(db, payment);
  if (!channelName) {
    return printOrder;
  }

  const currentChannel = String(printOrder.paymentChannel ?? "").trim();
  const paymentCode = String(payment.channel_code ?? "")
    .trim()
    .toUpperCase();
  const shouldReplaceCash =
    currentChannel.toUpperCase() === "CASH" &&
    payment.pay_product_type === 0 &&
    paymentCode !== "" &&
    paymentCode !== "CASH";

  if (currentChannel && !shouldReplaceCash) {
    return printOrder;
  }

  // 旧快照可能为空，或把自定义离线渠道误写成 CASH；打印前用渠道表名称兜底。
  return {
    ...printOrder,
    paymentChannel: channelName,
  };
};

const mergePaymentTaxInfoIntoPrintOrder = (
  printOrder: PrintOrderBo,
  taxInfo: OrderPaymentTaxRecord | null,
): PrintOrderBo => {
  if (!taxInfo) {
    return printOrder;
  }

  // 旧打印快照可能缺少最终支付税费，打印前用 order_payment_tax 补齐。
  return {
    ...printOrder,
    pwdDiscount: Number(printOrder.pwdDiscount ?? 0) || Number(taxInfo.pwd_discount ?? 0),
    promoDiscount: Number(printOrder.promoDiscount ?? 0) || Number(taxInfo.promo_discount ?? 0),
    vatableSales: Number(printOrder.vatableSales ?? 0) || Number(taxInfo.vatable_sales ?? 0),
    taxAmount: Number(printOrder.taxAmount ?? 0) || Number(taxInfo.tax_amount ?? 0),
    vatExemptSales: Number(printOrder.vatExemptSales ?? 0) || Number(taxInfo.vat_exempt_sales ?? 0),
    vatExemption: Number(printOrder.vatExemption ?? 0) || Number(taxInfo.vat_exemption ?? 0),
    zeroRatedSales: Number(printOrder.zeroRatedSales ?? 0) || Number(taxInfo.zero_rated_sales ?? 0),
    lessVat: Number(printOrder.lessVat ?? 0) || Number(taxInfo.less_vat ?? 0),
  };
};

const preparePrintOrderForReceipt = (
  printOrder: PrintOrderBo,
  printInfo: FoodOrderPrintInfoRecord,
  receiptType: number,
  now: string,
  printSource: PrintReceiptReq["print_source"] = "auto",
) => {
  const nextPrintOrder = {
    ...printOrder,
    chinese: false,
  } as PrintOrderBo;

  switch (receiptType) {
    case PRINT_RECEIPT_TYPE.ORDER_RECEIPT:
      nextPrintOrder.printType = PrintType.ORDER;
      nextPrintOrder.printerType = PrinterTypeEnum.REGISTER;
      nextPrintOrder.orderPrintCount = Number(nextPrintOrder.orderPrintCount ?? 0);
      assertManualReprintAllowed(nextPrintOrder.orderPrintCount, printSource, true);
      // 订单详情手动补打且已有成功打印记录时，按在线端规则展示 REPRINT。
      nextPrintOrder.isReprint = printSource === "manual" && nextPrintOrder.orderPrintCount >= 1;
      nextPrintOrder.orderFirstPrintTime = nextPrintOrder.orderFirstPrintTime || now;
      nextPrintOrder.firstPrintTime = nextPrintOrder.orderFirstPrintTime;
      return nextPrintOrder;
    case PRINT_RECEIPT_TYPE.BILL_RECEIPT:
      nextPrintOrder.printType = PrintType.BILL;
      nextPrintOrder.printerType = PrinterTypeEnum.BILL;
      nextPrintOrder.isReprint = Boolean(printInfo.print_bill_id);
      nextPrintOrder.billPrintCount = Number(nextPrintOrder.billPrintCount ?? 0);
      nextPrintOrder.billFirstPrintTime = nextPrintOrder.billFirstPrintTime || now;
      nextPrintOrder.firstPrintTime = nextPrintOrder.billFirstPrintTime;
      return nextPrintOrder;
    case PRINT_RECEIPT_TYPE.PAYMENT_RECEIPT:
      nextPrintOrder.printType = PrintType.PAYMENT;
      nextPrintOrder.printerType = PrinterTypeEnum.PAYMENT;
      // 只有订单详情手动补打支付小票才展示 REPRINT 信息，自动打印不参与补打次数。
      nextPrintOrder.isReprint = printSource === "manual";
      nextPrintOrder.note = null as unknown as string;
      nextPrintOrder.paymentPrintCount = Number(nextPrintOrder.paymentPrintCount ?? 0);
      assertManualReprintAllowed(nextPrintOrder.paymentPrintCount, printSource);
      nextPrintOrder.paymentFirstPrintTime = nextPrintOrder.paymentFirstPrintTime || now;
      nextPrintOrder.firstPrintTime = nextPrintOrder.paymentFirstPrintTime;
      return nextPrintOrder;
    case PRINT_RECEIPT_TYPE.REFUND_RECEIPT:
      nextPrintOrder.printType = PrintType.REFUND;
      nextPrintOrder.printerType = PrinterTypeEnum.PAYMENT;
      // 订单详情手动触发即属于退款小票补打，首次补打也需要显示 REPRINT 1。
      nextPrintOrder.isReprint = printSource === "manual";
      nextPrintOrder.note = null as unknown as string;
      nextPrintOrder.refundPrintCount = Number(nextPrintOrder.refundPrintCount ?? 0);
      assertManualReprintAllowed(nextPrintOrder.refundPrintCount, printSource);
      nextPrintOrder.refundFirstPrintTime = nextPrintOrder.refundFirstPrintTime || now;
      nextPrintOrder.firstPrintTime = nextPrintOrder.refundFirstPrintTime;
      return nextPrintOrder;
    case PRINT_RECEIPT_TYPE.KITCHEN_RECEIPT:
      nextPrintOrder.printType = PrintType.KITCHEN;
      nextPrintOrder.printerType = PrinterTypeEnum.KITCHEN;
      nextPrintOrder.kitchenPrintCount = Number(nextPrintOrder.kitchenPrintCount ?? 0);
      assertManualReprintAllowed(nextPrintOrder.kitchenPrintCount, printSource, true);
      // 自动首打不展示补打标题；只有手动触发且已有成功打印记录时才展示。
      nextPrintOrder.isReprint = printSource === "manual" && nextPrintOrder.kitchenPrintCount >= 1;
      nextPrintOrder.kitchenItemList = nextPrintOrder.kitchenItemList?.length
        ? nextPrintOrder.kitchenItemList
        : nextPrintOrder.itemList;
      return nextPrintOrder;
    default:
      throw new Error(`Unsupported receipt_type: ${receiptType}`);
  }
};

const assertManualReprintAllowed = (
  currentCount: number,
  printSource: PrintReceiptReq["print_source"] = "auto",
  includesOriginalPrint = false,
): void => {
  const storedCountLimit = MAX_RECEIPT_REPRINT_COUNT + (includesOriginalPrint ? 1 : 0);
  if (printSource === "manual" && currentCount >= storedCountLimit) {
    throw new Error(`Maximum reprint limit of ${MAX_RECEIPT_REPRINT_COUNT} has been reached.`);
  }
};

const getPaymentReceiptPrintColumns = (
  receiptPrinterSetting: RestaurantWaiterBlueToothSettingRecord | null,
): number => {
  const paperWidth = Number(receiptPrinterSetting?.paper_width ?? RECEIPT_PAPER_WIDTH.WIDTH_58MM);
  // 动态读取收银打印机纸宽：58mm 使用 32 列，80mm 使用 48 列，再由生成器居中 32 字符 BIR 内容块。
  return paperWidth === RECEIPT_PAPER_WIDTH.WIDTH_80MM ? 48 : 32;
};

const getReceiptPrintLayout = (
  printerSetting: RestaurantWaiterBlueToothSettingRecord | null,
): { contentColumns: number; printColumns: number } => {
  const contentColumns = getPaymentReceiptPrintColumns(printerSetting);

  // 58mm 是窄内容块，但需要居中输出到 80mm 纸宽；80mm 则直接铺满。
  return {
    contentColumns,
    printColumns: 48,
  };
};

const generateReceiptTextByType = (
  printOrder: PrintOrderBo,
  receiptType: number,
  receiptPrinterSetting: RestaurantWaiterBlueToothSettingRecord | null = null,
  kitchenPrinterSetting: RestaurantWaiterBlueToothSettingRecord | null = null,
): string => {
  // 小票内容宽度跟随实际打印机纸宽，避免 80mm 纸仍套用 58mm 内容块。
  const receiptColumns = getPaymentReceiptPrintColumns(receiptPrinterSetting);
  const receiptLayout = getReceiptPrintLayout(receiptPrinterSetting);
  const kitchenLayout = getReceiptPrintLayout(kitchenPrinterSetting);

  switch (receiptType) {
    case PRINT_RECEIPT_TYPE.ORDER_RECEIPT:
      return generateOrderReceipt(printOrder, receiptLayout.contentColumns, receiptLayout.printColumns);
    case PRINT_RECEIPT_TYPE.BILL_RECEIPT:
      return generateBillReceipt(printOrder, receiptLayout.contentColumns, receiptLayout.printColumns);
    case PRINT_RECEIPT_TYPE.PAYMENT_RECEIPT:
      return generatePaymentReceipt(printOrder, receiptLayout.contentColumns, receiptLayout.printColumns);
    case PRINT_RECEIPT_TYPE.REFUND_RECEIPT:
      return generateRefundReceipt(printOrder, receiptLayout.contentColumns, receiptLayout.printColumns);
    case PRINT_RECEIPT_TYPE.KITCHEN_RECEIPT:
      return generateKitchenReceipt(printOrder, kitchenLayout.contentColumns, kitchenLayout.printColumns);
    default:
      throw new Error(`Unsupported receipt_type: ${receiptType}`);
  }
};

const mergeCurrentQueuePickupInfoIntoPrintOrder = (
  printOrder: PrintOrderBo,
  foodOrder: FoodOrderRecord,
): PrintOrderBo => {
  // 取餐号在排队单支付成功时才写入，打印前用当前 food_order 兜底覆盖旧快照。
  return {
    ...printOrder,
    tableFoodNo: foodOrder.take_food_no ?? printOrder.tableFoodNo ?? "",
    customerDiningStyle: foodOrder.customer_dining_style ?? printOrder.customerDiningStyle,
  };
};

// 根据本次请求动态决定 food_order 插入字段，例如排队点餐才会传 customer_dining_style。
const getCreateOrderFields = (normalizedReq: CreateOrderReq): string[] => [
  "restaurant_id",
  "table_id",
  "waiter_no",
  "user_no",
  "order_inner_no",
  "order_no",
  "order_payment_id",
  "total_amount",
  "total_count",
  "service_fee",
  "customer_num",
  "restaurant_type",
  "payment_way",
  "order_status",
  "payment_status",
  "order_type",
  "order_app",
  "complete_time",
  "remark",
  "cancel_remark",
  "order_print_status",
  "payment_print_status",
  "bill_print_status",
  "create_time",
  "update_time",
  "edit_remark",
  "region_office_rest_id",
  "headquarter_rest_id",
  "tax_type",
  "tax_amount",
  "review_status",
  "order_channel",
  "package_fee",
  "take_food_no",
  ...(normalizedReq.customer_dining_style === undefined ? [] : ["customer_dining_style"]),
  "refund_payment_id",
  "refund_time",
  "order_serial_number",
  "coupon_code",
  "coupon_amount",
  "refund_waiter_no",
];

// 插入 food_order 主记录，餐前新桌和餐后主/子订单都会复用这里。
const insertFoodOrder = (
  db: ReturnType<typeof getDB>,
  normalizedReq: CreateOrderReq,
  record: Record<string, unknown>,
) => {
  const createOrderFields = getCreateOrderFields(normalizedReq);
  const createOrderSql = `
    INSERT INTO food_order (
      ${createOrderFields.join(", ")}
    ) VALUES (
      ${createOrderFields.map((field) => `@${field}`).join(", ")}
    )
  `;

  return db.prepare(createOrderSql).run(
    buildSqlParams(record, createOrderFields, {
      edit_remark: "",
      tax_type: 0,
      tax_amount: 0,
      review_status: 1,
      order_channel: ORDER_CHANNEL.TABLE,
      coupon_amount: 0,
      user_no: "",
    }),
  );
};

// 为指定 food_order 写入本次新增菜品的 detail 与 snap，并返回本地事务写入结果。
const insertOrderDetails = (
  orderId: number,
  skuList: Array<CreateOrderSkuItem>,
  now: string,
  selectStmts: CreateOrderSelectStmts,
) => {
  const orderDetailList: OrderDetailRecord[] = [];
  const orderDetailSnapList: OrderDetailSnapRecord[] = [];

  for (const skuItem of skuList) {
    if (!skuItem.sku_no) {
      throw new Error("创建订单失败：sku_list 中存在缺少 sku_no 的菜品");
    }

    const skuRecord = getSelectSkuIdBySkuNoStmt().get({
      sku_no: skuItem.sku_no,
    }) as { id: number } | undefined;

    if (!skuRecord) {
      throw new Error(`创建订单失败：未找到 sku_no=${skuItem.sku_no} 对应的 SKU`);
    }

    const unitOptionAmount = getUnitOptionAmount(skuItem);
    const optionAmount = getLineOptionAmount(skuItem);
    const skuAmount = Number(skuItem.currentDish?.price ?? Number(skuItem.price ?? 0) - unitOptionAmount);

    const orderDetailResult = getCreateOrderDetailStmt().run({
      order_id: orderId,
      sku_id: skuRecord.id,
      count: Number(skuItem.count ?? 1),
      sku_amount: skuAmount,
      option_amount: optionAmount,
      detail_type: Number(skuItem.detail_type ?? 1),
      // 后端 OrderBaseBusinessImpl 只把 optionList 写入 order_detail.detail_snapshot。
      detail_snapshot: JSON.stringify(normalizeOptionItemJsonForBackend(skuItem.option_list)),
      create_time: now,
      update_time: now,
      parent_id: 0,
    });
    const orderDetailId = Number(orderDetailResult.lastInsertRowid);

    const orderDetailSnapResult = getCreateOrderDetailSnapStmt().run({
      food_order_id: orderId,
      order_detail_id: orderDetailId,
      product_name: skuItem.name ?? "",
      menu_img_url: skuItem.menu_img_url ?? null,
      product_count: Number(skuItem.count ?? 1),
      sku_name: skuItem.sku_name ?? "",
      sku_price: Number(skuItem.price ?? 0),
      variant: Number(skuItem.variant ?? 2),
      option_item_json: JSON.stringify(normalizeOptionItemJsonForBackend(skuItem.option_list)),
      sku_version: Number(skuItem.currentDish?.sku_version ?? 1),
      create_time: now,
      update_time: now,
    });

    orderDetailList.push(
      selectStmts.selectOrderDetailByIdStmt.get({
        id: orderDetailId,
      }) as OrderDetailRecord,
    );
    orderDetailSnapList.push(
      selectStmts.selectOrderDetailSnapByIdStmt.get({
        id: Number(orderDetailSnapResult.lastInsertRowid),
      }) as OrderDetailSnapRecord,
    );
  }

  return { orderDetailList, orderDetailSnapList };
};

// 创建订单时记录一次下单状态，供本地订单历史查询。
const insertPlaceOrderStatusChange = (
  params: {
    order_inner_no: string;
    order_channel: number;
    order_no: string;
    now: string;
  },
  selectStmts: CreateOrderSelectStmts,
) => {
  const user = getCurrentSession().user;
  const orderStatus = ORDER_CHANGE_STATUS.PLACE_ORDER;
  const orderStatusChangeParams = buildSqlParams(
    {
      order_inner_no: params.order_inner_no,
      status_type: params.order_channel,
      status: orderStatus,
      display_type: 1,
      operator_id: user?.id,
      remark: statusChangeRemark.get(orderStatus) ?? "",
      create_time: params.now,
      order_no: params.order_no,
      operator_name: user?.name,
    },
    [
      "order_inner_no",
      "status_type",
      "status",
      "display_type",
      "operator_id",
      "remark",
      "create_time",
      "order_no",
      "operator_name",
    ],
    {
      display_type: 1,
      operator_id: 0,
      remark: "",
      operator_name: "",
    },
  );
  const orderStatusChangeResult = getCreateOrderStatusChangeStmt().run(orderStatusChangeParams);

  return selectStmts.selectOrderStatusChangeByIdStmt.get({
    id: Number(orderStatusChangeResult.lastInsertRowid),
  }) as OrderStatusChangeRecord;
};

const buildCreateFoodOrderResult = (params: {
  foodOrder: FoodOrderRecord;
  orderDetailList: OrderDetailRecord[];
  orderDetailSnapList: OrderDetailSnapRecord[];
  orderStatusChangeList: OrderStatusChangeRecord[];
  orderPrintInfoList: FoodOrderPrintInfoRecord[];
}): CreateFoodOrderResult => ({
  id: params.foodOrder.id,
  order_inner_no: params.foodOrder.order_inner_no,
  order_no: params.foodOrder.order_no,
  order_serial_number: params.foodOrder.order_serial_number,
});

// 按普通创建逻辑插入一条 food_order，order_type 由调用方决定。
const createNewFoodOrderRecord = (
  db: ReturnType<typeof getDB>,
  normalizedReq: CreateOrderReq,
  options: {
    orderInnerNo: string;
    orderType: ORDER_TYPE;
    now: string;
    isPrint: boolean;
  },
) => {
  const record = {
    ...normalizedReq,
    order_inner_no: options.orderInnerNo,
    order_no: constructOrderNo(),
    // 排队订单必须等待 cashier 手动 Take；桌码订单沿用创建即接单的本地语义。
    order_status: normalizedReq.order_channel === ORDER_CHANNEL.QUEUE ? ORDER_STATUS.PROCESSING : ORDER_STATUS.RECEIVED,
    payment_status: PAYMENT_STATUS.UNPAY,
    order_type: options.orderType,
    total_count: normalizedReq.sku_list.length,
    order_print_status: options.isPrint ? 2 : 1,
    payment_print_status: 1,
    bill_print_status: 1,
    create_time: options.now,
    update_time: options.now,
    order_serial_number: nextLocalOrderSerialNumber(normalizedReq.restaurant_id, db),
  };
  const result = insertFoodOrder(db, normalizedReq, record);

  return {
    orderId: Number(result.lastInsertRowid),
    record,
  };
};

// 餐后付款：已有桌台主订单时创建子订单；没有则创建新的主订单。
const createFoodOrderWithAfterMeal = (req: CreateOrderReq, isPrint: boolean = false): CreateFoodOrderResult => {
  const db = getDB();
  const createOrderTx = db.transaction((txReq: CreateOrderReq, txIsPrint: boolean) => {
    const normalizedReq = normalizeCreateOrderReq(txReq);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const processingMasterOrder =
      normalizedReq.order_channel === ORDER_CHANNEL.TABLE
        ? (getSelectProcessingMasterOrderStmt().get({
            restaurant_id: normalizedReq.restaurant_id,
            table_id: normalizedReq.table_id,
            order_type: ORDER_TYPE.MASTER,
          }) as { order_inner_no: string } | undefined)
        : undefined;
    const orderInnerNo = processingMasterOrder?.order_inner_no ?? constructOrderInnerNo();
    const orderType = processingMasterOrder ? ORDER_TYPE.SLAVE : ORDER_TYPE.MASTER;
    const selectStmts = createOrderSelectStmts(db);
    const { orderId, record } = createNewFoodOrderRecord(db, normalizedReq, {
      orderInnerNo,
      orderType,
      now,
      isPrint: txIsPrint,
    });
    const { orderDetailList, orderDetailSnapList } = insertOrderDetails(
      orderId,
      normalizedReq.sku_list,
      now,
      selectStmts,
    );
    const orderStatusChange = insertPlaceOrderStatusChange(
      {
        order_inner_no: record.order_inner_no as string,
        order_channel: record.order_channel as number,
        order_no: record.order_no as string,
        now,
      },
      selectStmts,
    );
    const foodOrder = selectStmts.selectFoodOrderByIdStmt.get({
      id: orderId,
    }) as FoodOrderRecord;
    const orderPrintInfo = upsertOrderPrintInfoSnapshot(db, {
      foodOrder,
      now,
    });

    return buildCreateFoodOrderResult({
      foodOrder,
      orderDetailList,
      orderDetailSnapList,
      orderStatusChangeList: [orderStatusChange],
      orderPrintInfoList: [orderPrintInfo],
    });
  });

  return createOrderTx.immediate(req, isPrint);
};

// 餐前付款：已有桌台主订单时不创建子订单，而是把新增菜品合并到主订单下。
const createFoodOrderWithBeforeMeal = (req: CreateOrderReq, isPrint: boolean = false): CreateFoodOrderResult => {
  const db = getDB();
  const createOrderTx = db.transaction((txReq: CreateOrderReq, txIsPrint: boolean) => {
    const normalizedReq = normalizeCreateOrderReq(txReq);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const selectStmts = createOrderSelectStmts(db);
    const processingMasterOrder =
      normalizedReq.order_channel === ORDER_CHANNEL.TABLE
        ? (getSelectProcessingMasterOrderStmt().get({
            restaurant_id: normalizedReq.restaurant_id,
            table_id: normalizedReq.table_id,
            order_type: ORDER_TYPE.MASTER,
          }) as FoodOrderRecord | undefined)
        : undefined;

    if (!processingMasterOrder) {
      const { orderId, record } = createNewFoodOrderRecord(db, normalizedReq, {
        orderInnerNo: constructOrderInnerNo(),
        orderType: ORDER_TYPE.MASTER,
        now,
        isPrint: txIsPrint,
      });
      const { orderDetailList, orderDetailSnapList } = insertOrderDetails(
        orderId,
        normalizedReq.sku_list,
        now,
        selectStmts,
      );
      const orderStatusChange = insertPlaceOrderStatusChange(
        {
          order_inner_no: record.order_inner_no as string,
          order_channel: record.order_channel as number,
          order_no: record.order_no as string,
          now,
        },
        selectStmts,
      );
      const foodOrder = selectStmts.selectFoodOrderByIdStmt.get({
        id: orderId,
      }) as FoodOrderRecord;
      const orderPrintInfo = upsertOrderPrintInfoSnapshot(db, {
        foodOrder,
        now,
      });

      return buildCreateFoodOrderResult({
        foodOrder,
        orderDetailList,
        orderDetailSnapList,
        orderStatusChangeList: [orderStatusChange],
        orderPrintInfoList: [orderPrintInfo],
      });
    }

    // 餐前已有订单时只更新主订单金额和菜品数，明细直接挂到主订单下。
    db.prepare(
      `
          UPDATE food_order
          SET
            total_amount = COALESCE(total_amount, 0) + @total_amount,
            total_count = COALESCE(total_count, 0) + @total_count,
            update_time = @update_time
          WHERE id = @id
        `,
    ).run({
      id: processingMasterOrder.id,
      total_amount: Number(normalizedReq.total_amount ?? 0),
      total_count: normalizedReq.sku_list.length,
      update_time: now,
    });

    const { orderDetailList, orderDetailSnapList } = insertOrderDetails(
      processingMasterOrder.id,
      normalizedReq.sku_list,
      now,
      selectStmts,
    );
    const orderStatusChange = insertPlaceOrderStatusChange(
      {
        order_inner_no: processingMasterOrder.order_inner_no,
        order_channel: processingMasterOrder.order_channel,
        order_no: processingMasterOrder.order_no,
        now,
      },
      selectStmts,
    );
    const foodOrder = selectStmts.selectFoodOrderByIdStmt.get({
      id: processingMasterOrder.id,
    }) as FoodOrderRecord;
    const orderPrintInfo = upsertOrderPrintInfoSnapshot(db, {
      foodOrder,
      now,
    });

    return buildCreateFoodOrderResult({
      foodOrder,
      orderDetailList,
      orderDetailSnapList,
      orderStatusChangeList: [orderStatusChange],
      orderPrintInfoList: [orderPrintInfo],
    });
  });

  return createOrderTx.immediate(req, isPrint);
};

// 创建订单入口：根据餐厅 mode 分发到餐前或餐后付款逻辑。
const createOrder = (req: CreateOrderReq, isPrint: boolean = false) => {
  const enrichedReq = attachRestaurantTypeFromCurrentSetting(req);

  if (enrichedReq.mode === RESTAURANT_ORDER_MODE.BEFORE_MEAL) {
    return createFoodOrderWithBeforeMeal(enrichedReq, isPrint);
  }

  return createFoodOrderWithAfterMeal(enrichedReq, isPrint);
};

type AuthManualOrderSerialNumberParams = {
  receipt_no?: string;
  receiptNo?: string;
};

// 对齐后端 authSerialNumber：限制长度、拒绝系统 receipt_no 同位数纯数字，并校验本机已同步的同国家收据号。
const authManualOrderSerialNumber = (params: AuthManualOrderSerialNumberParams = {}) => {
  const receiptNo = String(params.receipt_no ?? params.receiptNo ?? "").trim();

  if (
    !receiptNo ||
    receiptNo.length > SYSTEM_RECEIPT_NO_LENGTH ||
    (receiptNo.length === SYSTEM_RECEIPT_NO_LENGTH && /^\d+$/.test(receiptNo))
  ) {
    return false;
  }

  const restaurantId = getCurrentSession().user?.restaurant_id;
  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  // 后端按餐厅所属国家判重；本地存在多餐厅历史数据时也保持相同口径。
  const existingPayment = getDB()
    .prepare(
      `
        SELECT 1
        FROM order_payment AS payment
        INNER JOIN restaurant AS payment_restaurant ON payment_restaurant.id = payment.restaurant_id
        INNER JOIN restaurant AS current_restaurant ON current_restaurant.id = @restaurant_id
        WHERE payment.receipt_no = @receipt_no
          AND payment_restaurant.country_name = current_restaurant.country_name
        LIMIT 1
      `,
    )
    .get({
      restaurant_id: restaurantId,
      receipt_no: receiptNo,
    });

  return !existingPayment;
};

type CheckPwdScDiscountIdAvailableParams = {
  discount_id?: string;
  discountId?: string;
  discount_type?: number;
  discountType?: number;
  order_inner_no?: string | null;
  orderInnerNo?: string | null;
};

const normalizeDiscountId = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const parsePaymentDiscountIds = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return (Array.isArray(parsed) ? parsed : [parsed]).map(normalizeDiscountId).filter(Boolean);
  } catch {
    // 兼容早期本地支付记录直接保存单个证件号的情况。
    return [normalizeDiscountId(value)].filter(Boolean);
  }
};

const getPwdScDiscountTypeGroup = (discountType: unknown): readonly number[] | null => {
  const normalizedDiscountType = Number(discountType);
  if (PWD_DISCOUNT_TYPES.some((type) => type === normalizedDiscountType)) return PWD_DISCOUNT_TYPES;
  if (SC_DISCOUNT_TYPES.some((type) => type === normalizedDiscountType)) return SC_DISCOUNT_TYPES;
  return null;
};

// 当前餐厅自然日内分别限制 PWD 与 SC；两类证件号互不占用。
const checkPwdScDiscountIdAvailable = (params: CheckPwdScDiscountIdAvailableParams = {}) => {
  const discountId = normalizeDiscountId(params.discount_id ?? params.discountId);
  const discountTypeGroup = getPwdScDiscountTypeGroup(params.discount_type ?? params.discountType);
  if (!discountId || !discountTypeGroup) return false;

  const restaurantId = getCurrentSession().user?.restaurant_id;
  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const currentOrderInnerNo = String(params.order_inner_no ?? params.orderInnerNo ?? "").trim();
  const startTime = dayjs().startOf("day").format("YYYY-MM-DD HH:mm:ss");
  const endTime = dayjs().add(1, "day").startOf("day").format("YYYY-MM-DD HH:mm:ss");
  const rows = getDB()
    .prepare(
      `
        SELECT discount_no
        FROM order_payment
        WHERE restaurant_id = @restaurant_id
          AND discount_type IN (${discountTypeGroup.join(", ")})
          AND transaction_status IN (${PWD_SC_ACTIVE_PAYMENT_STATUSES.join(", ")})
          AND datetime(transaction_create_time) >= datetime(@start_time)
          AND datetime(transaction_create_time) < datetime(@end_time)
          AND (@order_inner_no = '' OR order_inner_no <> @order_inner_no)
      `,
    )
    .all({
      restaurant_id: restaurantId,
      start_time: startTime,
      end_time: endTime,
      order_inner_no: currentOrderInnerNo,
    }) as Array<{ discount_no: string | null }>;

  return !rows.some((row) => parsePaymentDiscountIds(row.discount_no).includes(discountId));
};

type CreateManualOrderParams = {
  receipt_no?: string | null;
  receiptNo?: string | null;
  total_amount?: number;
  totalAmount?: number;
  real_amount?: number;
  realAmount?: number;
  surcharge?: number | null;
  remark?: string | null;
  sku_list?: Array<CreateOrderSkuItem>;
  skuList?: Array<CreateOrderSkuItem>;
  order_channel?: number;
  orderChannel?: number;
  real_tax_amount?: number;
  realTaxAmount?: number;
  order_inner_no?: string | null;
  orderInnerNo?: string | null;
  payment_way?: number;
  paymentWay?: number;
  pay_product_type?: number;
  payProductType?: number;
  channel_code?: string;
  channelCode?: string;
  payment_platform?: string;
  paymentPlatform?: string;
  discount_number?: number | null;
  discountNumber?: number | null;
  discount_nos?: string[] | string | null;
  discountNos?: string[] | string | null;
  discount_type?: number | null;
  discountType?: number | null;
  tax_info?: Partial<OrderPaymentTaxRecord> | null;
  taxInfo?: Partial<OrderPaymentTaxRecord> | null;
  discounter_name?: string | null;
  discounterName?: string | null;
  discount_validity_period?: string | null;
  discountValidityPeriod?: string | null;
  user_no?: string | null;
  userNo?: string | null;
  customer_num?: number | null;
  customerNum?: number | null;
};

const ORDER_APP_MANUAL_ORDER = 7;
const PAYMENT_WAY_OFFLINE = 2;

const normalizeDiscountNos = (value: CreateManualOrderParams["discount_nos"]): string[] => {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && String(item).trim());
  if (value === null || value === undefined || String(value).trim() === "") return [];

  return [String(value).trim()];
};

const normalizeManualOrderTaxInfo = (taxInfo: Partial<OrderPaymentTaxRecord> | null | undefined) => ({
  vatable_sales: Number(taxInfo?.vatable_sales ?? 0),
  tax_amount: Number(taxInfo?.tax_amount ?? 0),
  vat_exempt_sales: Number(taxInfo?.vat_exempt_sales ?? 0),
  vat_exemption: Number(taxInfo?.vat_exemption ?? 0),
  zero_rated_sales: Number(taxInfo?.zero_rated_sales ?? 0),
  pwd_discount: Number(taxInfo?.pwd_discount ?? 0),
  less_vat: Number(taxInfo?.less_vat ?? 0),
  promo_discount: Number(taxInfo?.promo_discount ?? 0),
  vat_register_status: Number(taxInfo?.vat_register_status ?? 1),
});

const buildManualOrderStatusChange = (
  params: {
    orderInnerNo: string;
    orderNo: string;
    statusType: number;
    status: ORDER_CHANGE_STATUS;
    operatorId: number;
    operatorName: string;
    now: string;
  },
  selectStmts: CreateOrderSelectStmts,
): OrderStatusChangeRecord => {
  const result = getCreateOrderStatusChangeStmt().run(
    buildSqlParams(
      {
        order_inner_no: params.orderInnerNo,
        order_no: params.orderNo,
        status_type: params.statusType,
        status: params.status,
        display_type: 1,
        operator_id: params.operatorId,
        remark: statusChangeRemark.get(params.status) ?? "",
        create_time: params.now,
        operator_name: params.operatorName,
      },
      [
        "order_inner_no",
        "status_type",
        "status",
        "display_type",
        "operator_id",
        "remark",
        "create_time",
        "order_no",
        "operator_name",
      ],
      {},
    ),
  );

  return selectStmts.selectOrderStatusChangeByIdStmt.get({
    id: Number(result.lastInsertRowid),
  }) as OrderStatusChangeRecord;
};

// 手工录单 Charge 一次性完成下单、支付和完成状态。
const createManualOrder = (params: CreateManualOrderParams) => {
  const { user } = getCurrentSession();
  if (!user?.restaurant_id || !user?.id) {
    throw new Error("Current session user is missing.");
  }

  const db = getDB();
  const createManualOrderTx = db.transaction((txReq: CreateManualOrderParams) => {
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const selectStmts = createOrderSelectStmts(db);
    const receiptNo = String(txReq.receipt_no ?? txReq.receiptNo ?? "").trim();
    const totalAmount = Number(txReq.total_amount ?? txReq.totalAmount ?? 0);
    const taxInfo = normalizeManualOrderTaxInfo(txReq.tax_info ?? txReq.taxInfo);
    const surcharge = Number(txReq.surcharge ?? 0);
    const realAmount = Number(txReq.real_amount ?? txReq.realAmount ?? totalAmount);
    const discountType = txReq.discount_type ?? txReq.discountType ?? null;
    const discountNos = normalizeDiscountNos(txReq.discount_nos ?? txReq.discountNos);
    const orderChannel = Number(txReq.order_channel ?? txReq.orderChannel ?? ORDER_CHANNEL.TABLE);
    const orderInnerNo = String(txReq.order_inner_no ?? txReq.orderInnerNo ?? "").trim();
    const skuList = txReq.sku_list ?? txReq.skuList ?? [];
    const isNewOrder = !orderInnerNo;

    // 对齐后端金额校验：原始金额 = 实付 - surcharge + 折扣/less VAT。
    const expectedTotalAmount =
      realAmount - surcharge + taxInfo.pwd_discount + taxInfo.less_vat + taxInfo.promo_discount;
    if (totalAmount < 0 || realAmount < 0 || totalAmount !== expectedTotalAmount) {
      throw new Error("Illegal amount.");
    }

    if (receiptNo && !authManualOrderSerialNumber({ receipt_no: receiptNo })) {
      throw new Error("This Manual SI/OR has already exists, Please modify it and resubmit.");
    }

    let foodOrderList: FoodOrderRecord[] = [];
    let placeOrderStatusChange: OrderStatusChangeRecord | null = null;

    if (isNewOrder) {
      if (skuList.length === 0) {
        throw new Error("The order does not exist.");
      }

      const normalizedReq = normalizeCreateOrderReq({
        customer_num: Number(txReq.customer_num ?? txReq.customerNum ?? 0),
        mode: RESTAURANT_ORDER_MODE.BEFORE_MEAL,
        order_app: ORDER_APP_MANUAL_ORDER,
        order_channel: orderChannel,
        payment_way: PAYMENT_WAY_OFFLINE,
        restaurant_id: user.restaurant_id,
        restaurant_type: RESTAURANT_ORDER_MODE.BEFORE_MEAL,
        service_fee: 0,
        sku_list: skuList,
        table_id: 0,
        total_amount: totalAmount,
        waiter_no: user.waiter_no,
        user_no: txReq.user_no ?? txReq.userNo ?? "",
        remark: String(txReq.remark ?? "").trim(),
      } as CreateOrderReq);
      const { orderId, record } = createNewFoodOrderRecord(db, normalizedReq, {
        orderInnerNo: constructOrderInnerNo(),
        orderType: ORDER_TYPE.MASTER,
        now,
        isPrint: false,
      });

      db.prepare("UPDATE food_order SET total_count = @total_count WHERE id = @id").run({
        id: orderId,
        total_count: skuList.reduce((sum, item) => sum + Number(item.count ?? 1), 0),
      });
      insertOrderDetails(orderId, skuList, now, selectStmts);
      placeOrderStatusChange = insertPlaceOrderStatusChange(
        {
          order_inner_no: record.order_inner_no as string,
          order_channel: orderChannel,
          order_no: record.order_no as string,
          now,
        },
        selectStmts,
      );
      foodOrderList = [selectStmts.selectFoodOrderByIdStmt.get({ id: orderId }) as FoodOrderRecord];
      upsertOrderPrintInfoSnapshot(db, {
        foodOrder: foodOrderList[0],
        now,
      });
    } else {
      foodOrderList = getSelectOrderListByOrderInnerNoStmt().all({
        order_inner_no: orderInnerNo,
      }) as FoodOrderRecord[];
    }

    if (foodOrderList.length === 0) {
      throw new Error("The order does not exist.");
    }
    if (foodOrderList.some((order) => order.payment_status === PAYMENT_STATUS.PAY_SUCCESS)) {
      throw new Error("Orders that are not in the status of [UNPAID] orders cannot be [PAID]");
    }

    const masterOrder = foodOrderList.find((order) => order.order_type === ORDER_TYPE.MASTER) ?? foodOrderList[0];
    const mchOrderId = `OFF${generateSnowflakeId()}`;
    const discountAmount = discountType === 2 ? taxInfo.promo_discount : discountType ? taxInfo.pwd_discount : null;
    // 手工录单显式输入的 SI/OR 优先；未输入时使用本地 receipt 序列自动分配。
    const effectiveReceiptNo = receiptNo || nextLocalReceiptNo(user.restaurant_id, db);
    const orderPaymentResult = getCreateOrderPaymentStmt().run(
      buildSqlParams(
        {
          restaurant_id: user.restaurant_id,
          restaurant_user_id: "",
          user_no: txReq.user_no ?? txReq.userNo ?? "",
          order_inner_no: masterOrder.order_inner_no,
          mch_order_id: mchOrderId,
          transaction_id: null,
          amount: totalAmount,
          transaction_status: PAYMENT_STATUS.PAY_SUCCESS,
          pay_product_type: txReq.pay_product_type ?? txReq.payProductType ?? 0,
          channel_code: txReq.channel_code ?? txReq.channelCode ?? "",
          payment_platform: txReq.payment_platform ?? txReq.paymentPlatform ?? "PayCools",
          final_payment_status: 1,
          transaction_create_time: now,
          transaction_return_time: now,
          create_time: now,
          update_time: now,
          real_amount: realAmount,
          discount_number: txReq.discount_number ?? txReq.discountNumber ?? null,
          discount_no: discountNos.length ? JSON.stringify(discountNos) : null,
          discount_type: discountType || null,
          real_tax_amount: txReq.real_tax_amount ?? txReq.realTaxAmount ?? taxInfo.tax_amount,
          real_service_fee: 0,
          system_transaction_no: null,
          refund_serial_no: null,
          coupon_amount: null,
          cash_receipt_amount: realAmount,
          refund_remark: null,
          discounter_name: txReq.discounter_name ?? txReq.discounterName ?? null,
          discount_validity_period: txReq.discount_validity_period ?? txReq.discountValidityPeriod ?? null,
          discount_serial_no: null,
          discount_amount: discountAmount,
          receipt_no: effectiveReceiptNo,
          waiter_id: user.id,
          real_customer_num: txReq.customer_num ?? txReq.customerNum ?? null,
          surcharge,
          promo_discount_type: 1,
        },
        [
          "restaurant_id",
          "restaurant_user_id",
          "user_no",
          "order_inner_no",
          "mch_order_id",
          "transaction_id",
          "amount",
          "transaction_status",
          "pay_product_type",
          "channel_code",
          "payment_platform",
          "final_payment_status",
          "transaction_create_time",
          "transaction_return_time",
          "create_time",
          "update_time",
          "real_amount",
          "discount_number",
          "discount_no",
          "discount_type",
          "real_tax_amount",
          "real_service_fee",
          "system_transaction_no",
          "refund_serial_no",
          "coupon_amount",
          "cash_receipt_amount",
          "refund_remark",
          "discounter_name",
          "discount_validity_period",
          "discount_serial_no",
          "discount_amount",
          "receipt_no",
          "waiter_id",
          "real_customer_num",
          "surcharge",
          "promo_discount_type",
        ],
        {},
      ),
    );
    const orderPaymentId = Number(orderPaymentResult.lastInsertRowid);

    const orderPaymentTaxResult = getCreateOrderPaymentTaxStmt().run(
      buildSqlParams(
        {
          ...taxInfo,
          order_payment_id: orderPaymentId,
          create_time: now,
          update_time: now,
        },
        [
          "order_payment_id",
          "vatable_sales",
          "tax_amount",
          "vat_exempt_sales",
          "vat_exemption",
          "zero_rated_sales",
          "create_time",
          "update_time",
          "pwd_discount",
          "less_vat",
          "promo_discount",
          "vat_register_status",
        ],
        {},
      ),
    );
    const orderPaymentTaxId = Number(orderPaymentTaxResult.lastInsertRowid);

    db.prepare(
      `
        UPDATE food_order
        SET
          restaurant_type = @restaurant_type,
          payment_way = @payment_way,
          order_payment_id = @order_payment_id,
          table_id = 0,
          service_fee = 0,
          total_amount = @total_amount,
          order_status = @order_status,
          payment_status = @payment_status,
          order_app = @order_app,
          order_channel = @order_channel,
          complete_time = @complete_time,
          update_time = @update_time,
          tax_amount = @tax_amount
        WHERE order_inner_no = @order_inner_no
      `,
    ).run({
      restaurant_type: RESTAURANT_ORDER_MODE.BEFORE_MEAL,
      payment_way: txReq.payment_way ?? txReq.paymentWay ?? PAYMENT_WAY_OFFLINE,
      order_payment_id: orderPaymentId,
      total_amount: totalAmount,
      order_status: ORDER_STATUS.COMPLETED,
      payment_status: PAYMENT_STATUS.PAY_SUCCESS,
      order_app: ORDER_APP_MANUAL_ORDER,
      order_channel: orderChannel,
      complete_time: now,
      update_time: now,
      tax_amount: taxInfo.tax_amount,
      order_inner_no: masterOrder.order_inner_no,
    });

    const paidStatusChange = buildManualOrderStatusChange(
      {
        orderInnerNo: masterOrder.order_inner_no,
        orderNo: masterOrder.order_no,
        statusType: orderChannel,
        status: ORDER_CHANGE_STATUS.PAID,
        operatorId: user.id,
        operatorName: user.name,
        now,
      },
      selectStmts,
    );
    const completedStatusChange = buildManualOrderStatusChange(
      {
        orderInnerNo: masterOrder.order_inner_no,
        orderNo: masterOrder.order_no,
        statusType: orderChannel,
        status: ORDER_CHANGE_STATUS.COMPLETED,
        operatorId: user.id,
        operatorName: user.name,
        now,
      },
      selectStmts,
    );

    const waiterClockOrder = insertCurrentWaiterClockOrder({
      restaurantId: user.restaurant_id,
      waiterId: user.id,
      waiterNo: user.waiter_no,
      orderInnerNo: masterOrder.order_inner_no,
      recordOrderType: CLOCK_ORDER_TYPE.PAYMENT_ORDER,
    });
    const paymentRecord = selectRowsByIds<OrderPaymentRecord>(db, "order_payment", [orderPaymentId])[0] ?? null;
    const paymentTaxRecord =
      selectRowsByIds<OrderPaymentTaxRecord>(db, "order_payment_tax", [orderPaymentTaxId])[0] ?? null;

    refreshOrderPrintInfoSnapshotsByInnerNo(db, {
      orderInnerNo: masterOrder.order_inner_no,
      payment: paymentRecord,
      taxInfo: paymentTaxRecord,
      now,
    });

    return {
      success: true,
      created_order: isNewOrder,
      order_inner_no: masterOrder.order_inner_no,
      mch_order_id: mchOrderId,
      order_payment_id: orderPaymentId,

      // 手工录单不自动打印 payment receipt，只保留新单的订单/厨房/标签打印。
    };
  });

  return createManualOrderTx.immediate(params);
};

// 通过order inner no 获取订单列表
const getOrderListByOrderInnerNo = (orderInnerNo: string) => {
  // 从food order表中获取到的订单
  const foodOrderList = getSelectOrderListByOrderInnerNoStmt().all({
    order_inner_no: orderInnerNo,
  }) as FoodOrderRecord[];

  return foodOrderList.map((foodOrder) => {
    const orderDetailList = getSelectOrderDetailByOrderIdStmt().all({
      id: foodOrder.id,
    }) as OrderDetailRecord[];

    const orderDetailSnapList = getSelectOrderDetailSnapByOrderIdStmt().all({
      id: foodOrder.id,
    }) as OrderDetailSnapRecord[];

    // map存储order detail id 和 order detail 的映射关系，方便从snap的order detail id直接获取到数据。
    const orderDetailMap = new Map(orderDetailList.map((orderDetail) => [orderDetail.id, orderDetail]));

    const product_list = orderDetailSnapList.map((orderDetailSnap) => {
      const orderDetail = orderDetailMap.get(orderDetailSnap.order_detail_id);
      const storedOptions = parseJson<Array<unknown>>(orderDetail?.detail_snapshot, []);
      const sku = orderDetail
        ? (getDB().prepare("SELECT sku_no FROM dish_product_sku WHERE id = @id LIMIT 1").get({
            id: orderDetail.sku_id,
          }) as { sku_no: string } | undefined)
        : undefined;

      return {
        sku_no: sku?.sku_no ?? null,
        sku_name: orderDetailSnap.sku_name,
        count: orderDetailSnap.product_count,
        max_count: orderDetailSnap.product_count,
        price: orderDetailSnap.sku_price,
        detail_type: orderDetail?.detail_type ?? 1,
        option_list: normalizeOptionItemJsonForLocal(
          parseJson<Array<unknown>>(orderDetailSnap.option_item_json, storedOptions),
        ),
        available: null,
        warning_quantity: null,
        warning: null,
        cart_ingredient_list: null,
        order_detail_id: orderDetailSnap.order_detail_id,
        product_name: orderDetailSnap.product_name,
        variant: orderDetailSnap.variant,
        product_no: null,
        cart_no: null,
        menu_img_url: orderDetailSnap.menu_img_url,
        menu_img_url_oss_url: null,
        user_no: null,
        version: orderDetailSnap.sku_version,
      };
    });

    return {
      order_no: foodOrder.order_no,
      order_inner_no: foodOrder.order_inner_no,
      customer_num: foodOrder.customer_num,
      total_amount: foodOrder.total_amount,
      total_count: foodOrder.total_count,
      service_fee: foodOrder.service_fee,
      create_time: foodOrder.create_time,
      order_status: foodOrder.order_status,
      payment_status: foodOrder.payment_status,
      order_type: foodOrder.order_type,
      payment_way: foodOrder.payment_way,
      product_list,
      remark: foodOrder.remark,
      cancel_remark: foodOrder.cancel_remark,
      edit_remark: foodOrder.edit_remark,
      tax_amount: foodOrder.tax_amount,
      tax_type: foodOrder.tax_type,
      product_amount: foodOrder.total_amount - (foodOrder.tax_amount ?? 0) - (foodOrder.service_fee ?? 0),
      delivery_status: null,
      order_channel: foodOrder.order_channel,
      take_food_no: foodOrder.take_food_no,
      customer_dining_style: foodOrder.customer_dining_style,
      order_serial_number: foodOrder.order_serial_number,
      coupon_code: foodOrder.coupon_code,
      coupon_amount: foodOrder.coupon_amount,
      country_time_zone_code: "GMT+8",
      order_app: foodOrder.order_app,
    };
  });
};

// 通过 order inner no 获取主订单
const getMasterOrderByOrderInnerNo = (orderInnerNo: string) => {
  const foodOrderList = getSelectOrderListByOrderInnerNoStmt().all({
    order_inner_no: orderInnerNo,
  }) as FoodOrderRecord[];

  return foodOrderList.find((foodOrder) => foodOrder.order_type === ORDER_TYPE.MASTER);
};

// 根据创建时间排序订单
const sortOrdersByCreateTime = (
  left: Pick<FoodOrderRecord, "create_time" | "id">,
  right: Pick<FoodOrderRecord, "create_time" | "id">,
) => {
  const timeCompare = (left.create_time ?? "").localeCompare(right.create_time ?? "");

  if (timeCompare !== 0) {
    return timeCompare;
  }

  return left.id - right.id;
};

// 根据order no查询food order表的数据
const getFoodOrdersByOrderNos = (orderNos: string[]): FoodOrderRecord[] => {
  if (orderNos.length === 0) {
    return [];
  }

  const db = getDB();
  const placeholders = orderNos.map((_, index) => `@order_no_${index}`).join(", ");
  const sqlParams = orderNos.reduce<Record<string, string>>((params, orderNo, index) => {
    params[`order_no_${index}`] = orderNo;
    return params;
  }, {});

  return db.prepare(`SELECT * FROM food_order WHERE order_no IN (${placeholders})`).all(sqlParams) as FoodOrderRecord[];
};

type CreateOrderStatusChangesParams = {
  order_inner_no?: string;
  order_no?: string[];
  order_status: ORDER_CHANGE_STATUS;
  operator_id?: number;
  operator_name?: string;
};

// 统一写入 order_status_change，避免支付、退款、取消各自拼装同类数据。
const createOrderStatusChanges = (params: CreateOrderStatusChangesParams): OrderStatusChangeRecord[] => {
  const { user } = getCurrentSession();
  const operatorId = params.operator_id ?? user.id;
  const operatorName = params.operator_name ?? user.name;
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const remark = statusChangeRemark.get(params.order_status) ?? "";
  const createOrderStatusChangeStmt = getCreateOrderStatusChangeStmt();
  const selectOrderStatusChangeStmt = getDB().prepare("SELECT * FROM order_status_change WHERE id = @id");
  const createdStatusChanges: OrderStatusChangeRecord[] = [];

  // order_inner_no只设置主订单的变化表
  if (params.order_inner_no) {
    const masterOrder = getMasterOrderByOrderInnerNo(params.order_inner_no);
    if (!masterOrder) {
      throw new Error(`订单状态变更失败：未找到 order_inner_no=${params.order_inner_no} 对应的主订单`);
    }

    const result = createOrderStatusChangeStmt.run(
      buildSqlParams(
        {
          order_inner_no: params.order_inner_no,
          status_type: masterOrder.order_channel,
          status: params.order_status,
          display_type: 1,
          operator_id: operatorId,
          remark,
          create_time: now,
          order_no: masterOrder.order_no,
          operator_name: operatorName,
        },
        [
          "order_inner_no",
          "status_type",
          "status",
          "display_type",
          "operator_id",
          "remark",
          "create_time",
          "order_no",
          "operator_name",
        ],
        {},
      ),
    );
    createdStatusChanges.push(
      selectOrderStatusChangeStmt.get({
        id: Number(result.lastInsertRowid),
      }) as OrderStatusChangeRecord,
    );

    return createdStatusChanges;
  }

  const orderNos = [...new Set(params.order_no ?? [])];
  if (orderNos.length === 0) {
    throw new Error("订单状态变更失败：缺少 order_inner_no 或 order_no");
  }

  // order no设置所有订单的状态变化表，但是不会展示
  const targetOrders = getFoodOrdersByOrderNos(orderNos);
  if (targetOrders.length !== orderNos.length) {
    throw new Error("订单状态变更失败：部分 order_no 未找到对应订单");
  }

  targetOrders.forEach((order) => {
    const result = createOrderStatusChangeStmt.run(
      buildSqlParams(
        {
          order_inner_no: order.order_inner_no,
          status_type: order.order_channel,
          status: params.order_status,
          display_type: 2,
          operator_id: operatorId,
          remark,
          create_time: now,
          order_no: order.order_no,
          operator_name: operatorName,
        },
        [
          "order_inner_no",
          "status_type",
          "status",
          "display_type",
          "operator_id",
          "remark",
          "create_time",
          "order_no",
          "operator_name",
        ],
        {},
      ),
    );
    createdStatusChanges.push(
      selectOrderStatusChangeStmt.get({
        id: Number(result.lastInsertRowid),
      }) as OrderStatusChangeRecord,
    );
  });

  return createdStatusChanges;
};

const updateFoodOrdersByOrderNos = (
  orderNos: string[],
  fields: {
    order_status?: number;
    order_type?: number;
    update_time: string;
    complete_time?: string | null;
    cancel_remark?: string | null;
  },
) => {
  if (orderNos.length === 0) {
    return;
  }

  const setClauses: string[] = [];
  const sqlParams: Record<string, string | number | null> = {
    update_time: fields.update_time,
  };

  if (fields.order_status != null) {
    setClauses.push("order_status = @order_status");
    sqlParams.order_status = fields.order_status;
  }

  if (fields.order_type != null) {
    setClauses.push("order_type = @order_type");
    sqlParams.order_type = fields.order_type;
  }

  if (fields.cancel_remark !== undefined) {
    setClauses.push("cancel_remark = @cancel_remark");
    sqlParams.cancel_remark = fields.cancel_remark;
  }

  if (fields.complete_time !== undefined) {
    setClauses.push("complete_time = @complete_time");
    sqlParams.complete_time = fields.complete_time;
  }

  setClauses.push("update_time = @update_time");

  const placeholders = orderNos.map((_, index) => `@order_no_${index}`).join(", ");
  orderNos.forEach((orderNo, index) => {
    sqlParams[`order_no_${index}`] = orderNo;
  });

  getDB()
    .prepare(
      `
        UPDATE food_order
        SET ${setClauses.join(", ")}
        WHERE order_no IN (${placeholders})
      `,
    )
    .run(sqlParams);
};

const updateFoodOrdersByOrderInnerNo = (
  orderInnerNo: string,
  fields: {
    order_status?: number;
    order_type?: number;
    update_time: string;
    complete_time?: string | null;
    cancel_remark?: string | null;
  },
) => {
  const setClauses: string[] = [];
  const sqlParams: Record<string, string | number | null> = {
    order_inner_no: orderInnerNo,
    update_time: fields.update_time,
  };

  if (fields.order_status != null) {
    setClauses.push("order_status = @order_status");
    sqlParams.order_status = fields.order_status;
  }

  if (fields.order_type != null) {
    setClauses.push("order_type = @order_type");
    sqlParams.order_type = fields.order_type;
  }

  if (fields.cancel_remark !== undefined) {
    setClauses.push("cancel_remark = @cancel_remark");
    sqlParams.cancel_remark = fields.cancel_remark;
  }

  if (fields.complete_time !== undefined) {
    setClauses.push("complete_time = @complete_time");
    sqlParams.complete_time = fields.complete_time;
  }

  setClauses.push("update_time = @update_time");

  getDB()
    .prepare(
      `
        UPDATE food_order
        SET ${setClauses.join(", ")}
        WHERE order_inner_no = @order_inner_no
      `,
    )
    .run(sqlParams);
};

// 根据订单id，取消时修改order detail表
const updateOrderDetailsToCancelledByOrderIds = (orderIds: number[], updateTime: string) => {
  if (orderIds.length === 0) {
    return;
  }

  const placeholders = orderIds.map((_, index) => `@order_id_${index}`).join(", ");
  const sqlParams = orderIds.reduce<Record<string, number | string>>(
    (params, orderId, index) => {
      params[`order_id_${index}`] = orderId;
      return params;
    },
    {
      detail_type: 2,
      update_time: updateTime,
    },
  );

  getDB()
    .prepare(
      `
        UPDATE order_detail
        -- 2 表示该菜品明细已取消，用于和正常点单明细区分。
        SET detail_type = @detail_type,
            update_time = @update_time
        WHERE order_id IN (${placeholders})
      `,
    )
    .run(sqlParams);
};

const getOrderDetailsByOrderIds = (orderIds: number[]): OrderDetailRecord[] => {
  if (orderIds.length === 0) {
    return [];
  }

  const placeholders = orderIds.map((_, index) => `@order_id_${index}`).join(", ");
  const sqlParams = orderIds.reduce<Record<string, number>>((params, orderId, index) => {
    params[`order_id_${index}`] = orderId;
    return params;
  }, {});

  return getDB()
    .prepare(
      `
        SELECT *
        FROM order_detail
        WHERE order_id IN (${placeholders})
      `,
    )
    .all(sqlParams) as OrderDetailRecord[];
};

const getOrderDetailSnapsByOrderIds = (orderIds: number[]): OrderDetailSnapRecord[] =>
  orderIds.flatMap(
    (orderId) => getSelectOrderDetailSnapByOrderIdStmt().all({ id: orderId }) as OrderDetailSnapRecord[],
  );

const selectRowsByIds = <T>(
  db: ReturnType<typeof getDB>,
  tableName: string,
  ids: Array<number | null | undefined>,
): T[] => {
  const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];

  if (uniqueIds.length === 0) {
    return [];
  }

  const placeholders = uniqueIds.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM ${tableName} WHERE id IN (${placeholders})`).all(...uniqueIds) as T[];
};

// 本机主动修改订单后，返回本次变更涉及的表数据，供在线时推送服务器。

// 支付后处理结束时重新从 SQLite 读取整单，避免上传链条早期生成的旧快照。

const pickNextMasterOrder = (orders: FoodOrderRecord[]) => {
  const remainingOrders = orders
    .filter((order) => order.order_status !== ORDER_STATUS.CANCEL)
    .sort(sortOrdersByCreateTime);

  if (remainingOrders.length === 0) {
    return null;
  }

  return (
    // 优先沿用最早的已接单订单作为新的主订单；如果没有已接单，则退化为最早的一单。
    remainingOrders.find((order) => order.order_status === ORDER_STATUS.RECEIVED) ?? remainingOrders[0]
  );
};

type ReduceOrderDetailReq = {
  order_detail_id: number;
  count: number;
};

type ReduceOrderReq = {
  order_inner_no?: string;
  order_detail_list?: ReduceOrderDetailReq[];
  remark?: string;
};

const DETAIL_TYPE_INCREASE = 1;
const DETAIL_TYPE_CANCEL = 2;

const getChangedReduceDetailList = (req: ReduceOrderReq, detailMap: Map<number, OrderDetailRecord>) =>
  (req.order_detail_list ?? [])
    .map((item) => {
      const orderDetailId = Number(item.order_detail_id);
      const nextCount = Number(item.count);
      const orderDetail = detailMap.get(orderDetailId);

      if (!orderDetail) {
        throw new Error(`These orders were not found, order_detail_id=${orderDetailId}`);
      }

      if (orderDetail.detail_type !== DETAIL_TYPE_INCREASE) {
        throw new Error("The order status is wrong, only orders that have been received or pending can be edited");
      }

      if (!Number.isInteger(nextCount) || nextCount < 0) {
        throw new Error("Quantity cannot be less than 0");
      }

      if (nextCount > Number(orderDetail.count ?? 0)) {
        throw new Error(`Please select the correct order quantity, order detail id ${orderDetailId}`);
      }

      return {
        orderDetail,
        nextCount,
      };
    })
    .filter(({ orderDetail, nextCount }) => nextCount !== Number(orderDetail.count ?? 0));

const getUnitOptionAmountFromOrderDetail = (
  orderDetail: OrderDetailRecord,
  orderDetailSnap?: OrderDetailSnapRecord,
) => {
  const count = Number(orderDetail.count ?? 0);
  const storedOptionAmount = Number(orderDetail.option_amount ?? 0);
  if (count > 0 && storedOptionAmount > 0) {
    return Math.round(storedOptionAmount / count);
  }

  const snapshotOptionAmount = getUnitOptionAmount({
    option_list: normalizeOptionItemJsonForLocal(parseJson<Array<unknown>>(orderDetail.detail_snapshot, [])),
  } as CreateOrderSkuItem);
  if (snapshotOptionAmount > 0) {
    return snapshotOptionAmount;
  }

  // 兼容历史错误数据：snap.sku_price 是含小料单价，order_detail.sku_amount 是基础 SKU 单价。
  return Math.max(Number(orderDetailSnap?.sku_price ?? 0) - Number(orderDetail.sku_amount ?? 0), 0);
};

const normalizeOrderDetailOptionAmounts = (
  db: ReturnType<typeof getDB>,
  params: {
    orderDetails: OrderDetailRecord[];
    orderDetailSnapMap: Map<number, OrderDetailSnapRecord>;
    now: string;
  },
) => {
  return params.orderDetails.map((orderDetail) => {
    const nextOptionAmount =
      getUnitOptionAmountFromOrderDetail(orderDetail, params.orderDetailSnapMap.get(orderDetail.id)) *
      Number(orderDetail.count ?? 0);

    if (nextOptionAmount === Number(orderDetail.option_amount ?? 0)) {
      return orderDetail;
    }

    // 扣菜重算前先补齐小料总额，确保同步给服务器的明细和订单总额一致。
    db.prepare(
      `
        UPDATE order_detail
        SET option_amount = @option_amount,
            update_time = @update_time
        WHERE id = @id
      `,
    ).run({
      id: orderDetail.id,
      option_amount: nextOptionAmount,
      update_time: params.now,
    });

    return {
      ...orderDetail,
      option_amount: nextOptionAmount,
      update_time: params.now,
    };
  });
};

const recalculateFoodOrdersAfterReduce = (
  db: ReturnType<typeof getDB>,
  params: {
    foodOrders: FoodOrderRecord[];
    now: string;
    editRemark: string;
  },
) => {
  const restaurantSetting = getCurrentRestaurantSettings();
  const updatedFoodOrders: FoodOrderRecord[] = [];

  for (const foodOrder of params.foodOrders) {
    const orderDetailSnapList = getSelectOrderDetailSnapByOrderIdStmt().all({
      id: foodOrder.id,
    }) as OrderDetailSnapRecord[];
    const orderDetailSnapMap = new Map(orderDetailSnapList.map((snap) => [snap.order_detail_id, snap]));
    const orderDetails = normalizeOrderDetailOptionAmounts(db, {
      orderDetails: getSelectOrderDetailByOrderIdStmt().all({ id: foodOrder.id }) as OrderDetailRecord[],
      orderDetailSnapMap,
      now: params.now,
    });
    const activeDetails = orderDetails.filter((detail) => detail.detail_type === DETAIL_TYPE_INCREASE);
    const calculateDetails =
      activeDetails.length > 0
        ? activeDetails
        : orderDetails.filter((detail) => detail.detail_type === DETAIL_TYPE_CANCEL);
    const productTotalAmount = calculateDetails.reduce(
      (sum, detail) =>
        sum + Number(detail.count ?? 0) * Number(detail.sku_amount ?? 0) + Number(detail.option_amount ?? 0),
      0,
    );
    const totalCount = calculateDetails.reduce((sum, detail) => sum + Number(detail.count ?? 0), 0);
    const serviceFee =
      activeDetails.length > 0 &&
      restaurantSetting?.service_fee_status === PRODUCT_STATUS.VALID &&
      restaurantSetting?.service_fee_type === SERVICE_FEE_TYPE.PERCENTAGE
        ? Math.round(productTotalAmount * Number(restaurantSetting?.service_fee ?? 0))
        : Number(foodOrder.service_fee ?? 0);
    const taxAmount = Number(foodOrder.tax_amount ?? 0);
    const totalAmount = productTotalAmount + serviceFee + taxAmount;
    const orderStatus = activeDetails.length > 0 ? foodOrder.order_status : ORDER_STATUS.CANCEL;

    db.prepare(
      `
        UPDATE food_order
        SET total_count = @total_count,
            total_amount = @total_amount,
            service_fee = @service_fee,
            order_status = @order_status,
            edit_remark = @edit_remark,
            update_time = @update_time
        WHERE id = @id
      `,
    ).run({
      id: foodOrder.id,
      total_count: totalCount,
      total_amount: totalAmount,
      service_fee: serviceFee,
      order_status: orderStatus,
      edit_remark: params.editRemark,
      update_time: params.now,
    });

    updatedFoodOrders.push(
      db.prepare("SELECT * FROM food_order WHERE id = @id").get({ id: foodOrder.id }) as FoodOrderRecord,
    );
  }

  const activeOrders = updatedFoodOrders.filter((order) => order.order_status !== ORDER_STATUS.CANCEL);
  if (activeOrders.length > 0 && !activeOrders.some((order) => order.order_type === ORDER_TYPE.MASTER)) {
    const nextMasterOrder = pickNextMasterOrder(updatedFoodOrders);
    if (nextMasterOrder) {
      db.prepare(
        `
          UPDATE food_order
          SET order_type = @order_type,
              update_time = @update_time
          WHERE id = @id
        `,
      ).run({
        id: nextMasterOrder.id,
        order_type: ORDER_TYPE.MASTER,
        update_time: params.now,
      });
    }
  }
};

const reduceOrder = (req: ReduceOrderReq) => {
  const { user } = getCurrentSession();
  const db = getDB();
  const reduceOrderTx = db.transaction((txReq: ReduceOrderReq) => {
    const orderInnerNo = txReq.order_inner_no;
    if (!orderInnerNo) {
      throw new Error("Order inner no can not be empty");
    }

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const foodOrders = getSelectOrderListByOrderInnerNoStmt().all({
      order_inner_no: orderInnerNo,
    }) as FoodOrderRecord[];
    const restaurantFoodOrders = foodOrders.filter(
      (order) => Number(order.restaurant_id) === Number(user.restaurant_id),
    );

    if (restaurantFoodOrders.length === 0) {
      throw new Error("There is no such order, please choose again");
    }

    const masterOrder =
      restaurantFoodOrders.find((order) => order.order_type === ORDER_TYPE.MASTER) ??
      restaurantFoodOrders.slice().sort(sortOrdersByCreateTime)[0];

    if (
      [
        PAYMENT_STATUS.PAY_SUCCESS,
        PAYMENT_STATUS.REFUNDING,
        PAYMENT_STATUS.REFUND_FAILED,
        PAYMENT_STATUS.REFUND_CANCEL,
        PAYMENT_STATUS.REFUND_PENDING,
      ].includes(Number(masterOrder.payment_status))
    ) {
      throw new Error("The order had been paid!");
    }

    const editableOrders = restaurantFoodOrders.filter((order) =>
      [ORDER_STATUS.RECEIVED, ORDER_STATUS.PROCESSING].includes(Number(order.order_status)),
    );
    if (editableOrders.length === 0) {
      throw new Error("The order status is wrong, only orders that have been received or pending can be edited");
    }

    const orderIds = restaurantFoodOrders.map((order) => order.id);
    const allDetails = getOrderDetailsByOrderIds(orderIds);
    const detailMap = new Map(allDetails.map((detail) => [detail.id, detail]));
    const snapList = getOrderDetailSnapsByOrderIds(orderIds);
    const snapMap = new Map(snapList.map((snap) => [snap.order_detail_id, snap]));
    const changedDetails = getChangedReduceDetailList(txReq, detailMap);
    const editRemark = txReq.remark == null ? "" : txReq.remark.trim();

    if (changedDetails.length === 0) {
      restaurantFoodOrders.forEach((foodOrder) => {
        db.prepare(
          `
            UPDATE food_order
            SET edit_remark = @edit_remark,
                update_time = @update_time
            WHERE id = @id
          `,
        ).run({
          id: foodOrder.id,
          edit_remark: editRemark,
          update_time: now,
        });
      });

      return {
        order_inner_no: orderInnerNo,
        order_list: getOrderListByOrderInnerNo(orderInnerNo),
        cancelled_all: false,
      };
    }

    const selectOrderDetailByIdStmt = db.prepare("SELECT * FROM order_detail WHERE id = @id");
    const selectOrderDetailSnapByIdStmt = db.prepare("SELECT * FROM order_detail_snap WHERE id = @id");

    for (const { orderDetail, nextCount } of changedDetails) {
      const oldCount = Number(orderDetail.count ?? 0);
      const reduceCount = oldCount - nextCount;
      const oldSnap = snapMap.get(orderDetail.id);

      if (!oldSnap) {
        throw new Error(`Order detail snap not found, order_detail_id=${orderDetail.id}`);
      }

      const unitOptionAmount = getUnitOptionAmountFromOrderDetail(orderDetail, oldSnap);

      if (nextCount === 0) {
        db.prepare("DELETE FROM order_detail_snap WHERE order_detail_id = @order_detail_id").run({
          order_detail_id: orderDetail.id,
        });
        db.prepare("DELETE FROM order_detail WHERE id = @id").run({ id: orderDetail.id });
      } else {
        db.prepare(
          `
            UPDATE order_detail
            SET count = @count,
                option_amount = @option_amount,
                update_time = @update_time
            WHERE id = @id
          `,
        ).run({
          id: orderDetail.id,
          count: nextCount,
          option_amount: nextCount * unitOptionAmount,
          update_time: now,
        });
        db.prepare(
          `
            UPDATE order_detail_snap
            SET product_count = @product_count,
                update_time = @update_time
            WHERE order_detail_id = @order_detail_id
          `,
        ).run({
          order_detail_id: orderDetail.id,
          product_count: nextCount,
          update_time: now,
        });
      }

      const existingCancelDetail = db
        .prepare(
          `
            SELECT *
            FROM order_detail
            WHERE parent_id = @parent_id
              AND detail_type = @detail_type
            LIMIT 1
          `,
        )
        .get({
          parent_id: orderDetail.id,
          detail_type: DETAIL_TYPE_CANCEL,
        }) as OrderDetailRecord | undefined;

      if (existingCancelDetail) {
        const nextCancelCount = Number(existingCancelDetail.count ?? 0) + reduceCount;
        db.prepare(
          `
            UPDATE order_detail
            SET count = @count,
                option_amount = @option_amount,
                update_time = @update_time
            WHERE id = @id
          `,
        ).run({
          id: existingCancelDetail.id,
          count: nextCancelCount,
          option_amount: nextCancelCount * unitOptionAmount,
          update_time: now,
        });
        db.prepare(
          `
            UPDATE order_detail_snap
            SET product_count = @product_count,
                update_time = @update_time
            WHERE order_detail_id = @order_detail_id
          `,
        ).run({
          order_detail_id: existingCancelDetail.id,
          product_count: nextCancelCount,
          update_time: now,
        });
      } else {
        const insertCancelDetailResult = db
          .prepare(
            `
              INSERT INTO order_detail (
                order_id,
                sku_id,
                count,
                sku_amount,
                option_amount,
                detail_type,
                detail_snapshot,
                create_time,
                update_time,
                parent_id
              ) VALUES (
                @order_id,
                @sku_id,
                @count,
                @sku_amount,
                @option_amount,
                @detail_type,
                @detail_snapshot,
                @create_time,
                @update_time,
                @parent_id
              )
            `,
          )
          .run({
            order_id: orderDetail.order_id,
            sku_id: orderDetail.sku_id,
            count: reduceCount,
            sku_amount: orderDetail.sku_amount,
            option_amount: reduceCount * unitOptionAmount,
            detail_type: DETAIL_TYPE_CANCEL,
            detail_snapshot: orderDetail.detail_snapshot,
            create_time: now,
            update_time: now,
            parent_id: orderDetail.id,
          });
        const cancelDetailId = Number(insertCancelDetailResult.lastInsertRowid);

        db.prepare(
          `
            INSERT INTO order_detail_snap (
              food_order_id,
              order_detail_id,
              product_name,
              menu_img_url,
              product_count,
              sku_name,
              sku_price,
              variant,
              option_item_json,
              sku_version,
              create_time,
              update_time
            ) VALUES (
              @food_order_id,
              @order_detail_id,
              @product_name,
              @menu_img_url,
              @product_count,
              @sku_name,
              @sku_price,
              @variant,
              @option_item_json,
              @sku_version,
              @create_time,
              @update_time
            )
          `,
        ).run({
          food_order_id: oldSnap.food_order_id,
          order_detail_id: cancelDetailId,
          product_name: oldSnap.product_name,
          menu_img_url: oldSnap.menu_img_url,
          product_count: reduceCount,
          sku_name: oldSnap.sku_name,
          sku_price: oldSnap.sku_price,
          variant: oldSnap.variant,
          // 取消明细复制旧快照时也统一成后端 FastJSON 的 camelCase 结构。
          option_item_json: normalizeOptionItemJsonTextForBackend(oldSnap.option_item_json),
          sku_version: oldSnap.sku_version,
          create_time: now,
          update_time: now,
        });

        detailMap.set(cancelDetailId, selectOrderDetailByIdStmt.get({ id: cancelDetailId }) as OrderDetailRecord);
        snapMap.set(cancelDetailId, selectOrderDetailSnapByIdStmt.get({ id: cancelDetailId }) as OrderDetailSnapRecord);
      }
    }

    recalculateFoodOrdersAfterReduce(db, {
      foodOrders: restaurantFoodOrders,
      now,
      editRemark,
    });

    const updatedFoodOrders = getSelectOrderListByOrderInnerNoStmt().all({
      order_inner_no: orderInnerNo,
    }) as FoodOrderRecord[];
    const activeOrders = updatedFoodOrders.filter((order) => order.order_status !== ORDER_STATUS.CANCEL);
    const cancelledAll = activeOrders.length === 0;
    const orderStatusChangeList = cancelledAll
      ? createOrderStatusChanges({
          order_inner_no: orderInnerNo,
          order_status: ORDER_CHANGE_STATUS.DELIVERY_FAILED,
        })
      : [];

    if (cancelledAll) {
      insertCurrentWaiterClockOrder({
        restaurantId: user.restaurant_id,
        waiterId: user.id,
        waiterNo: user.waiter_no,
        orderInnerNo,
        recordOrderType: CLOCK_ORDER_TYPE.CANCEL_ORDER,
      });
    }

    updatedFoodOrders.forEach((foodOrder) => {
      upsertOrderPrintInfoSnapshot(db, {
        foodOrder,
        now,
      });
    });

    return {
      order_inner_no: orderInnerNo,
      order_list: getOrderListByOrderInnerNo(orderInnerNo),
      cancelled_all: cancelledAll,
    };
  });

  return reduceOrderTx.immediate(req);
};

//创建支付订单
const createPaymentOrder = (req: any) => {
  const db = getDB();
  const createPaymentOrderTx = db.transaction((txReq: any) => {
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const orderInnerNo = txReq.order_inner_no;
    const mchOrderId = construcMchOrderId();
    const restaurantId = Number(txReq.restaurant_id ?? getCurrentSession().user?.restaurant_id ?? 0);
    if (!restaurantId) {
      throw new Error("restaurant_id is required for receipt_no.");
    }
    const defaultRecord = {
      restaurant_id: restaurantId,
      mch_order_id: mchOrderId,
      transaction_status: PAYMENT_STATUS.UNPAY,
      pay_product_type: 0, // 线下固定现金
      payment_platform: "Paycools",
      final_payment_status: 2, // 只有真正被支付的订单，在支付后会设置为1。
      transaction_create_time: now, // 创建订单的时间
      create_time: now, //创建这条记录的时间
      // 未支付记录不预占 SI，只在正向支付确认成功时取号。
      receipt_no: null,
      // promo_discount_type: 1,  // 1是整单折扣
    };

    // 插入order payment表数据
    const orderPaymentParams = buildSqlParams(
      {
        ...txReq,
        ...defaultRecord,
      },
      [
        "restaurant_id",
        "restaurant_user_id",
        "user_no",
        "order_inner_no",
        "mch_order_id",
        "transaction_id",
        "amount",
        "transaction_status",
        "pay_product_type",
        "channel_code",
        "payment_platform",
        "final_payment_status",
        "transaction_create_time",
        "transaction_return_time",
        "create_time",
        "update_time",
        "real_amount",
        "discount_number",
        "discount_no",
        "discount_type",
        "real_tax_amount",
        "real_service_fee",
        "system_transaction_no",
        "refund_serial_no",
        "coupon_amount",
        "cash_receipt_amount",
        "refund_remark",
        "discounter_name",
        "discount_validity_period",
        "discount_serial_no",
        "discount_amount",
        "receipt_no",
        "waiter_id",
        "real_customer_num",
        "surcharge",
        "promo_discount_type",
      ],
      {
        restaurant_user_id: "",
        user_no: "",
        transaction_id: null,
        channel_code: "",
        payment_platform: "",
        final_payment_status: 2,
        transaction_create_time: "",
        transaction_return_time: "",
        create_time: "",
        update_time: "",
        promo_discount_type: 1,
        real_service_fee: 0,
      },
    );

    const orderPaymentResult = getCreateOrderPaymentStmt().run(orderPaymentParams);
    const orderPaymentId = Number(orderPaymentResult.lastInsertRowid);

    // 插入税费表数据
    const { tax_info, promo_discount, vat_register_status } = txReq;
    const { vatable_sales, tax_amount, vat_exempt_sales, vat_exemption, zero_rated_sales, pwd_discount, less_vat } =
      tax_info;
    const orderPaymentTaxParams = buildSqlParams(
      {
        vatable_sales,
        tax_amount,
        vat_exempt_sales,
        vat_exemption,
        zero_rated_sales,
        // 本机 PWD/SC 与原线上税务快照保持一致，折扣和 Less VAT 必须同时落库。
        pwd_discount,
        less_vat,
        order_payment_id: orderPaymentId,
        create_time: now,
        update_time: now,
        promo_discount,
        vat_register_status,
      },
      [
        "order_payment_id",
        "vatable_sales",
        "tax_amount",
        "vat_exempt_sales",
        "vat_exemption",
        "zero_rated_sales",
        "create_time",
        "update_time",
        "pwd_discount",
        "less_vat",
        "promo_discount",
        "vat_register_status",
      ],
      {},
    );

    const orderPaymentTaxResult = getCreateOrderPaymentTaxStmt().run(orderPaymentTaxParams);

    // 插入订单状态表数据
    const { order_inner_no, waiter_id, operator_name } = txReq;
    const status = ORDER_CHANGE_STATUS.PAID;
    const masterOrder = getMasterOrderByOrderInnerNo(order_inner_no);
    if (!masterOrder) {
      throw new Error(`创建支付订单失败：未找到 order_inner_no=${order_inner_no} 对应的主订单`);
    }

    const orderStatusChangeParams = buildSqlParams(
      {
        order_inner_no,
        order_no: masterOrder.order_no,
        display_type: 1, // 默认全部设置为展示
        status,
        operator_id: waiter_id,
        create_time: now,
        remark: statusChangeRemark.get(status) ?? "",
        operator_name,
      },
      [
        "order_inner_no",
        "status_type",
        "status",
        "display_type",
        "operator_id",
        "remark",
        "create_time",
        "order_no",
        "operator_name",
      ],
      {
        order_inner_no: "",
        status_type: 1,
        status,
        display_type: 1,
        operator_id: 0,
        remark: "",
        create_time: now,
        order_no: "",
        operator_name: "",
      },
    );

    const orderStatusChangeResult = getCreateOrderStatusChangeStmt().run(orderStatusChangeParams);

    return {
      order_payment_id: orderPaymentId,
      order_payment_tax_id: Number(orderPaymentTaxResult.lastInsertRowid),
      order_status_change_id: Number(orderStatusChangeResult.lastInsertRowid),
      order_inner_no: orderInnerNo,
      order_no: masterOrder.order_no,
      mch_order_id: mchOrderId,
      receipt_no: null,
    };
  });

  return createPaymentOrderTx.immediate(req);
};

type CashReceivedParams = {
  mch_order_id: string;
  order_inner_no: string;
  order_no: string;
  operator_name: string;
  operator_id: number;
  status_type: number;
  order_payment_id: number;
  guestNumber: number;
  amountDetail: {
    service_fee: number;
    tax_info: {
      tax_amount: number;
    };
  };
};

type InsertCurrentWaiterClockOrderParams = {
  restaurantId: number;
  waiterId?: number | null;
  waiterNo?: string | null;
  orderInnerNo: string;
  recordOrderType: CLOCK_ORDER_TYPE;
};

const insertCurrentWaiterClockOrder = (params: InsertCurrentWaiterClockOrderParams) => {
  // 对齐后端 AddWaiterClockOrder，并用本地 waiter id 绑定当前 shift，保证 cashier report 能查到订单。
  return ensureCurrentWaiterClockOrder({
    order_inner_no: params.orderInnerNo,
    record_order_type: params.recordOrderType,
    restaurant_id: params.restaurantId,
    waiter_id: params.waiterId,
    waiter_no: params.waiterNo,
  });
};

const takePositivePaymentReceiptNo = (
  db: ReturnType<typeof getDB>,
  payment: Pick<OrderPaymentRecord, "restaurant_id" | "receipt_no">,
): string => {
  const existingReceiptNo = String(payment.receipt_no ?? "").trim();
  if (existingReceiptNo) return existingReceiptNo;

  if (!payment.restaurant_id) {
    throw new Error("restaurant_id is required for receipt_no.");
  }

  // SI 只由正向支付成功事务取用，重试时复用已有号码避免重复递增。
  return nextLocalReceiptNo(payment.restaurant_id, db);
};

// 确认收到现金
const cashReceived = (req: CashReceivedParams) => {
  const { user } = getCurrentSession();
  const db = getDB();
  const cashReceivedTx = db.transaction((txReq: CashReceivedParams) => {
    const nowDayjs = dayjs();
    const now = nowDayjs.format("YYYY-MM-DD HH:mm:ss");
    const masterOrder = getMasterOrderByOrderInnerNo(txReq.order_inner_no);

    assignQueueTakeFoodNoIfNeeded(db, masterOrder, nowDayjs);

    const pendingPayment = selectRowsByIds<OrderPaymentRecord>(db, "order_payment", [txReq.order_payment_id])[0];
    if (!pendingPayment) {
      throw new Error(`收款失败：未找到 order_payment_id=${txReq.order_payment_id} 对应的支付记录`);
    }
    const receiptNo = takePositivePaymentReceiptNo(db, pendingPayment);

    getUpdateOrderPaymentFinishStmt().run({
      mch_order_id: txReq.mch_order_id,
      transaction_status: PAYMENT_STATUS.PAY_SUCCESS,
      final_payment_status: 1,
      receipt_no: receiptNo,
      transaction_return_time: now,
      update_time: now,
    });

    const nextOrderStatus =
      masterOrder?.order_channel === ORDER_CHANNEL.QUEUE
        ? ORDER_STATUS.RECEIVED
        : (masterOrder?.order_status ?? ORDER_STATUS.RECEIVED);

    getUpdateFoodOrderPaymentStatusStmt().run({
      order_inner_no: txReq.order_inner_no,
      order_payment_id: txReq.order_payment_id,
      // 线下现金收款只确认支付；排队/桌码都继续走后续接单、出餐或完成流程。
      order_status: nextOrderStatus,
      payment_status: PAYMENT_STATUS.PAY_SUCCESS,
      service_fee: txReq.amountDetail.service_fee,
      customer_num: txReq.guestNumber,
      payment_way: 2,
      tax_amount: txReq.amountDetail.tax_info.tax_amount,
      complete_time: null,
      update_time: now,
    });

    // 排队点餐现金支付后自动接单；其它订单只记录支付成功。
    const status =
      masterOrder?.order_channel === ORDER_CHANNEL.QUEUE ? ORDER_CHANGE_STATUS.ORDERS : ORDER_CHANGE_STATUS.PAID;
    const orderStatusChangeParams = buildSqlParams(
      {
        order_inner_no: txReq.order_inner_no,
        order_no: txReq.order_no,
        status_type: txReq.status_type,
        status,
        display_type: 1,
        operator_id: user.id,
        remark: statusChangeRemark.get(status) ?? "",
        create_time: now,
        operator_name: user.name,
      },
      [
        "order_inner_no",
        "status_type",
        "status",
        "display_type",
        "operator_id",
        "remark",
        "create_time",
        "order_no",
        "operator_name",
      ],
      {},
    );

    const orderStatusChangeResult = getCreateOrderStatusChangeStmt().run(orderStatusChangeParams);

    insertCurrentWaiterClockOrder({
      restaurantId: user.restaurant_id,
      waiterId: user.id,
      waiterNo: user.waiter_no,
      orderInnerNo: txReq.order_inner_no,
      recordOrderType: CLOCK_ORDER_TYPE.PAYMENT_ORDER,
    });

    const paymentTaxRecord = getSelectOrderPaymentTaxByOrderPaymentIdStmt().get({
      order_payment_id: txReq.order_payment_id,
    }) as OrderPaymentTaxRecord | undefined;
    const orderStatusChangeId = Number(orderStatusChangeResult.lastInsertRowid);
    const paymentRecord = selectRowsByIds<OrderPaymentRecord>(db, "order_payment", [txReq.order_payment_id])[0] ?? null;

    // 收款完成后刷新打印快照，确保支付小票和 View Digital Copy 使用最终金额、税费与流水号。
    refreshOrderPrintInfoSnapshotsByInnerNo(db, {
      orderInnerNo: txReq.order_inner_no,
      payment: paymentRecord,
      taxInfo: paymentTaxRecord ?? null,
      now,
    });

    return {
      order_status_change_id: orderStatusChangeId,
      mch_order_id: txReq.mch_order_id,
      order_inner_no: txReq.order_inner_no,
      order_payment_id: txReq.order_payment_id,
      // 现金收款是本机主动完成订单，返回变更数据供在线时推送服务器。
    };
  });

  return cashReceivedTx.immediate(req);
};

// 在线支付接口确认成功后，所有本地点餐模式统一在回拉支付数据后完成最终流转。

// 网络中断后由收银员人工核验在线支付 App 结果，并把本地订单流转到对应支付状态。

type orderListReqParams = {
  page: number;
  size: number;
  status?: number | string | null;
  refund_status?: boolean;
  table_name?: string | number | null;
  start_time?: string;
  end_time?: string;
};
type OrderListItem = FoodOrderRecord & {
  table_name: string | null;
  amount: number;
};

type OrderListRes = {
  list: Array<OrderListItem>;
  hasMore: boolean;
};

const escapeSqlLike = (value: string): string => {
  return value.replace(/[\\%_]/g, (matched) => `\\${matched}`);
};

type CancellableOrdersByTableReqParams = {
  order_create_time_start: string;
  order_create_time_end: string;
  table_id: number | string;
};

type CancellableOrderGroup = {
  table_name: string | null;
  table_uuid: string | null;
  order_inner_no: string;
  order_serial_number: string | null;
  transaction_id: string | null;
  channel_transaction_no: string | null;
  payment_channel: string | null;
  payment_channel_name: string | null;
  payment_time: string | null;
  create_time: string | null;
  expiration_time: string | null;
  order_list: ReturnType<typeof getOrderListByOrderInnerNo>;
  payable: boolean;
  edit_remark: string | null;
  discount_amount: number | null;
  amount: number;
  sub_total_amount: number | null;
  discount_number: number | null;
  tax_info: OrderPaymentTaxRecord | null;
  order_channel: number | null;
  take_food_no: string | null;
  customer_dining_style: number | null;
  waiter_name: string | null;
  receipt_no: string | null;
  refund_receipt_no: string | null;
  refund_serial_no: string | null;
  refund_transaction_id: string | null;
  refund_remark: string | null;
  coupon_code: string | null;
  coupon_amount: number;
  coupon_name: string | null;
  coupon_batch_no: string | null;
  country_time_zone_code: string;
  discounter_name: string | null;
  discount_validity_period: string | null;
  channel_reference_no: string | null;
  discounter_serial_no: string | null;
  discount_type: number | null;
  discount_nos: string | null;
  user_phone: string | null;
  user_name: string | null;
  user_photo_url: string | null;
  user_no: string | null;
  user_email: string | null;
  surcharge: number | null;
  order_app: number | null;
  device_no: string | null;
};

type CancellableOrdersByTableRes = {
  list: Array<CancellableOrderGroup>;
  hasMore: boolean;
};

type CancellableOrderDetailRes = {
  order_inner_no: string;
  order_list: ReturnType<typeof getOrderListByOrderInnerNo>;
  sub_total: number;
  total: number;
};

type UncompleteOrder = FoodOrderRecord & {
  table_name: string | null;
  table_uuid: string | null;
  amount: number;
  sub_total_amount: number;
  order_list: ReturnType<typeof getOrderListByOrderInnerNo>;
};

// 查询当前餐厅所有未完成主订单，并补充该 order_inner_no 下的完整订单列表
const getUncompleteOrders = (): Array<UncompleteOrder> => {
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const db = getDB();
  const masterOrders = db
    .prepare(
      `
        SELECT
          fo.*,
          rt.name AS table_name,
          rt.table_uuid AS table_uuid
        FROM food_order fo
        LEFT JOIN restaurant_table rt
          ON rt.id = fo.table_id
          AND rt.restaurant_id = fo.restaurant_id
        WHERE fo.restaurant_id = @restaurant_id
          AND fo.order_type = @order_type
          AND fo.order_status NOT IN (@completed_status, @cancel_status)
          AND fo.payment_status != @refunded_status
        ORDER BY datetime(fo.create_time) DESC, fo.id DESC
      `,
    )
    .all({
      restaurant_id: restaurantId,
      order_type: ORDER_TYPE.MASTER,
      completed_status: ORDER_STATUS.COMPLETED,
      cancel_status: ORDER_STATUS.CANCEL,
      // 已退款订单已经到达订单流转末尾，不再进入 pending orders。
      refunded_status: PAYMENT_STATUS.REFUNDED,
    }) as Array<
    FoodOrderRecord & {
      table_name: string | null;
      table_uuid: string | null;
    }
  >;

  return masterOrders.map((masterOrder) => {
    const orderList = getOrderListByOrderInnerNo(masterOrder.order_inner_no);
    // 小计为该 order_inner_no 下所有菜品的价格合计，不包含服务费
    const subTotalAmount = orderList.reduce((orderSum, order) => {
      const productTotal = order.product_list.reduce((productSum, product) => {
        return productSum + Number(product.count ?? 0) * Number(product.price ?? 0);
      }, 0);

      return orderSum + productTotal;
    }, 0);
    const groupAmounts = getActiveOrderGroupAmountSummary(db, masterOrder.order_inner_no, restaurantId);
    // 总计沿用 BillOut 金额逻辑：小计 - 折扣 + 整组服务费/打包费；pending orders 暂无折扣，按 0 处理。
    const totalAmount = subTotalAmount + groupAmounts.serviceFee + groupAmounts.packageFee;

    return {
      ...masterOrder,
      table_name: masterOrder.table_name ?? null,
      table_uuid: masterOrder.table_uuid ?? null,
      total_amount: totalAmount,
      amount: totalAmount,
      sub_total_amount: subTotalAmount,
      order_list: orderList,
    };
  });
};

const getUncompleteOrderCount = (): number => {
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const row = getDB()
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM food_order
        WHERE restaurant_id = @restaurant_id
          AND order_type = @order_type
          AND order_status NOT IN (@completed_status, @cancel_status)
          AND payment_status != @refunded_status
      `,
    )
    .get({
      restaurant_id: restaurantId,
      order_type: ORDER_TYPE.MASTER,
      completed_status: ORDER_STATUS.COMPLETED,
      cancel_status: ORDER_STATUS.CANCEL,
      // 未完成订单角标与 pending orders 弹窗保持一致，排除已退款订单。
      refunded_status: PAYMENT_STATUS.REFUNDED,
    }) as { count: number } | undefined;

  return Number(row?.count ?? 0);
};

// 查询当前桌台未支付/支付失败且未完成的主订单，用于空购物车时直接进入结账页。
const getPendingOrderByTable = (params: GetPendingOrderByTableParams): FoodOrderRecord | null => {
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  if (params.table_id === undefined || params.table_id === null || params.table_id === "") {
    throw new Error("table_id is required.");
  }

  const pendingOrder = getDB()
    .prepare(
      `
        SELECT *
        FROM food_order
        WHERE restaurant_id = @restaurant_id
          AND table_id = @table_id
          AND order_status IN (@processing_status, @received_status)
          AND payment_status IN (@unpay_status, @failed_status)
          AND order_type = @order_type
        ORDER BY id DESC
        LIMIT 1
      `,
    )
    .get({
      restaurant_id: restaurantId,
      table_id: Number(params.table_id),
      processing_status: ORDER_STATUS.PROCESSING,
      received_status: ORDER_STATUS.RECEIVED,
      unpay_status: PAYMENT_STATUS.UNPAY,
      failed_status: PAYMENT_STATUS.FAILED,
      order_type: ORDER_TYPE.MASTER,
    }) as FoodOrderRecord | undefined;

  return pendingOrder ?? null;
};

// 获取订单列表
const getOrderList = (params: orderListReqParams): OrderListRes => {
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const { page, size } = params;
  const offset = (page - 1) * size;
  // 线下订单列表必须按当前登录餐厅隔离，避免跨餐厅看到历史同步订单。
  const whereConditions: string[] = ["fo.restaurant_id = @restaurant_id", "fo.order_type = @order_type"];
  const sqlParams: Record<string, number | string> = {
    restaurant_id: restaurantId,
    limit: size + 1,
    offset,
    order_type: ORDER_TYPE.MASTER,
    pay_success_status: PAYMENT_STATUS.PAY_SUCCESS,
    final_payment_status: 1,
    cancel_order_status: ORDER_STATUS.CANCEL,
  };

  if (params.status !== undefined && params.status !== null && params.status !== "") {
    whereConditions.push("fo.order_status = @status");
    sqlParams.status = Number(params.status);
  }

  if (params.refund_status) {
    // 退款筛选依据支付状态，不能使用不存在的 order_status 特殊值。
    whereConditions.push("fo.payment_status = @refunded_status");
    sqlParams.refunded_status = PAYMENT_STATUS.REFUNDED;
  }

  const tableNameFilter =
    params.table_name !== undefined && params.table_name !== null ? String(params.table_name).trim() : "";
  if (tableNameFilter) {
    // 桌名筛选来自右上角输入框，按补齐后的桌台名称做模糊匹配。
    whereConditions.push("rt.name LIKE @table_name ESCAPE '\\'");
    sqlParams.table_name = `%${escapeSqlLike(tableNameFilter)}%`;
  }

  if (params.start_time) {
    whereConditions.push("datetime(fo.create_time) >= datetime(@start_time)");
    sqlParams.start_time = params.start_time;
  }

  if (params.end_time) {
    whereConditions.push("datetime(fo.create_time) <= datetime(@end_time)");
    sqlParams.end_time = params.end_time;
  }

  const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const rows = getDB()
    .prepare(
      `
        -- 卡片金额与右侧详情保持一致：已支付取最终成功支付单实付金额，其余回退订单总额。
        SELECT
          fo.*,
          COALESCE(
            (
              SELECT op.real_amount
              FROM order_payment op
              WHERE op.order_inner_no = fo.order_inner_no
                AND op.restaurant_id = fo.restaurant_id
                AND op.final_payment_status = @final_payment_status
                AND op.transaction_status = @pay_success_status
              ORDER BY datetime(op.transaction_return_time) ASC, datetime(op.create_time) ASC, op.id ASC
              LIMIT 1
            ),
            (
              SELECT
                CASE
                  WHEN COUNT(ods.id) > 0 THEN
                    COALESCE(SUM(ods.sku_price * ods.product_count), 0)
                    + COALESCE(
                        (
                          SELECT SUM(group_fee_order.service_fee)
                          FROM food_order group_fee_order
                          WHERE group_fee_order.order_inner_no = fo.order_inner_no
                            AND group_fee_order.restaurant_id = fo.restaurant_id
                            AND group_fee_order.order_status != @cancel_order_status
                        ),
                        0
                      )
                    + COALESCE(
                        (
                          SELECT SUM(group_fee_order.package_fee)
                          FROM food_order group_fee_order
                          WHERE group_fee_order.order_inner_no = fo.order_inner_no
                            AND group_fee_order.restaurant_id = fo.restaurant_id
                            AND group_fee_order.order_status != @cancel_order_status
                        ),
                        0
                      )
                  ELSE NULL
                END
              FROM food_order group_order
              INNER JOIN order_detail od
                ON od.order_id = group_order.id
               AND od.detail_type = 1
              INNER JOIN order_detail_snap ods
                ON ods.order_detail_id = od.id
              WHERE group_order.order_inner_no = fo.order_inner_no
                AND group_order.restaurant_id = fo.restaurant_id
                AND group_order.order_status != @cancel_order_status
            ),
            fo.total_amount,
            0
          ) AS amount,
          rt.name AS table_name
        FROM food_order fo
        LEFT JOIN restaurant_table rt
          ON rt.id = fo.table_id
         AND rt.restaurant_id = fo.restaurant_id
        ${whereSql}
        ORDER BY datetime(fo.create_time) DESC, fo.id DESC
        LIMIT @limit OFFSET @offset
      `,
    )
    .all(sqlParams) as Array<OrderListItem>;

  return {
    list: rows.slice(0, size),
    hasMore: rows.length > size,
  };
};

// 根据桌台和下单时间查询当前餐厅可取消订单
const getCancellableOrdersByTable = (params: CancellableOrdersByTableReqParams): CancellableOrdersByTableRes => {
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  if (params.table_id === undefined || params.table_id === null || params.table_id === "") {
    throw new Error("table_id is required.");
  }

  if (!params.order_create_time_start) {
    throw new Error("order_create_time_start is required.");
  }

  if (!params.order_create_time_end) {
    throw new Error("order_create_time_end is required.");
  }

  const db = getDB();
  const tableInfo = db
    .prepare(
      `
        SELECT name, table_uuid
        FROM restaurant_table
        WHERE id = @table_id
          AND restaurant_id = @restaurant_id
        LIMIT 1
      `,
    )
    .get({
      restaurant_id: restaurantId,
      table_id: Number(params.table_id),
    }) as { name: string | null; table_uuid: string | null } | undefined;

  const rows = db
    .prepare(
      `
        SELECT order_inner_no
        FROM food_order
        WHERE restaurant_id = @restaurant_id
          AND table_id = @table_id
          AND order_status IN (@processing_status, @received_status)
          AND payment_status IN (@unpay_status, @failed_status)
          AND datetime(create_time) >= datetime(@order_create_time_start)
          AND datetime(create_time) <= datetime(@order_create_time_end)
        GROUP BY order_inner_no
        ORDER BY MAX(datetime(create_time)) DESC, MAX(id) DESC
      `,
    )
    .all({
      restaurant_id: restaurantId,
      table_id: Number(params.table_id),
      processing_status: ORDER_STATUS.PROCESSING,
      received_status: ORDER_STATUS.RECEIVED,
      unpay_status: PAYMENT_STATUS.UNPAY,
      failed_status: PAYMENT_STATUS.FAILED,
      order_create_time_start: params.order_create_time_start,
      order_create_time_end: params.order_create_time_end,
    }) as Array<Pick<FoodOrderRecord, "order_inner_no">>;

  const list = rows
    .map((row): CancellableOrderGroup | null => {
      const orderList = getOrderListByOrderInnerNo(row.order_inner_no);
      const foodOrderList = getSelectOrderListByOrderInnerNoStmt().all({
        order_inner_no: row.order_inner_no,
      }) as FoodOrderRecord[];
      const masterOrder =
        foodOrderList.find((order) => order.order_type === ORDER_TYPE.MASTER) ??
        foodOrderList.slice().sort(sortOrdersByCreateTime)[0];

      if (!masterOrder) {
        return null;
      }

      const amount = orderList.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);

      return {
        table_name: tableInfo?.name ?? null,
        table_uuid: tableInfo?.table_uuid ?? null,
        order_inner_no: masterOrder.order_inner_no,
        order_serial_number: masterOrder.order_serial_number,
        transaction_id: null,
        channel_transaction_no: null,
        payment_channel: null,
        payment_channel_name: null,
        payment_time: null,
        create_time: masterOrder.create_time,
        expiration_time: null,
        order_list: orderList,
        payable: true,
        edit_remark: masterOrder.edit_remark ?? null,
        discount_amount: null,
        amount,
        sub_total_amount: null,
        discount_number: null,
        tax_info: null,
        order_channel: masterOrder.order_channel,
        take_food_no: masterOrder.take_food_no,
        customer_dining_style: masterOrder.customer_dining_style,
        waiter_name: null,
        receipt_no: null,
        refund_receipt_no: null,
        refund_serial_no: null,
        refund_transaction_id: null,
        refund_remark: null,
        coupon_code: masterOrder.coupon_code,
        coupon_amount: masterOrder.coupon_amount,
        coupon_name: null,
        coupon_batch_no: null,
        country_time_zone_code: "GMT+8",
        discounter_name: null,
        discount_validity_period: null,
        channel_reference_no: null,
        discounter_serial_no: null,
        discount_type: null,
        discount_nos: null,
        user_phone: null,
        user_name: null,
        user_photo_url: null,
        user_no: masterOrder.user_no,
        user_email: null,
        surcharge: null,
        order_app: masterOrder.order_app,
        device_no: masterOrder.device_no,
      };
    })
    .filter((orderGroup): orderGroup is CancellableOrderGroup => Boolean(orderGroup));

  return {
    list,
    hasMore: false,
  };
};

// 根据订单内部号查询可取消订单详情
const getCancellableOrderDetail = (orderInnerNo: string): CancellableOrderDetailRes => {
  if (!orderInnerNo) {
    throw new Error("order_inner_no is required.");
  }

  const orderList = getOrderListByOrderInnerNo(orderInnerNo);
  const subTotal = orderList.reduce((sum, order) => sum + Number(order.product_amount ?? 0), 0);
  const total = orderList.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);

  return {
    order_inner_no: orderInnerNo,
    order_list: orderList,
    sub_total: subTotal,
    total,
  };
};

type ProductItem = {
  order_detail_id: number;
  option: string | null;
  price: number;
  product_name: string;
  quantity: number;
  total_amount: number;
};
type OrderDetailPaymentInfo = Omit<OrderPaymentRecord, "transaction_id"> & {
  transaction_id: string[];
  channel_transaction_id: string | null;
  payment_channel_name: string | null;
};
type OrderDetailResp = FoodOrderRecord & {
  table_name: string | null;
  tax_info: OrderPaymentTaxRecord | null;
  payment_info_list: Array<OrderDetailPaymentInfo>;
  coupon_snapshot_list: Array<OrderCouponSnapshotRecord>;
  items: Array<ProductItem>;
  sub_total_amount: number;
  amount: number;
  real_amount: number | null;
  discount_amount: number | null;
  discount_number: number | null;
  discount_nos: string[] | null;
  discount_type: number | null;
  discounter_name: string | null;
  discount_validity_period: string | null;
  channel_reference_no: string | null;
  discounter_serial_no: string | null;
  surcharge: number | null;
  coupon_name: string | null;
  coupon_batch_no: string | null;
  coupon_code: string | null;
  user_name: string | null;
  user_no: string | null;
  user_phone: string | null;
  user_email: string | null;
};

type OrderCouponSnapshotRecord = {
  id?: number;
  related_order: string;
  coupon_name: string | null;
  coupon_batch_no: string | null;
  coupon_code: string | null;
  coupon_amount: number;
  user_no: string | null;
  user_name: string | null;
  create_time?: string;
  update_time?: string | null;
};

const parseDiscountNos = (value: string | null | undefined): string[] | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // 兼容历史本地数据：如果不是 JSON 数组，就按单个证件号展示。
  }

  return [value];
};

const parseSystemTransactionNos = (value: string | null | undefined): string[] => {
  if (!value) return [];

  // 系统交易号在数据库中是逗号拼接的文本，详情接口统一返回去空白后的字符串数组。
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const getOrderCouponSnapshotsByRelatedOrder = (relatedOrder: string): Array<OrderCouponSnapshotRecord> => {
  if (!relatedOrder) return [];

  return getDB()
    .prepare(
      `
        SELECT *
        FROM order_coupon_snapshot
        WHERE related_order = @related_order
        ORDER BY id ASC
      `,
    )
    .all({
      related_order: relatedOrder,
    }) as Array<OrderCouponSnapshotRecord>;
};

// 通过order inner no获取订单详情
const getOrderDetailByInnerNo = (orderInnerNo: string): OrderDetailResp | null => {
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const db = getDB();
  const foodOrder = db
    .prepare(
      `
        SELECT fo.*, rt.name AS table_name
        FROM food_order fo
        LEFT JOIN restaurant_table rt
          ON rt.id = fo.table_id
         AND rt.restaurant_id = fo.restaurant_id
        WHERE fo.order_inner_no = @order_inner_no
          AND fo.restaurant_id = @restaurant_id
          AND fo.order_type = @order_type
        LIMIT 1
      `,
    )
    .get({
      order_inner_no: orderInnerNo,
      // 详情入口跟随列表做餐厅隔离，防止直接传入其他餐厅 order_inner_no。
      restaurant_id: restaurantId,
      order_type: ORDER_TYPE.MASTER,
    }) as (FoodOrderRecord & { table_name: string | null }) | undefined;

  if (!foodOrder) {
    return null;
  }

  // Offline Orders 以 order_inner_no 为整单边界，详情需要同时展示主单与全部有效加菜单。
  const orderDetailSnapList = getActiveOrderGroupDetailSnaps(db, orderInnerNo, restaurantId);

  const items = orderDetailSnapList.map((detailSnap) => {
    const price = Number(detailSnap.sku_price ?? 0);
    const quantity = Number(detailSnap.product_count ?? 0);
    const productName = detailSnap.product_name?.trim() ?? "";
    const skuName = detailSnap.sku_name?.trim() ?? "";
    // 数据库继续保存后端 camelCase 快照，仅在详情响应边界转换成现有 UI 使用的 snake_case。
    const optionList = normalizeOptionItemJsonForLocal(parseJson<Array<unknown>>(detailSnap.option_item_json, []));
    // 非多规格或规格名与产品名相同时无需重复展示，只有多规格且名称不同时才补充规格名。
    const displayName =
      Number(detailSnap.variant) === 1 && skuName && skuName !== productName
        ? `${productName}(${skuName})`
        : productName;

    return {
      order_detail_id: detailSnap.order_detail_id,
      option: JSON.stringify(optionList),
      price,
      product_name: displayName,
      quantity,
      total_amount: price * quantity,
    };
  });
  const subTotalAmount = items.reduce((sum, item) => sum + Number(item.total_amount ?? 0), 0);
  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);

  const paymentInfoList = db
    .prepare(
      `
        SELECT
          op.*,
          COALESCE(
            (
              SELECT pc.name
              FROM payment_channel pc
              WHERE pc.code = op.channel_code
                AND pc.restaurant_id = op.restaurant_id
                AND pc.del_status = 1
              ORDER BY pc.type DESC, pc.id DESC
              LIMIT 1
            ),
            (
              SELECT pc.name
              FROM payment_channel pc
              WHERE pc.code = op.channel_code
                AND pc.restaurant_id = 0
                AND pc.del_status = 1
              ORDER BY pc.type DESC, pc.id DESC
              LIMIT 1
            )
          ) AS payment_channel_name
        FROM order_payment op
        WHERE op.order_inner_no = @order_inner_no
          AND final_payment_status = 1
        ORDER BY datetime(op.transaction_return_time) ASC, datetime(op.create_time) ASC, op.id ASC
      `,
    )
    .all({
      order_inner_no: orderInnerNo,
    }) as Array<OrderPaymentRecord & { payment_channel_name: string | null }>;

  const successPayment = paymentInfoList.find(
    (paymentInfo) => paymentInfo.transaction_status === PAYMENT_STATUS.PAY_SUCCESS,
  );

  const paymentExtraInfo = successPayment
    ? (db
        .prepare(
          `
            SELECT channel_reference_no
            FROM order_payment_info
            WHERE order_payment_id = @order_payment_id
            LIMIT 1
          `,
        )
        .get({
          order_payment_id: successPayment.id,
        }) as { channel_reference_no: string | null } | undefined)
    : null;

  const taxInfo = successPayment
    ? (db
        .prepare(
          `
            SELECT *
            FROM order_payment_tax
            WHERE order_payment_id = @order_payment_id
            LIMIT 1
          `,
        )
        .get({
          order_payment_id: successPayment.id,
        }) as OrderPaymentTaxRecord | undefined)
    : null;
  const normalizedTaxInfo = taxInfo
    ? {
        ...taxInfo,
        // 兼容修复前本地 CASH 漏写的 NULL；PWD/SC 的 Less VAT 与 VAT exemption 同口径。
        pwd_discount:
          taxInfo.pwd_discount ??
          (isPwdScDiscountType(successPayment?.discount_type) ? successPayment?.discount_amount : null),
        less_vat: taxInfo.less_vat ?? (isPwdScDiscountType(successPayment?.discount_type) ? taxInfo.vat_exemption : 0),
      }
    : null;
  const couponSnapshotList = getOrderCouponSnapshotsByRelatedOrder(orderInnerNo);
  const firstCouponSnapshot = couponSnapshotList[0];
  // 对齐后端字段语义：Transaction ID 使用系统交易号，原支付渠道交易号单独保留。
  const detailPaymentInfoList = paymentInfoList.map((paymentInfo) => ({
    ...paymentInfo,
    channel_transaction_id: paymentInfo.transaction_id,
    transaction_id: parseSystemTransactionNos(paymentInfo.system_transaction_no),
  }));
  const groupAmounts = getActiveOrderGroupAmountSummary(db, orderInnerNo, restaurantId);
  // 支付快照是整单最终金额口径；历史未支付订单则汇总所有有效主单/加菜单金额。
  const serviceFee = Number(successPayment?.real_service_fee ?? groupAmounts.serviceFee);
  const taxAmount = Number(successPayment?.real_tax_amount ?? groupAmounts.taxAmount);
  const groupedTotalAmount = subTotalAmount + serviceFee + groupAmounts.packageFee;

  return {
    ...foodOrder,
    items,
    total_count: itemCount,
    total_amount: groupedTotalAmount,
    service_fee: serviceFee,
    tax_amount: taxAmount,
    package_fee: groupAmounts.packageFee,
    // 对齐后端 cashier/order/detail：已支付订单的金额和折扣信息来自最终支付单。
    sub_total_amount: subTotalAmount,
    amount: Number(successPayment?.real_amount ?? groupedTotalAmount),
    real_amount: successPayment?.real_amount ?? null,
    discount_amount:
      successPayment?.discount_amount ?? normalizedTaxInfo?.promo_discount ?? normalizedTaxInfo?.pwd_discount ?? null,
    discount_number: successPayment?.discount_number ?? null,
    discount_nos: parseDiscountNos(successPayment?.discount_no),
    discount_type: successPayment?.discount_type ?? null,
    discounter_name: successPayment?.discounter_name ?? null,
    discount_validity_period: successPayment?.discount_validity_period ?? null,
    discounter_serial_no: successPayment?.discount_serial_no ?? null,
    channel_reference_no: paymentExtraInfo?.channel_reference_no ?? null,
    surcharge: successPayment?.surcharge ?? 0,
    coupon_amount: successPayment?.coupon_amount ?? foodOrder.coupon_amount,
    coupon_name: firstCouponSnapshot?.coupon_name ?? null,
    coupon_batch_no: firstCouponSnapshot?.coupon_batch_no ?? null,
    coupon_code: firstCouponSnapshot?.coupon_code ?? foodOrder.coupon_code,
    user_no: firstCouponSnapshot?.user_no || foodOrder.user_no || successPayment?.user_no || "",
    user_name: firstCouponSnapshot?.user_name ?? null,
    user_phone: null,
    user_email: null,
    coupon_snapshot_list: couponSnapshotList,
    payment_info_list: detailPaymentInfoList,
    tax_info: normalizedTaxInfo,
  };
};

type OrderHistoryResp = {
  country_time_zone_code: string | null;
  create_time: string;
  remark: string | null;
  waiter_name: string | null;
};

// View Digital Copy IPC 入参，preview_type 对齐后端 ReportTypeEnum。
type ViewDigitalCopyReq = {
  order_inner_no: string;
  preview_type?: number;
};

// 查询后端同步来的小票打印快照，优先用于还原服务器预览效果。
const getPaymentPreviewPrintInfo = (
  restaurantId: number,
  foodOrder: FoodOrderRecord,
): FoodOrderPrintInfoRecord | null => {
  const db = getDB();

  // 后端预览优先读取 food_order_print_info 的支付/全部打印快照。
  return (
    (db
      .prepare(
        `
          SELECT *
          FROM food_order_print_info
          WHERE restaurant_id = @restaurant_id
            AND (
              order_no = @order_inner_no
              OR order_no = @order_no
            )
            AND print_type IN (2, 4)
          ORDER BY
            CASE WHEN order_no = @order_inner_no THEN 0 ELSE 1 END,
            update_time DESC,
            id DESC
          LIMIT 1
        `,
      )
      .get({
        restaurant_id: restaurantId,
        order_inner_no: foodOrder.order_inner_no,
        order_no: foodOrder.order_no,
      }) as FoodOrderPrintInfoRecord | undefined) ?? null
  );
};

// View Digital Copy：本地复刻后端 /order-print/preview 的支付小票预览返回。
const viewDigitalCopy = (req: ViewDigitalCopyReq): string => {
  if (!req?.order_inner_no) {
    throw new Error("order_inner_no is required.");
  }

  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const db = getDB();
  // 预览只允许访问当前餐厅的主订单，避免跨餐厅 order_inner_no 取数。
  const foodOrder = db
    .prepare(
      `
        SELECT *
        FROM food_order
        WHERE restaurant_id = @restaurant_id
          AND order_inner_no = @order_inner_no
          AND order_type = @order_type
        LIMIT 1
      `,
    )
    .get({
      restaurant_id: restaurantId,
      order_inner_no: req.order_inner_no,
      order_type: ORDER_TYPE.MASTER,
    }) as FoodOrderRecord | undefined;

  if (!foodOrder) {
    throw new Error("Order information not found.");
  }

  if (foodOrder.payment_status === PAYMENT_STATUS.UNPAY && foodOrder.order_status !== ORDER_STATUS.CANCEL) {
    throw new Error("The order is not paid.");
  }

  // Digital Copy 是整单支付/退款凭证，必须包含主单和所有有效加菜单。
  const detailSnaps = getActiveOrderGroupDetailSnaps(db, foodOrder.order_inner_no, restaurantId);

  // 取最终支付单；优先支付成功记录，退款预览仍需要原支付信息。
  const payment =
    (db
      .prepare(
        `
          SELECT *
          FROM order_payment
          WHERE order_inner_no = @order_inner_no
            AND final_payment_status = 1
          ORDER BY
            CASE WHEN transaction_status = @paid_status THEN 0 ELSE 1 END,
            update_time DESC,
            id DESC
          LIMIT 1
        `,
      )
      .get({
        order_inner_no: foodOrder.order_inner_no,
        paid_status: PAYMENT_STATUS.PAY_SUCCESS,
      }) as OrderPaymentRecord | undefined) ?? null;

  const taxInfo = payment
    ? ((db
        .prepare(
          `
            SELECT *
            FROM order_payment_tax
            WHERE order_payment_id = @order_payment_id
            LIMIT 1
          `,
        )
        .get({
          order_payment_id: payment.id,
        }) as OrderPaymentTaxRecord | undefined) ?? null)
    : null;

  const restaurant =
    (db.prepare("SELECT * FROM restaurant WHERE id = @restaurant_id LIMIT 1").get({
      restaurant_id: restaurantId,
    }) as RestaurantRecord | undefined) ?? null;

  const restaurantSetting =
    (db.prepare("SELECT * FROM restaurant_setting WHERE restaurant_id = @restaurant_id LIMIT 1").get({
      restaurant_id: restaurantId,
    }) as RestaurantSettingRecord | undefined) ?? null;
  const operationConfig = getApprovedOperationConfigByRestaurantId(db, restaurantId);

  const groupedFoodOrder = buildOrderGroupFoodOrder(foodOrder, detailSnaps, payment);

  return generateDigitalCopyPreview(
    {
      foodOrder: groupedFoodOrder,
      detailSnaps,
      payment,
      taxInfo,
      restaurant,
      restaurantSetting,
      operationConfig,
      paymentChannelName: getPaymentChannelDisplayName(db, payment),
      printInfo: getPaymentPreviewPrintInfo(restaurantId, foodOrder),
    },
    req.preview_type,
  );
};

// 打印订单小票：返回在线打印消息同构的 print_info，并更新本地打印 ID、次数和状态。

// 餐前 BillOut 尚未创建 food_order 时，直接把页面账单快照转换为现有 Bill 小票打印消息。

// E-Journal 下载只复用订单小票排版文本，不改变打印 ID、打印次数和订单打印状态。
const buildOrderReceiptTextForEJournal = (req: PrintReceiptReq): string => {
  if (!req?.order_inner_no) {
    throw new Error("order_inner_no is required.");
  }

  const db = getDB();
  const now = formatPrintTime();
  const { foodOrder, printInfo } = getReceiptPrintInfoByInnerNo(db, req.order_inner_no);
  const successPayment =
    (getSelectSuccessfulOrderPaymentByOrderInnerNoStmt().get({
      order_inner_no: foodOrder.order_inner_no,
    }) as OrderPaymentRecord | undefined) ?? null;
  const successPaymentTax = successPayment
    ? ((getSelectOrderPaymentTaxByOrderPaymentIdStmt().get({
        order_payment_id: successPayment.id,
      }) as OrderPaymentTaxRecord | undefined) ?? null)
    : null;
  const originalPrintOrder = mergePaymentTaxInfoIntoPrintOrder(
    mergePaymentChannelInfoIntoPrintOrder(
      db,
      mergePaymentDiscountInfoIntoPrintOrder(
        mergeOperationConfigIntoPrintOrder(
          parseRequiredPrintOrder(printInfo),
          getApprovedOperationConfigByRestaurantId(db, foodOrder.restaurant_id),
        ),
        successPayment,
      ),
      successPayment,
    ),
    successPaymentTax,
  );
  const groupedPrintOrder = mergeOrderGroupItemsIntoPrintOrder(db, originalPrintOrder, foodOrder);
  const printableOrder = mergeCurrentQueuePickupInfoIntoPrintOrder(
    preparePrintOrderForReceipt(groupedPrintOrder, printInfo, req.receipt_type, now, req.print_source),
    foodOrder,
  );
  return generateReceiptTextByType(printableOrder, req.receipt_type);
};

// 查询订单历史
const getOrderHistory = (orderInnerNo: string): Array<OrderHistoryResp> => {
  const country = queryCurrentContry();
  const countryTimeZoneCode = country?.time_zone_code ?? null;

  const orderHistoryList = getDB()
    .prepare(
      `
        SELECT
          create_time,
          remark,
          operator_name AS waiter_name
        FROM order_status_change
        WHERE order_inner_no = @order_inner_no
        ORDER BY datetime(create_time) DESC, id DESC
      `,
    )
    .all({
      order_inner_no: orderInnerNo,
    }) as Array<Omit<OrderHistoryResp, "country_time_zone_code">>;

  return orderHistoryList.map((history) => ({
    ...history,
    country_time_zone_code: countryTimeZoneCode,
  }));
};

type OrderRefundReq = {
  order_inner_no: string;
  refund_remark?: string;
};

// 订单退款操作
const orderRefund = (req: OrderRefundReq) => {
  const { user } = getCurrentSession();
  const db = getDB();
  const orderRefundTx = db.transaction((txReq: OrderRefundReq) => {
    const masterOrder = getMasterOrderByOrderInnerNo(txReq.order_inner_no);

    if (!masterOrder) {
      throw new Error(`退款失败：未找到 order_inner_no=${txReq.order_inner_no} 对应的主订单`);
    }

    if (masterOrder.payment_status === PAYMENT_STATUS.REFUNDED) {
      throw new Error("当前订单已退款");
    }

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    if ([PAYMENT_STATUS.REFUNDING, PAYMENT_STATUS.REFUND_PENDING].includes(Number(masterOrder.payment_status))) {
      throw new Error("The current order is being refunded!");
    }

    if (![PAYMENT_STATUS.PAY_SUCCESS, PAYMENT_STATUS.REFUND_FAILED].includes(Number(masterOrder.payment_status))) {
      throw new Error("payment is not available before payment!");
    }

    const refundSerialNo = nextLocalRefundSerialNo(masterOrder.restaurant_id, db);
    const mchOrderId = construcMchOrderId();
    const basePayment = getSelectSuccessfulOrderPaymentByOrderInnerNoStmt().get({
      order_inner_no: txReq.order_inner_no,
    }) as OrderPaymentRecord | undefined;

    if (!basePayment) {
      throw new Error(`退款失败：未找到 order_inner_no=${txReq.order_inner_no} 对应的已支付订单`);
    }

    // 新增一条order payment逆向退款数据
    const refundPaymentParams = buildSqlParams(
      {
        ...basePayment,
        mch_order_id: mchOrderId,
        transaction_status: PAYMENT_STATUS.REFUNDED,
        final_payment_status: 1,
        transaction_return_time: now,
        create_time: now,
        update_time: now,
        waiter_id: user.id,
        refund_remark: txReq.refund_remark ?? "",
        refund_serial_no: refundSerialNo,
        // 退款保留原支付 SI 用于 ORIG.SI#，只由独立 refund_serial_no 序列取新号。
        receipt_no: basePayment.receipt_no,
      },
      [
        "restaurant_id",
        "restaurant_user_id",
        "user_no",
        "order_inner_no",
        "mch_order_id",
        "transaction_id",
        "amount",
        "transaction_status",
        "pay_product_type",
        "channel_code",
        "payment_platform",
        "final_payment_status",
        "transaction_create_time",
        "transaction_return_time",
        "create_time",
        "update_time",
        "real_amount",
        "discount_number",
        "discount_no",
        "discount_type",
        "real_tax_amount",
        "real_service_fee",
        "system_transaction_no",
        "refund_serial_no",
        "coupon_amount",
        "cash_receipt_amount",
        "refund_remark",
        "discounter_name",
        "discount_validity_period",
        "discount_serial_no",
        "discount_amount",
        "receipt_no",
        "waiter_id",
        "real_customer_num",
        "surcharge",
        "promo_discount_type",
      ],
      {},
    );

    const refundPaymentResult = getCreateOrderPaymentStmt().run(refundPaymentParams);
    const refundPaymentId = Number(refundPaymentResult.lastInsertRowid);

    // 如果有税费记录，那么新插入一条相同的税费记录，只是将order payment id指向新的退款订单
    const paymentTaxRecord = getSelectOrderPaymentTaxByOrderPaymentIdStmt().get({
      order_payment_id: basePayment.id,
    }) as OrderPaymentTaxRecord | undefined;

    let refundPaymentTaxId: number | null = null;

    if (paymentTaxRecord) {
      const refundPaymentTaxParams = buildSqlParams(
        {
          ...paymentTaxRecord,
          order_payment_id: refundPaymentId,
          create_time: now,
          update_time: now,
        },
        [
          "order_payment_id",
          "vatable_sales",
          "tax_amount",
          "vat_exempt_sales",
          "vat_exemption",
          "zero_rated_sales",
          "create_time",
          "update_time",
          "pwd_discount",
          "less_vat",
          "promo_discount",
          "vat_register_status",
        ],
        {
          create_time: now,
          update_time: now,
        },
      );

      const refundPaymentTaxResult = getCreateOrderPaymentTaxStmt().run(refundPaymentTaxParams);
      refundPaymentTaxId = Number(refundPaymentTaxResult.lastInsertRowid);
    }

    // 更新food orderd的主订单字段
    getUpdateFoodOrderRefundStatusStmt().run({
      order_inner_no: txReq.order_inner_no,
      complete_status: ORDER_STATUS.COMPLETED,
      payment_status: PAYMENT_STATUS.REFUNDED,
      refund_time: now,
      refund_payment_id: refundPaymentId,
      refund_waiter_no: user.waiter_no,
      update_time: now,
    });

    // 向 order_status_change 写入退款状态流水。
    // 本地退款立即成功，但状态流水仍按后端顺序保留“发起退款”和“退款成功”。
    const orderStatusChangeIds = [ORDER_CHANGE_STATUS.INITIATE_A_REFUND, ORDER_CHANGE_STATUS.REFUND_SUCCESSFUL].map(
      (status) => {
        const orderStatusChangeParams = buildSqlParams(
          {
            order_inner_no: txReq.order_inner_no,
            status_type: masterOrder.order_channel,
            status,
            display_type: 1,
            operator_id: user.id,
            remark: statusChangeRemark.get(status) ?? "",
            create_time: now,
            order_no: masterOrder.order_no,
            operator_name: user.name,
          },
          [
            "order_inner_no",
            "status_type",
            "status",
            "display_type",
            "operator_id",
            "remark",
            "create_time",
            "order_no",
            "operator_name",
          ],
          {
            display_type: 1,
          },
        );

        const orderStatusChangeResult = getCreateOrderStatusChangeStmt().run(orderStatusChangeParams);
        return Number(orderStatusChangeResult.lastInsertRowid);
      },
    );

    insertCurrentWaiterClockOrder({
      restaurantId: user.restaurant_id,
      waiterId: user.id,
      waiterNo: user.waiter_no,
      orderInnerNo: txReq.order_inner_no,
      recordOrderType: CLOCK_ORDER_TYPE.REFUND_ORDER,
    });

    const refundPayment = selectRowsByIds<OrderPaymentRecord>(db, "order_payment", [refundPaymentId])[0] ?? null;

    // 退款只补充退款流水信息，保留原支付小票主体，和后端 updatePaymentPrintInfo 的用途一致。
    refreshOrderPrintInfoSnapshotsByInnerNo(db, {
      orderInnerNo: txReq.order_inner_no,
      payment: basePayment,
      taxInfo: paymentTaxRecord ?? null,
      refundPayment,
      now,
    });

    return {
      order_inner_no: txReq.order_inner_no,
      refund_payment_id: refundPaymentId,
      refund_payment_tax_id: refundPaymentTaxId,
      order_status_change_ids: orderStatusChangeIds,
      refund_serial_no: refundSerialNo,
      mch_order_id: mchOrderId,
      // 退款是本机主动写入退款支付记录和订单状态，在线时需要推送服务器。
    };
  });

  return orderRefundTx.immediate(req);
};

type OrderCancelReq = {
  cancel_remark?: string;
  order_inner_no?: string;
  order_no?: string[];
};
// 订单取消操作
const orderCancel = (req: OrderCancelReq) => {
  const { user } = getCurrentSession();
  const db = getDB();
  const orderCancelTx = db.transaction((txReq: OrderCancelReq) => {
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const cancelRemark = txReq.cancel_remark ?? "";
    const orderNos = [...new Set(txReq.order_no ?? [])];

    if (!txReq.order_inner_no && orderNos.length === 0) {
      throw new Error("取消订单失败：缺少 order_inner_no 或 order_no");
    }

    // 如果是整单取消
    if (txReq.order_inner_no) {
      // 传 order_inner_no 代表整组订单全部取消，只给主订单写 cancel_remark。
      const allOrders = getSelectOrderListByOrderInnerNoStmt().all({
        order_inner_no: txReq.order_inner_no,
      }) as FoodOrderRecord[];

      if (allOrders.length === 0) {
        throw new Error(`取消订单失败：未找到 order_inner_no=${txReq.order_inner_no} 对应的订单`);
      }

      const masterOrder =
        allOrders.find((order) => order.order_type === ORDER_TYPE.MASTER) ??
        allOrders.slice().sort(sortOrdersByCreateTime)[0];

      updateFoodOrdersByOrderInnerNo(txReq.order_inner_no, {
        order_status: ORDER_STATUS.CANCEL,
        update_time: now,
      });

      if (masterOrder) {
        updateFoodOrdersByOrderNos([masterOrder.order_no], {
          cancel_remark: cancelRemark,
          update_time: now,
        });
      }

      updateOrderDetailsToCancelledByOrderIds(
        allOrders.map((order) => order.id),
        now,
      );

      const orderStatusChangeList = createOrderStatusChanges({
        order_inner_no: txReq.order_inner_no,
        order_status: ORDER_CHANGE_STATUS.DELIVERY_FAILED,
      });

      insertCurrentWaiterClockOrder({
        restaurantId: user.restaurant_id,
        waiterId: user.id,
        waiterNo: user.waiter_no,
        orderInnerNo: txReq.order_inner_no,
        recordOrderType: CLOCK_ORDER_TYPE.CANCEL_ORDER,
      });

      const updatedFoodOrders = getSelectOrderListByOrderInnerNoStmt().all({
        order_inner_no: txReq.order_inner_no,
      }) as FoodOrderRecord[];

      return {
        order_inner_no: txReq.order_inner_no,
        order_no: allOrders.map((order) => order.order_no),
      };
    }

    const targetOrders = getFoodOrdersByOrderNos(orderNos);
    if (targetOrders.length !== orderNos.length) {
      throw new Error("取消订单失败：部分 order_no 未找到对应订单");
    }

    const orderInnerNos = [...new Set(targetOrders.map((order) => order.order_inner_no))];
    if (orderInnerNos.length !== 1) {
      throw new Error("取消订单失败：order_no 必须属于同一个 order_inner_no");
    }

    const orderInnerNo = orderInnerNos[0];
    const allOrders = getSelectOrderListByOrderInnerNoStmt().all({
      order_inner_no: orderInnerNo,
    }) as FoodOrderRecord[];

    // 只有传入列表刚好覆盖该 order_inner_no 下全部订单时，才视为“整单取消”。
    const allOrderNoSet = new Set(allOrders.map((order) => order.order_no));
    const isCancellingAllOrders =
      allOrders.length === targetOrders.length && orderNos.every((orderNo) => allOrderNoSet.has(orderNo));

    const previousMasterOrder = allOrders.find((order) => order.order_type === ORDER_TYPE.MASTER) ?? null;
    const containsMasterOrder = targetOrders.some((order) => order.order_type === ORDER_TYPE.MASTER);

    if (containsMasterOrder && !isCancellingAllOrders) {
      // 部分取消命中了主订单时，先把它降级为加菜订单，后面再从剩余订单里补一个新的主订单。
      const masterOrderNos = targetOrders
        .filter((order) => order.order_type === ORDER_TYPE.MASTER)
        .map((order) => order.order_no);

      updateFoodOrdersByOrderNos(masterOrderNos, {
        order_type: ORDER_TYPE.SLAVE,
        update_time: now,
      });
    }

    updateFoodOrdersByOrderNos(orderNos, {
      order_status: ORDER_STATUS.CANCEL,
      cancel_remark: cancelRemark,
      update_time: now,
    });

    updateOrderDetailsToCancelledByOrderIds(
      targetOrders.map((order) => order.id),
      now,
    );

    if (!isCancellingAllOrders && containsMasterOrder && previousMasterOrder) {
      const targetOrderNoSet = new Set(orderNos);
      const remainingOrders = allOrders.filter((order) => !targetOrderNoSet.has(order.order_no));
      const nextMasterOrder = pickNextMasterOrder(remainingOrders);

      if (nextMasterOrder) {
        // 保证同一个 order_inner_no 下在部分取消后仍然存在且只存在一个主订单。
        updateFoodOrdersByOrderNos([nextMasterOrder.order_no], {
          order_type: ORDER_TYPE.MASTER,
          update_time: now,
        });
      }
    }

    const orderStatusChangeList = isCancellingAllOrders
      ? createOrderStatusChanges({
          order_inner_no: orderInnerNo,
          order_status: ORDER_CHANGE_STATUS.DELIVERY_FAILED,
        })
      : createOrderStatusChanges({
          order_no: orderNos,
          order_status: ORDER_CHANGE_STATUS.DELIVERY_FAILED,
        });

    insertCurrentWaiterClockOrder({
      restaurantId: user.restaurant_id,
      waiterId: user.id,
      waiterNo: user.waiter_no,
      orderInnerNo,
      recordOrderType: CLOCK_ORDER_TYPE.CANCEL_ORDER,
    });

    const updatedFoodOrders = getSelectOrderListByOrderInnerNoStmt().all({
      order_inner_no: orderInnerNo,
    }) as FoodOrderRecord[];

    return {
      order_inner_no: orderInnerNo,
      order_no: orderNos,
      cancelled_all: isCancellingAllOrders,
    };
  });

  return orderCancelTx.immediate(req);
};

type OrderCompleteReq = {
  order_inner_no?: string;
};

type OrderStatusMutationReq = {
  order_inner_no?: string;
};

const getActiveOrdersByInnerNo = (orderInnerNo: string) => {
  const orderList = getSelectOrderListByOrderInnerNoStmt().all({
    order_inner_no: orderInnerNo,
  }) as FoodOrderRecord[];

  return orderList.filter((order) => order.order_status !== ORDER_STATUS.CANCEL);
};

const isPaidForOrderFlow = (paymentStatus: number | null | undefined) =>
  [PAYMENT_STATUS.PAY_SUCCESS, PAYMENT_STATUS.REFUND_FAILED].includes(Number(paymentStatus));

// 接单：对齐在线端 Take 操作，把未取消的待接单订单推进到已接单并写入状态流水。
const orderTake = (req: OrderStatusMutationReq) => {
  const db = getDB();
  const orderTakeTx = db.transaction((txReq: OrderStatusMutationReq) => {
    const orderInnerNo = txReq.order_inner_no;
    if (!orderInnerNo) {
      throw new Error("接单失败：缺少 order_inner_no");
    }

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const activeOrderList = getActiveOrdersByInnerNo(orderInnerNo);
    if (activeOrderList.length === 0) {
      throw new Error(`接单失败：未找到 order_inner_no=${orderInnerNo} 对应的订单`);
    }

    const masterOrder = activeOrderList.find((order) => order.order_type === ORDER_TYPE.MASTER) ?? activeOrderList[0];
    if ([PAYMENT_STATUS.REFUNDING, PAYMENT_STATUS.REFUND_PENDING].includes(Number(masterOrder.payment_status))) {
      throw new Error("The current order is being refunded!");
    }
    if (masterOrder.order_channel === ORDER_CHANNEL.QUEUE && !isPaidForOrderFlow(masterOrder.payment_status)) {
      // 排队点餐走 wait-order 流转，后端要求接单前必须已支付。
      throw new Error("payment is not available before payment!");
    }

    const pendingOrders = activeOrderList.filter((order) => order.order_status === ORDER_STATUS.PROCESSING);
    if (pendingOrders.length === 0) {
      throw new Error("Only pending orders can be taken.");
    }

    updateFoodOrdersByOrderNos(
      pendingOrders.map((order) => order.order_no),
      {
        order_status: ORDER_STATUS.RECEIVED,
        update_time: now,
      },
    );

    const orderStatusChangeList = createOrderStatusChanges({
      order_inner_no: orderInnerNo,
      order_status: ORDER_CHANGE_STATUS.ORDERS,
    });

    return {
      success: true,
      order_inner_no: orderInnerNo,
      order_status_change_id: orderStatusChangeList.map((item) => item.id),
    };
  });

  return orderTakeTx.immediate(req);
};

// 出餐：排队点餐已接单后进入待取餐状态，对齐在线端 Serve 操作。
const orderServe = (req: OrderStatusMutationReq) => {
  const db = getDB();
  const orderServeTx = db.transaction((txReq: OrderStatusMutationReq) => {
    const orderInnerNo = txReq.order_inner_no;
    if (!orderInnerNo) {
      throw new Error("出餐失败：缺少 order_inner_no");
    }

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const activeOrderList = getActiveOrdersByInnerNo(orderInnerNo);
    if (activeOrderList.length === 0) {
      throw new Error(`出餐失败：未找到 order_inner_no=${orderInnerNo} 对应的订单`);
    }

    // 排队点餐不会产生加菜订单，出餐只需要用当前订单组第一条活跃订单判断渠道。
    const queueOrder = activeOrderList[0];
    if (queueOrder.order_channel !== ORDER_CHANNEL.QUEUE) {
      throw new Error("Only queue orders can be served.");
    }
    if ([PAYMENT_STATUS.REFUNDING, PAYMENT_STATUS.REFUND_PENDING].includes(Number(queueOrder.payment_status))) {
      throw new Error("The current order is being refunded!");
    }
    if (!isPaidForOrderFlow(queueOrder.payment_status)) {
      // 排队点餐出餐前必须已支付，避免未支付订单进入待取餐。
      throw new Error("payment is not available before payment!");
    }

    const receivedOrders = activeOrderList.filter((order) => order.order_status === ORDER_STATUS.RECEIVED);
    if (receivedOrders.length === 0) {
      throw new Error("Only taken orders can be served.");
    }

    updateFoodOrdersByOrderNos(
      receivedOrders.map((order) => order.order_no),
      {
        order_status: ORDER_STATUS.AWAITING_PICKUP,
        update_time: now,
      },
    );

    const orderStatusChangeList = createOrderStatusChanges({
      order_inner_no: orderInnerNo,
      order_status: ORDER_CHANGE_STATUS.MEALS_TO_BE_SERVED,
    });

    return {
      success: true,
      order_inner_no: orderInnerNo,
      order_status_change_id: orderStatusChangeList.map((item) => item.id),
    };
  });

  return orderServeTx.immediate(req);
};

// 完成订单：桌台单按后端 complete 规则，排队单按在线端待取餐后完成规则。
const orderComplete = (req: OrderCompleteReq) => {
  const db = getDB();
  const orderCompleteTx = db.transaction((txReq: OrderCompleteReq) => {
    const orderInnerNo = txReq.order_inner_no;
    if (!orderInnerNo) {
      throw new Error("完成订单失败：缺少 order_inner_no");
    }

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const orderList = getSelectOrderListByOrderInnerNoStmt().all({
      order_inner_no: orderInnerNo,
    }) as FoodOrderRecord[];
    const activeOrderList = orderList.filter((order) => order.order_status !== ORDER_STATUS.CANCEL);

    if (activeOrderList.length === 0) {
      return {
        success: false,
        order_inner_no: orderInnerNo,
      };
    }

    const masterOrder = activeOrderList.find((order) => order.order_type === ORDER_TYPE.MASTER) ?? activeOrderList[0];
    const expectedCompleteStatus =
      masterOrder.order_channel === ORDER_CHANNEL.QUEUE ? ORDER_STATUS.AWAITING_PICKUP : ORDER_STATUS.RECEIVED;
    const uncompletableOrder = activeOrderList.find((order) => order.order_status !== expectedCompleteStatus);
    if (uncompletableOrder) {
      throw new Error(
        masterOrder.order_channel === ORDER_CHANNEL.QUEUE
          ? "Orders that are not in the status of [AWAITING_PICKUP] orders cannot be [COMPLETE]"
          : "Orders that are not in the status of [RECEIVED] orders cannot be [COMPLETE]",
      );
    }
    if ([PAYMENT_STATUS.REFUNDING, PAYMENT_STATUS.REFUND_PENDING].includes(Number(masterOrder.payment_status))) {
      throw new Error("The current order is being refunded!");
    }

    if (![PAYMENT_STATUS.PAY_SUCCESS, PAYMENT_STATUS.REFUND_FAILED].includes(Number(masterOrder.payment_status))) {
      throw new Error("payment is not available before payment!");
    }

    updateFoodOrdersByOrderNos(
      activeOrderList.map((order) => order.order_no),
      {
        order_status: ORDER_STATUS.COMPLETED,
        complete_time: now,
        update_time: now,
      },
    );

    const orderStatusChangeList = createOrderStatusChanges({
      order_inner_no: orderInnerNo,
      order_status: ORDER_CHANGE_STATUS.COMPLETED,
    });

    return {
      success: true,
      order_inner_no: orderInnerNo,
      order_status_change_id: orderStatusChangeList.map((item) => item.id),
    };
  });

  return orderCompleteTx.immediate(req);
};

type ScheduledOrderActionReq = {
  order_inner_no?: string;
};

type ScheduledOrderActionResult = {
  applied: boolean;
  reason: "transitioned" | "already_applied" | "state_changed" | "not_applicable";
  order_inner_no: string;
};

const SYSTEM_AUTO_OPERATOR_NAME = "SYSTEM_AUTO";

const buildScheduledOrderActionResult = (
  orderInnerNo: string,
  reason: ScheduledOrderActionResult["reason"],
): ScheduledOrderActionResult => ({
  applied: false,
  reason,
  order_inner_no: orderInnerNo,
});

// 自动备餐：只推进已支付排队订单的 Taken 状态，状态已变化时不覆盖人工结果。
const scheduledQueueOrderPrepare = (req: ScheduledOrderActionReq): ScheduledOrderActionResult => {
  const db = getDB();
  const tx = db.transaction((txReq: ScheduledOrderActionReq): ScheduledOrderActionResult => {
    const orderInnerNo = String(txReq.order_inner_no ?? "").trim();
    if (!orderInnerNo) throw new Error("自动备餐失败：缺少 order_inner_no");

    const activeOrders = getActiveOrdersByInnerNo(orderInnerNo);
    if (activeOrders.length === 0) return buildScheduledOrderActionResult(orderInnerNo, "state_changed");

    const masterOrder = activeOrders.find((order) => order.order_type === ORDER_TYPE.MASTER) ?? activeOrders[0];
    if (masterOrder.order_channel !== ORDER_CHANNEL.QUEUE) {
      return buildScheduledOrderActionResult(orderInnerNo, "not_applicable");
    }
    if (!isPaidForOrderFlow(masterOrder.payment_status)) {
      return buildScheduledOrderActionResult(orderInnerNo, "state_changed");
    }

    const receivedOrders = activeOrders.filter((order) => order.order_status === ORDER_STATUS.RECEIVED);
    if (receivedOrders.length === 0) {
      const alreadyServed = activeOrders.every((order) =>
        [ORDER_STATUS.AWAITING_PICKUP, ORDER_STATUS.COMPLETED].includes(order.order_status),
      );
      return buildScheduledOrderActionResult(orderInnerNo, alreadyServed ? "already_applied" : "state_changed");
    }

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    updateFoodOrdersByOrderNos(
      receivedOrders.map((order) => order.order_no),
      {
        order_status: ORDER_STATUS.AWAITING_PICKUP,
        update_time: now,
      },
    );
    const statusChanges = createOrderStatusChanges({
      order_inner_no: orderInnerNo,
      order_status: ORDER_CHANGE_STATUS.MEALS_TO_BE_SERVED,
      operator_id: 0,
      operator_name: SYSTEM_AUTO_OPERATOR_NAME,
    });

    return {
      applied: true,
      reason: "transitioned",
      order_inner_no: orderInnerNo,
    };
  });

  return tx.immediate(req);
};

// 自动取餐：只推进已支付排队订单的 Ready for Take-out 状态。
const scheduledQueueOrderPickup = (req: ScheduledOrderActionReq): ScheduledOrderActionResult => {
  const db = getDB();
  const tx = db.transaction((txReq: ScheduledOrderActionReq): ScheduledOrderActionResult => {
    const orderInnerNo = String(txReq.order_inner_no ?? "").trim();
    if (!orderInnerNo) throw new Error("自动取餐失败：缺少 order_inner_no");

    const activeOrders = getActiveOrdersByInnerNo(orderInnerNo);
    if (activeOrders.length === 0) return buildScheduledOrderActionResult(orderInnerNo, "state_changed");

    const masterOrder = activeOrders.find((order) => order.order_type === ORDER_TYPE.MASTER) ?? activeOrders[0];
    if (masterOrder.order_channel !== ORDER_CHANNEL.QUEUE) {
      return buildScheduledOrderActionResult(orderInnerNo, "not_applicable");
    }
    if (!isPaidForOrderFlow(masterOrder.payment_status)) {
      return buildScheduledOrderActionResult(orderInnerNo, "state_changed");
    }

    const readyOrders = activeOrders.filter((order) => order.order_status === ORDER_STATUS.AWAITING_PICKUP);
    if (readyOrders.length === 0) {
      const alreadyCompleted = activeOrders.every((order) => order.order_status === ORDER_STATUS.COMPLETED);
      return buildScheduledOrderActionResult(orderInnerNo, alreadyCompleted ? "already_applied" : "state_changed");
    }

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    updateFoodOrdersByOrderNos(
      readyOrders.map((order) => order.order_no),
      {
        order_status: ORDER_STATUS.COMPLETED,
        complete_time: now,
        update_time: now,
      },
    );
    const statusChanges = createOrderStatusChanges({
      order_inner_no: orderInnerNo,
      order_status: ORDER_CHANGE_STATUS.COMPLETED,
      operator_id: 0,
      operator_name: SYSTEM_AUTO_OPERATOR_NAME,
    });

    return {
      applied: true,
      reason: "transitioned",
      order_inner_no: orderInnerNo,
    };
  });

  return tx.immediate(req);
};

// 未支付超时取消：只处理排队 Pending 订单，避免覆盖支付、退款或人工处理后的状态。
const scheduledQueueOrderCancel = (req: ScheduledOrderActionReq): ScheduledOrderActionResult => {
  const db = getDB();
  const tx = db.transaction((txReq: ScheduledOrderActionReq): ScheduledOrderActionResult => {
    const orderInnerNo = String(txReq.order_inner_no ?? "").trim();
    if (!orderInnerNo) throw new Error("自动取消失败：缺少 order_inner_no");

    const allOrders = getSelectOrderListByOrderInnerNoStmt().all({
      order_inner_no: orderInnerNo,
    }) as FoodOrderRecord[];
    if (allOrders.length === 0) return buildScheduledOrderActionResult(orderInnerNo, "state_changed");

    const activeOrders = allOrders.filter((order) => order.order_status !== ORDER_STATUS.CANCEL);
    if (activeOrders.length === 0) return buildScheduledOrderActionResult(orderInnerNo, "already_applied");

    const masterOrder = activeOrders.find((order) => order.order_type === ORDER_TYPE.MASTER) ?? activeOrders[0];
    if (masterOrder.order_channel !== ORDER_CHANNEL.QUEUE) {
      return buildScheduledOrderActionResult(orderInnerNo, "not_applicable");
    }
    if (
      ![PAYMENT_STATUS.UNPAY, PAYMENT_STATUS.FAILED].includes(Number(masterOrder.payment_status)) ||
      activeOrders.some((order) => order.order_status !== ORDER_STATUS.PROCESSING)
    ) {
      return buildScheduledOrderActionResult(orderInnerNo, "state_changed");
    }

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    updateFoodOrdersByOrderInnerNo(orderInnerNo, {
      order_status: ORDER_STATUS.CANCEL,
      update_time: now,
    });
    updateFoodOrdersByOrderNos([masterOrder.order_no], {
      cancel_remark: "System auto-cancelled: payment timeout",
      update_time: now,
    });
    updateOrderDetailsToCancelledByOrderIds(
      allOrders.map((order) => order.id),
      now,
    );
    const statusChanges = createOrderStatusChanges({
      order_inner_no: orderInnerNo,
      order_status: ORDER_CHANGE_STATUS.DELIVERY_FAILED,
      operator_id: 0,
      operator_name: SYSTEM_AUTO_OPERATOR_NAME,
    });

    return {
      applied: true,
      reason: "transitioned",
      order_inner_no: orderInnerNo,
    };
  });

  return tx.immediate(req);
};

// 三天兜底完成：仅处理支付后仍未完成的桌码订单。
const scheduledTableOrderComplete = (req: ScheduledOrderActionReq): ScheduledOrderActionResult => {
  const db = getDB();
  const tx = db.transaction((txReq: ScheduledOrderActionReq): ScheduledOrderActionResult => {
    const orderInnerNo = String(txReq.order_inner_no ?? "").trim();
    if (!orderInnerNo) throw new Error("自动完成失败：缺少 order_inner_no");

    const allOrders = getSelectOrderListByOrderInnerNoStmt().all({
      order_inner_no: orderInnerNo,
    }) as FoodOrderRecord[];
    if (allOrders.length === 0) return buildScheduledOrderActionResult(orderInnerNo, "state_changed");

    const activeOrders = allOrders.filter((order) => order.order_status !== ORDER_STATUS.CANCEL);
    if (activeOrders.length === 0) return buildScheduledOrderActionResult(orderInnerNo, "state_changed");
    if (activeOrders.every((order) => order.order_status === ORDER_STATUS.COMPLETED)) {
      return buildScheduledOrderActionResult(orderInnerNo, "already_applied");
    }

    const masterOrder = activeOrders.find((order) => order.order_type === ORDER_TYPE.MASTER) ?? activeOrders[0];
    if (masterOrder.order_channel !== ORDER_CHANNEL.TABLE) {
      return buildScheduledOrderActionResult(orderInnerNo, "not_applicable");
    }
    if (!isPaidForOrderFlow(masterOrder.payment_status)) {
      return buildScheduledOrderActionResult(orderInnerNo, "state_changed");
    }

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    updateFoodOrdersByOrderNos(
      activeOrders.filter((order) => order.order_status !== ORDER_STATUS.COMPLETED).map((order) => order.order_no),
      {
        order_status: ORDER_STATUS.COMPLETED,
        complete_time: now,
        update_time: now,
      },
    );
    const statusChanges = createOrderStatusChanges({
      order_inner_no: orderInnerNo,
      order_status: ORDER_CHANGE_STATUS.COMPLETED,
      operator_id: 0,
      operator_name: SYSTEM_AUTO_OPERATOR_NAME,
    });

    return {
      applied: true,
      reason: "transitioned",
      order_inner_no: orderInnerNo,
    };
  });

  return tx.immediate(req);
};

type TableClearReq = {
  table_uuid?: string;
};

type ChangeTableReq = {
  order_inner_no?: string;
  table_id?: number | string | null;
};

const getRestaurantTableByUuid = (tableUuid: string): RestaurantTableRecord | undefined => {
  const { user } = getCurrentSession();

  return getDB()
    .prepare(
      `
        SELECT *
        FROM restaurant_table
        WHERE restaurant_id = @restaurant_id
          AND del_status = @del_status
          AND table_uuid = @table_uuid
        LIMIT 1
      `,
    )
    .get({
      restaurant_id: user.restaurant_id,
      del_status: PRODUCT_STATUS.VALID,
      table_uuid: tableUuid,
    }) as RestaurantTableRecord | undefined;
};

const selectBlockingOrdersForTableClear = (tableId: number, startTime: string, endTime: string): FoodOrderRecord[] => {
  return getDB()
    .prepare(
      `
        SELECT *
        FROM food_order
        WHERE table_id = @table_id
          AND (
            order_status = @processing_status
            OR payment_status IN (@unpay_status, @failed_status)
          )
          AND order_status NOT IN (@completed_status, @cancel_status)
          AND create_time BETWEEN @start_time AND @end_time
      `,
    )
    .all({
      table_id: tableId,
      processing_status: ORDER_STATUS.PROCESSING,
      unpay_status: PAYMENT_STATUS.UNPAY,
      failed_status: PAYMENT_STATUS.FAILED,
      completed_status: ORDER_STATUS.COMPLETED,
      cancel_status: ORDER_STATUS.CANCEL,
      start_time: startTime,
      end_time: endTime,
    }) as FoodOrderRecord[];
};

const selectClearableOrdersByTable = (tableId: number, startTime: string, endTime: string): FoodOrderRecord[] => {
  return getDB()
    .prepare(
      `
        SELECT *
        FROM food_order
        WHERE table_id = @table_id
          AND order_status NOT IN (@completed_status, @cancel_status)
          AND payment_status NOT IN (@refunding_status, @refund_pending_status)
          AND (order_status = @received_status OR payment_status = @paid_status)
          AND create_time BETWEEN @start_time AND @end_time
      `,
    )
    .all({
      table_id: tableId,
      completed_status: ORDER_STATUS.COMPLETED,
      cancel_status: ORDER_STATUS.CANCEL,
      refunding_status: PAYMENT_STATUS.REFUNDING,
      refund_pending_status: PAYMENT_STATUS.REFUND_PENDING,
      received_status: ORDER_STATUS.RECEIVED,
      paid_status: PAYMENT_STATUS.PAY_SUCCESS,
      start_time: startTime,
      end_time: endTime,
    }) as FoodOrderRecord[];
};

const hasMasterOrderInRecentRange = (orderInnerNos: string[], startTime: string, endTime: string) => {
  const uniqueOrderInnerNos = [...new Set(orderInnerNos.filter((orderInnerNo) => !!orderInnerNo))];

  if (uniqueOrderInnerNos.length === 0) {
    return false;
  }

  const placeholders = uniqueOrderInnerNos.map(() => "?").join(",");
  const row = getDB()
    .prepare(
      `
        SELECT id
        FROM food_order
        WHERE order_inner_no IN (${placeholders})
          AND order_type = ?
          AND create_time BETWEEN ? AND ?
        LIMIT 1
      `,
    )
    .get(...uniqueOrderInnerNos, ORDER_TYPE.MASTER, startTime, endTime) as { id: number } | undefined;

  return !!row;
};

const updateClearableOrdersToCompleted = (orderInnerNos: string[], now: string, startTime: string) => {
  const uniqueOrderInnerNos = [...new Set(orderInnerNos.filter((orderInnerNo) => !!orderInnerNo))];

  if (uniqueOrderInnerNos.length === 0) {
    return;
  }

  const placeholders = uniqueOrderInnerNos.map(() => "?").join(",");
  getDB()
    .prepare(
      `
        UPDATE food_order
        SET order_status = ?,
            complete_time = ?,
            update_time = ?
        WHERE order_inner_no IN (${placeholders})
          AND order_status NOT IN (?, ?)
          AND payment_status NOT IN (?, ?)
          AND (order_status = ? OR payment_status = ?)
          AND create_time BETWEEN ? AND ?
      `,
    )
    .run(
      ORDER_STATUS.COMPLETED,
      now,
      now,
      ...uniqueOrderInnerNos,
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.CANCEL,
      PAYMENT_STATUS.REFUNDING,
      PAYMENT_STATUS.REFUND_PENDING,
      ORDER_STATUS.RECEIVED,
      PAYMENT_STATUS.PAY_SUCCESS,
      startTime,
      now,
    );
};

// 清台：对齐后端 /cashier/order/table/clear，先阻止未支付/待接单订单，再批量完成可清台订单。
const tableClear = (req: TableClearReq) => {
  const db = getDB();
  const tableClearTx = db.transaction((txReq: TableClearReq) => {
    const tableUuid = txReq.table_uuid;
    if (!tableUuid) {
      throw new Error("清台失败：缺少 table_uuid");
    }

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const startTime = dayjs().subtract(3, "day").format("YYYY-MM-DD HH:mm:ss");
    const table = getRestaurantTableByUuid(tableUuid);
    if (!table) {
      throw new Error("Table info does not exist！");
    }

    const blockingOrders = selectBlockingOrdersForTableClear(table.id, startTime, now);
    const blockingOrderInnerNos = blockingOrders.map((order) => order.order_inner_no);
    if (blockingOrders.length > 0 && hasMasterOrderInRecentRange(blockingOrderInnerNos, startTime, now)) {
      throw new Error("You have orders that have not been completed ,please complete these orders first.");
    }

    const clearableOrders = selectClearableOrdersByTable(table.id, startTime, now);
    const orderInnerNos = [...new Set(clearableOrders.map((order) => order.order_inner_no))];

    if (orderInnerNos.length === 0) {
      return {
        success: true,
        table_uuid: tableUuid,
        order_inner_no: [],
      };
    }

    const orderStatusChangeList = clearableOrders
      .filter((order) => order.order_type === ORDER_TYPE.MASTER)
      .flatMap((order) =>
        createOrderStatusChanges({
          order_inner_no: order.order_inner_no,
          order_status: ORDER_CHANGE_STATUS.COMPLETED,
        }),
      );

    updateClearableOrdersToCompleted(orderInnerNos, now, startTime);

    return {
      success: true,
      table_uuid: tableUuid,
      order_inner_no: orderInnerNos,
      order_status_change_id: orderStatusChangeList.map((item) => item.id),
    };
  });

  return tableClearTx.immediate(req);
};

const getRestaurantTableById = (tableId: number): RestaurantTableRecord | undefined => {
  const { user } = getCurrentSession();

  return getDB()
    .prepare(
      `
        SELECT *
        FROM restaurant_table
        WHERE restaurant_id = @restaurant_id
          AND del_status = @del_status
          AND id = @table_id
        LIMIT 1
      `,
    )
    .get({
      restaurant_id: user.restaurant_id,
      del_status: PRODUCT_STATUS.VALID,
      table_id: tableId,
    }) as RestaurantTableRecord | undefined;
};

const updatePrintInfoTableNameByOrderNos = (
  db: ReturnType<typeof getDB>,
  params: {
    restaurantId: number;
    orderNos: string[];
    orderInnerNo: string;
    tableName: string | null;
    now: string;
  },
) => {
  const targetOrderNos = [...new Set([...params.orderNos, params.orderInnerNo].filter((orderNo) => !!orderNo))];

  if (targetOrderNos.length === 0) {
    return;
  }

  const placeholders = targetOrderNos.map(() => "?").join(",");
  const printInfos = db
    .prepare(
      `
        SELECT *
        FROM food_order_print_info
        WHERE restaurant_id = ?
          AND order_no IN (${placeholders})
      `,
    )
    .all(params.restaurantId, ...targetOrderNos) as FoodOrderPrintInfoRecord[];

  const updateStmt = db.prepare(
    `
      UPDATE food_order_print_info
      SET content_json = @content_json,
          update_time = @update_time
      WHERE id = @id
    `,
  );

  printInfos.forEach((printInfo) => {
    if (!printInfo.content_json) {
      return;
    }

    // 换桌后同步修正已生成的小票快照桌号，避免后续补打仍显示旧桌。
    const printOrder = JSON.parse(printInfo.content_json) as PrintOrderBo;
    printOrder.tableNo = params.tableName ?? "";
    updateStmt.run({
      id: printInfo.id,
      content_json: stringifyBackendPrintOrder(printOrder),
      update_time: params.now,
    });
  });
};

// 换桌：对齐后端 /cashier/order/table/change，更新订单桌台并同步修正打印快照桌号。
const changeTable = (req: ChangeTableReq) => {
  const db = getDB();
  const changeTableTx = db.transaction((txReq: ChangeTableReq) => {
    const orderInnerNo = txReq.order_inner_no;
    const nextTableId = Number(txReq.table_id);
    const restaurantId = getCurrentSession().user?.restaurant_id;

    if (!restaurantId) {
      throw new Error("Current session user restaurant_id is missing.");
    }

    if (!orderInnerNo) {
      throw new Error("换桌失败：缺少 order_inner_no");
    }

    if (!Number.isFinite(nextTableId) || nextTableId <= 0) {
      throw new Error("换桌失败：缺少 table_id");
    }

    const activeOrders = db
      .prepare(
        `
          SELECT *
          FROM food_order
          WHERE restaurant_id = @restaurant_id
            AND order_inner_no = @order_inner_no
            AND order_status IN (@processing_status, @received_status)
          ORDER BY id ASC
        `,
      )
      .all({
        restaurant_id: restaurantId,
        order_inner_no: orderInnerNo,
        processing_status: ORDER_STATUS.PROCESSING,
        received_status: ORDER_STATUS.RECEIVED,
      }) as FoodOrderRecord[];

    if (activeOrders.length === 0) {
      throw new Error("Order not found or Order completed.");
    }

    const currentTableId = Number(activeOrders[0].table_id);
    const currentTable = getRestaurantTableById(currentTableId);
    if (!currentTable) {
      throw new Error("Order table not found.");
    }

    const nextTable = getRestaurantTableById(nextTableId);
    if (!nextTable) {
      throw new Error("The selected table information was not found.");
    }

    if (currentTable.id === nextTable.id) {
      return {
        success: true,
        order_inner_no: orderInnerNo,
        table_id: nextTable.id,
      };
    }

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const startTime = dayjs().subtract(3, "day").format("YYYY-MM-DD HH:mm:ss");
    const occupiedOrder = db
      .prepare(
        `
          SELECT id
          FROM food_order
          WHERE restaurant_id = @restaurant_id
            AND table_id = @table_id
            AND order_status IN (@processing_status, @received_status)
            AND datetime(create_time) BETWEEN datetime(@start_time) AND datetime(@end_time)
          LIMIT 1
        `,
      )
      .get({
        restaurant_id: restaurantId,
        table_id: nextTable.id,
        processing_status: ORDER_STATUS.PROCESSING,
        received_status: ORDER_STATUS.RECEIVED,
        start_time: startTime,
        end_time: now,
      }) as Pick<FoodOrderRecord, "id"> | undefined;

    if (occupiedOrder) {
      throw new Error("Please complete or cancel the order at the destination table first.");
    }

    // 同一个 order_inner_no 下的主单和加菜单一起迁移到目标桌。
    db.prepare(
      `
        UPDATE food_order
        SET table_id = @table_id,
            update_time = @update_time
        WHERE restaurant_id = @restaurant_id
          AND order_inner_no = @order_inner_no
      `,
    ).run({
      restaurant_id: restaurantId,
      order_inner_no: orderInnerNo,
      table_id: nextTable.id,
      update_time: now,
    });

    updatePrintInfoTableNameByOrderNos(db, {
      restaurantId,
      orderNos: activeOrders.map((order) => order.order_no),
      orderInnerNo,
      tableName: nextTable.name ?? null,
      now,
    });

    return {
      success: true,
      order_inner_no: orderInnerNo,
      table_id: nextTable.id,
    };
  });

  return changeTableTx.immediate(req);
};

export {
  createOrder,
  authManualOrderSerialNumber,
  checkPwdScDiscountIdAvailable,
  createManualOrder,
  getOrderListByOrderInnerNo,
  getMasterOrderByOrderInnerNo,
  createPaymentOrder,
  cashReceived,
  getOrderList,
  getUncompleteOrders,
  getUncompleteOrderCount,
  getPendingOrderByTable,
  getCancellableOrdersByTable,
  getCancellableOrderDetail,
  getOrderDetailByInnerNo,
  viewDigitalCopy,
  buildOrderReceiptTextForEJournal,
  getOrderHistory,
  orderRefund,
  orderCancel,
  orderTake,
  orderServe,
  orderComplete,
  scheduledQueueOrderPrepare,
  scheduledQueueOrderPickup,
  scheduledQueueOrderCancel,
  scheduledTableOrderComplete,
  reduceOrder,
  tableClear,
  changeTable,
};
