import type {
  FoodOrderPrintInfoRecord,
  FoodOrderRecord,
  OrderDetailSnapRecord,
  OrderPaymentRecord,
  OrderPaymentTaxRecord,
} from "@app-types/models/orders";
import type { PrintOrderBo } from "@app-types/models/printOrder";
import { createDefaultPrintOrder } from "@app-types/models/printOrder";
import { PrintAssociationType, PrintType } from "@app-types/models/printEnums";
import type {
  RestaurantOperationConfigRecord,
  RestaurantRecord,
  RestaurantSettingRecord,
} from "@app-types/models/settings";

export type PrintOrderSnapshotSource = {
  foodOrder: FoodOrderRecord;
  detailSnaps: OrderDetailSnapRecord[];
  payment: OrderPaymentRecord | null;
  taxInfo: OrderPaymentTaxRecord | null;
  restaurant: RestaurantRecord | null;
  restaurantSetting: RestaurantSettingRecord | null;
  operationConfig?: RestaurantOperationConfigRecord | null;
  tableName?: string | null;
  waiterName?: string | null;
  paymentWaiterName?: string | null;
  refundWaiterName?: string | null;
  paymentChannelName?: string | null;
  printInfo?: FoodOrderPrintInfoRecord | null;
};

export const parsePrintOrderSnapshot = (printInfo: FoodOrderPrintInfoRecord | null): PrintOrderBo | null => {
  if (!printInfo?.content_json) {
    return null;
  }

  try {
    return JSON.parse(printInfo.content_json) as PrintOrderBo;
  } catch {
    return null;
  }
};

const nullable = (value: unknown): unknown => (value === "" || value === undefined ? null : value);

// content_json 严格按后端 PrintOrderBo/BirPrintInfo/Item 字段持久化，本地扩展字段不得写入。
export const toBackendPrintOrderJson = (order: Partial<PrintOrderBo>): Record<string, unknown> => {
  const item = (value: Partial<PrintOrderBo["itemList"][number]>) => ({
    number: nullable(value.number),
    itemName: nullable(value.itemName),
    price: nullable(value.price),
    categoryId: nullable(value.categoryId),
    chinese: nullable(value.chinese),
    is80Paper: nullable(value.is80Paper),
  });
  const bir = order.birPrintInfo;

  return {
    restaurantNo: nullable(order.restaurantNo), orderId: nullable(order.orderId),
    orderInnerNo: nullable(order.orderInnerNo), associationType: nullable(order.associationType),
    printType: nullable(order.printType), restaurantName: nullable(order.restaurantName),
    restaurantAddress: nullable(order.restaurantAddress), orderDate: nullable(order.orderDate),
    orderTime: nullable(order.orderTime), waiterName: nullable(order.waiterName),
    paymentWaiterName: nullable(order.paymentWaiterName), refundWaiterName: nullable(order.refundWaiterName),
    tableNo: nullable(order.tableNo), customerNum: nullable(order.customerNum), note: nullable(order.note),
    serviceFee: nullable(order.serviceFee), itemNum: nullable(order.itemNum), totalAmount: nullable(order.totalAmount),
    discountAmount: nullable(order.discountAmount), discountNumber: nullable(order.discountNumber),
    paymentChannel: nullable(order.paymentChannel), chinese: order.chinese ?? false, copy: order.copy ?? 1,
    showOrderNo: nullable(order.showOrderNo), paymentAmount: nullable(order.paymentAmount),
    transactionFee: nullable(order.transactionFee), itemList: (order.itemList ?? []).map(item),
    kitchenItemList: (order.kitchenItemList ?? []).map(item), deviceNo: nullable(order.deviceNo),
    restaurantNameOrderType: nullable(order.restaurantNameOrderType), printerType: nullable(order.printerType),
    taxAmount: nullable(order.taxAmount), discountType: nullable(order.discountType),
    vatableSales: nullable(order.vatableSales), vatExemptSales: nullable(order.vatExemptSales),
    vatExemption: nullable(order.vatExemption), zeroRatedSales: nullable(order.zeroRatedSales),
    lessVat: nullable(order.lessVat), promoDiscount: nullable(order.promoDiscount), taxFee: nullable(order.taxFee),
    // 离线收银不支持外卖和寄件功能，对应后端字段保留但统一置空。
    userAddress: null, userPhone: null, deliveryNote: null, deliveryFee: null,
    deliveryType: null, merchantDeliveryFee: null,
    packagingFee: null, tableFoodNo: nullable(order.tableFoodNo),
    paymentReceiptId: nullable(order.paymentReceiptId), paymentSystemTransNo: nullable(order.paymentSystemTransNo),
    refundReceiptId: nullable(order.refundReceiptId), refundSystemTransNo: nullable(order.refundSystemTransNo),
    orderSerialNumber: nullable(order.orderSerialNumber), paymentPrintCount: nullable(order.paymentPrintCount),
    orderPrintCount: nullable(order.orderPrintCount), kitchenPrintCount: nullable(order.kitchenPrintCount),
    billPrintCount: nullable(order.billPrintCount), refundPrintCount: nullable(order.refundPrintCount),
    change: nullable(order.change), cashReceiptAmount: nullable(order.cashReceiptAmount), nonVat: nullable(order.nonVat),
    timeZoneCode: nullable(order.timeZoneCode), countryName: nullable(order.countryName),
    channelReferenceNo: nullable(order.channelReferenceNo), discounterName: nullable(order.discounterName),
    discountValidityPeriod: nullable(order.discountValidityPeriod), discountId: nullable(order.discountId),
    discountSerialNo: nullable(order.discountSerialNo), customizeInfo: nullable(order.customizeInfo),
    isReprint: nullable(order.isReprint), receiptStatement: nullable(order.receiptStatement),
    vatRegisterStatus: order.vatRegisterStatus ?? false, refundSerialNo: nullable(order.refundSerialNo),
    orderFirstPrintTime: nullable(order.orderFirstPrintTime), billFirstPrintTime: nullable(order.billFirstPrintTime),
    paymentFirstPrintTime: nullable(order.paymentFirstPrintTime), refundFirstPrintTime: nullable(order.refundFirstPrintTime),
    firstPrintTime: nullable(order.firstPrintTime), takeoutChannel: null,
    couponsAmount: nullable(order.couponsAmount), qrCodeContent: null,
    isCrmOrder: order.isCrmOrder ?? false, companyName: nullable(order.companyName), companyTin: nullable(order.companyTin),
    rePrintContent: nullable(order.rePrintContent), birStatus: nullable(order.birStatus),
    birPrintInfo: bir ? {
      tinNumber: nullable(bir.tinNumber), merchantAddress: nullable(bir.merchantAddress),
      minNumber: nullable(bir.minNumber), serialNumber: nullable(bir.serialNumber), ptuNumber: nullable(bir.ptuNumber),
      ptuIssueDate: nullable(bir.ptuIssueDate), ptuValidUntil: nullable(bir.ptuValidUntil),
      swifoodAddress: nullable(bir.swifoodAddress), accreditationNumber: nullable(bir.accreditationNumber),
      taxpayerName: nullable(bir.taxpayerName), validUntil: nullable(bir.validUntil), tradeName: nullable(bir.tradeName),
    } : null,
    senderInfo: null, discountFirstPrint: nullable(order.discountFirstPrint),
    customerDiningStyle: nullable(order.customerDiningStyle), printerFontSize: nullable(order.printerFontSize),
    senderInfoReq: null,
  };
};

