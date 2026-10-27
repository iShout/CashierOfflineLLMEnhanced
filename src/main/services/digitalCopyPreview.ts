import type {
  FoodOrderPrintInfoRecord,
  FoodOrderRecord,
  OrderDetailSnapRecord,
  OrderPaymentRecord,
  OrderPaymentTaxRecord,
} from "@app-types/models/orders";
import { PrintType } from "@app-types/models/printEnums";
import type {
  RestaurantOperationConfigRecord,
  RestaurantRecord,
  RestaurantSettingRecord,
} from "@app-types/models/settings";
import { generatePaymentReceipt, generateRefundReceipt } from "./printReceiptGenerator";
import { renderReceiptTextToImageDataUrl } from "./receiptImageRenderer";
import { createPrintOrderSnapshot, parsePrintOrderSnapshot } from "./printOrderSnapshot";

// 生成 Digital Copy 需要的本地订单、支付、税费和打印快照数据。
type PaymentPreviewSource = {
  foodOrder: FoodOrderRecord;
  detailSnaps: OrderDetailSnapRecord[];
  payment: OrderPaymentRecord | null;
  taxInfo: OrderPaymentTaxRecord | null;
  restaurant: RestaurantRecord | null;
  restaurantSetting: RestaurantSettingRecord | null;
  operationConfig?: RestaurantOperationConfigRecord | null;
  paymentChannelName?: string | null;
  printInfo: FoodOrderPrintInfoRecord | null;
};

const mergeOperationConfig = (
  printOrder: ReturnType<typeof createPrintOrderSnapshot>,
  operationConfig: RestaurantOperationConfigRecord | null | undefined,
) => {
  if (!operationConfig) return printOrder;

  // Digital Copy 使用当前审核通过的 BIR 注册状态，避免旧快照继续显示错误的 VAT 类型。
  return {
    ...printOrder,
    restaurantAddress: operationConfig.restaurant_address ?? printOrder.restaurantAddress,
    vatRegisterStatus: operationConfig.vat_register_status === 1,
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

const mergePaymentDiscountInfo = (
  printOrder: ReturnType<typeof createPrintOrderSnapshot>,
  payment: OrderPaymentRecord | null,
) => {
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
  };
};

const mergePaymentTaxInfo = (
  printOrder: ReturnType<typeof createPrintOrderSnapshot>,
  taxInfo: OrderPaymentTaxRecord | null,
) => {
  if (!taxInfo) {
    return printOrder;
  }

  // 预览旧快照时补齐最终税费字段，避免支付小票税费长期显示 0。
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

const mergePaymentChannelInfo = (
  printOrder: ReturnType<typeof createPrintOrderSnapshot>,
  payment: OrderPaymentRecord | null,
  paymentChannelName?: string | null,
) => {
  if (!payment) {
    return printOrder;
  }

  const channelName = String(paymentChannelName ?? payment.channel_code ?? payment.payment_platform ?? "").trim();
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

  // 预览旧快照时也补齐支付渠道，保持 Digital Copy 和实体小票一致。
  return {
    ...printOrder,
    paymentChannel: channelName,
  };
};

// 对齐后端 ReportTypeEnum 中小票预览类型的取值。
const PREVIEW_TYPE = {
  REFUND: 4,
  PAYMENT: 5,
} as const;

// 对外提供 Digital Copy 图片预览，支持 payment/refund 两种小票类型。
export const generateDigitalCopyPreview = (source: PaymentPreviewSource, previewType?: number): string => {
  const currentOrderSnapshot = createPrintOrderSnapshot(source);
  const storedOrderSnapshot = parsePrintOrderSnapshot(source.printInfo);
  // 服务器历史快照可能只包含主单；保留其监管/打印字段，但菜品区始终使用当前整组订单快照。
  const sourceOrderSnapshot = storedOrderSnapshot
    ? {
        ...currentOrderSnapshot,
        ...storedOrderSnapshot,
        itemList: currentOrderSnapshot.itemList,
        itemNum: currentOrderSnapshot.itemNum,
        kitchenItemList: currentOrderSnapshot.kitchenItemList,
      }
    : currentOrderSnapshot;
  const printOrder = mergePaymentTaxInfo(
    mergePaymentChannelInfo(
      mergePaymentDiscountInfo(
        mergeOperationConfig(
          sourceOrderSnapshot,
          source.operationConfig,
        ),
        source.payment,
      ),
      source.payment,
      source.paymentChannelName,
    ),
    source.taxInfo,
  );
  printOrder.chinese = false;
  printOrder.isReprint = false;
  printOrder.note = null as unknown as string;

  const effectivePreviewType = previewType ?? PREVIEW_TYPE.PAYMENT;
  const receiptText =
    effectivePreviewType === PREVIEW_TYPE.REFUND
      ? generateRefundReceipt({ ...printOrder, printType: PrintType.REFUND })
      : generatePaymentReceipt({ ...printOrder, printType: PrintType.PAYMENT }, 32, 32, false);

  // Digital Copy 按实体小票的 32 列等宽布局绘制，保留模板中的左对齐和空格居中。
  return renderReceiptTextToImageDataUrl(receiptText, {
    // 32 个 24px 等宽字符约占 461px，额外宽度用于避免最右侧字符被 SVG 裁切。
    width: 520,
    preserveColumnAlignment: true,
    contentColumns: 32,
  });
};