export const stringifyBackendPrintOrder = (order: Partial<PrintOrderBo>): string => {
  return JSON.stringify(toBackendPrintOrderJson(order));
};

// 本地数据库时间已经是展示格式，这里统一空值处理。
const formatDateTime = (value: string | null | undefined): string => {
  if (!value) {
    return "";
  }

  return value;
};

const formatBackendPrintDate = (value: string | null | undefined): string => {
  return formatDateTime(value).slice(0, 10).replaceAll("-", "/");
};

const formatBackendPrintTime = (value: string | null | undefined): string => {
  const formatted = formatDateTime(value);
  return formatted.length >= 19 ? formatted.slice(11, 19) : formatted;
};

const formatBackendAmount = (minorAmount: number): string => {
  return (Number(minorAmount || 0) / 100).toFixed(2);
};

// 离线现金和在线渠道使用不同字段，预览时统一成小票展示名称。
const getPaymentChannelName = (payment: OrderPaymentRecord | null, paymentChannelName?: string | null): string => {
  if (!payment) {
    return "";
  }

  const channelCode = String(payment.channel_code ?? "").trim();
  const channelName = String(paymentChannelName ?? "").trim();

  if (channelName) {
    return channelName;
  }

  if (payment.pay_product_type === 0 && channelCode.toUpperCase() === "CASH") {
    return "CASH";
  }

  return channelCode || payment.payment_platform || "ONLINE";
};

const buildBirPrintInfo = (operationConfig: RestaurantOperationConfigRecord | null | undefined) => ({
  tinNumber: operationConfig?.tin_number ?? "",
  merchantAddress: operationConfig?.restaurant_address ?? "",
  minNumber: operationConfig?.min_number ?? "",
  serialNumber: operationConfig?.serial_number ?? "",
  ptuNumber: operationConfig?.ptu_number ?? "",
  ptuIssueDate: operationConfig?.ptu_issue_date ?? "",
  ptuValidUntil: operationConfig?.ptu_issue_date ?? "",
  swifoodAddress: "",
  accreditationNumber: "",
  taxpayerName: operationConfig?.taxpayer_name ?? "",
  validUntil: "",
  tradeName: operationConfig?.trade_name ?? "",
});

// 本地订单在创建、支付、退款时都用同一份快照结构，保持预览与同步内容一致。
export const createPrintOrderSnapshot = ({
  foodOrder,
  detailSnaps,
  payment,
  taxInfo,
  restaurant,
  restaurantSetting,
  operationConfig,
  tableName,
  waiterName,
  paymentWaiterName,
  refundWaiterName,
  paymentChannelName,
}: PrintOrderSnapshotSource): PrintOrderBo => {
  const paidAmount = Number(payment?.real_amount ?? payment?.amount ?? foodOrder.total_amount ?? 0);
  const serviceFee = Number(payment?.real_service_fee ?? foodOrder.service_fee ?? 0);
  const taxAmount = Number(payment?.real_tax_amount ?? foodOrder.tax_amount ?? 0);
  const refundTime = formatDateTime(foodOrder.refund_time ?? payment?.transaction_return_time);
  const firstPrintTime = formatDateTime(payment?.transaction_return_time ?? payment?.update_time ?? payment?.create_time);
  // 旧订单若带有来源 POS 则沿用展示；新订单不再生成或要求该字段。
  const historicalDeviceNo = String(foodOrder.device_no ?? payment?.device_no ?? "").trim();

  return {
    ...createDefaultPrintOrder(),
    restaurantNo: restaurant?.restaurant_no ?? "",
    restaurantName: restaurant?.display_name ?? restaurant?.name ?? "",
    restaurantAddress: operationConfig?.restaurant_address ?? "",
    orderId: foodOrder.order_no,
    orderInnerNo: foodOrder.order_inner_no,
    associationType: PrintAssociationType.ORDER_NO,
    printType: PrintType.ALL,
    // 后端 PrintOrderBo 仅保存展示日期和时间，不保存完整数据库时间戳。
    orderDate: formatBackendPrintDate(foodOrder.create_time),
    orderTime: formatBackendPrintTime(foodOrder.create_time),
    waiterName: waiterName ?? foodOrder.waiter_no ?? "",
    paymentWaiterName: paymentWaiterName ?? "",
    refundWaiterName: refundWaiterName ?? "",
    tableNo: tableName ?? (foodOrder.table_id ? String(foodOrder.table_id) : ""),
    customerNum: Number(payment?.real_customer_num ?? foodOrder.customer_num ?? 0),
    note: foodOrder.remark ?? "",
    serviceFee,
    itemNum: Number(
      foodOrder.total_count ?? detailSnaps.reduce((sum, item) => sum + Number(item.product_count ?? 0), 0),
    ),
    totalAmount: Number(foodOrder.total_amount ?? 0) - serviceFee - taxAmount,
    paymentAmount: paidAmount,
    taxAmount,
    paymentChannel: getPaymentChannelName(payment, paymentChannelName),
    itemList: detailSnaps.map((item) => {
      const count = Number(item.product_count ?? 0);
      const unitPrice = Number(item.sku_price ?? 0);

      return {
        number: String(count),
        itemName: `${item.product_name}${item.sku_name ? `(${item.sku_name})` : ""}@${formatBackendAmount(unitPrice)}`,
        price: formatBackendAmount(unitPrice * count),
        categoryId: 0,
        chinese: false,
        is80Paper: false,
      };
    }),
    kitchenItemList: [],
    deviceNo: historicalDeviceNo,
    posName: historicalDeviceNo,
    tableFoodNo: foodOrder.take_food_no ?? "",
    paymentReceiptId: payment?.receipt_no ?? "",
    paymentSystemTransNo: payment?.system_transaction_no ?? "",
    refundSerialNo: payment?.refund_serial_no ?? "",
    refundSystemTransNo: payment?.system_transaction_no ?? "",
    orderSerialNumber: foodOrder.order_serial_number ?? "",
    cashReceiptAmount: Number(payment?.cash_receipt_amount ?? 0),
    change: Math.max(0, Number(payment?.cash_receipt_amount ?? 0) - paidAmount),
    discountAmount: Number(payment?.discount_amount ?? 0),
    discountNumber: Number(payment?.discount_number ?? 0),
    discountType: Number(payment?.discount_type ?? 0),
    discounterName: payment?.discounter_name ?? "",
    discountValidityPeriod: payment?.discount_validity_period ?? "",
    discountId: payment?.discount_no ?? "",
    discountSerialNo: payment?.discount_serial_no ?? "",
    pwdDiscount: Number(taxInfo?.pwd_discount ?? 0),
    promoDiscount: Number(taxInfo?.promo_discount ?? 0),
    couponsAmount: Number(payment?.coupon_amount ?? foodOrder.coupon_amount ?? 0),
    vatableSales: Number(taxInfo?.vatable_sales ?? 0),
    vatExemptSales: Number(taxInfo?.vat_exempt_sales ?? 0),
    vatExemption: Number(taxInfo?.vat_exemption ?? 0),
    zeroRatedSales: Number(taxInfo?.zero_rated_sales ?? 0),
    lessVat: Number(taxInfo?.less_vat ?? 0),
    taxFee: Number(restaurantSetting?.tax_fee ?? 0),
    chinese: false,
    vatRegisterStatus: taxInfo?.vat_register_status === 1 || operationConfig?.vat_register_status === 1,
    birStatus: restaurantSetting?.bir_status === 1,
    birPrintInfo: buildBirPrintInfo(operationConfig),
    firstPrintTime,
    paymentFirstPrintTime: firstPrintTime,
    refundFirstPrintTime: refundTime,
    customerDiningStyle: foodOrder.customer_dining_style,
    countryName: restaurant?.country_name ?? "",
  } as PrintOrderBo;
};
