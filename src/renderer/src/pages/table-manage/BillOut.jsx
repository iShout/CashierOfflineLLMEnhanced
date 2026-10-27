import Header from "@renderer/components/Header";
import { Radio, InputNumber, Modal, Button, message } from "antd";
import { EditOutlined, DownOutlined, RightOutlined } from "@ant-design/icons";
import CashReceiver from "./components/CashReceiver";
import CustomDiscountModal from "./components/Modals/CustomDiscountModal";
import ManualOrderModal from "./components/Modals/ManualOrderModal";
import PwdScDiscountModal from "./components/Modals/PwdScDiscountModal";
import ServiceFeeModal from "./components/Modals/ServiceFeeModal";

import CashPaymentIcon from "@renderer/assets/cash-payment.png";
import RollingNumber from "@renderer/components/RollingNumber";
import QuantityStepper from "@renderer/components/QuantityStepper";

import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { format } from "@renderer/utils/MoneyUtils";
import { useLocation, useNavigate } from "react-router";
import dayjs from "dayjs";
import useStore from "@renderer/store";

import { buildOfflinePaymentOrderParams } from "./paymentOrderAdapter";
import usePaymentSuccessModal from "@renderer/hooks/usePaymentSuccessModal.jsx";

import useBillOutAmount from "./hooks/useBillOutAmount";
import usePwdScDiscount, { MANUAL_PWD_SC_AMOUNT_ERROR, PWD_SC_DISCOUNT_ID_USED_ERROR } from "./hooks/usePwdScDiscount";

import useGsapReflowAnimation from "@renderer/hooks/useGsapReflowAnimation";
import CONSTANT from "@renderer/const";

import { getManualOrderTypeOptions } from "./orderTypeOptions";

const baseDiscountList = [0.05, 0.1, 0.2, 0.5, "Custom", "PWD", "SC"];
// import { paymentChannels } from "./mock";
import { CUSTOM_DISCOUNT_TYPE, ORDER_CHANNEL, SERVICE_FEE_TYPE, STATUS_TYPE } from "@shared/constants/enums";

const TAX_RATE = 0.12; // 菲律宾商品税费，基础查询参数仍按商品价计算。
const CASH_PAYMENT_CODE = "CASH";

const PAY_PRODUCT_TYPE = { OFFLINE: 0 };

const { PWD, SC } = CONSTANT.DISCOUNT_TYPE;

const isLocalTaxEnabled = (restaurantSetting, vatRegisterStatus) =>
  restaurantSetting?.tax_fee !== CONSTANT.TAX_FEE.OFF && vatRegisterStatus !== CONSTANT.TAX_FEE.OFF;

const isPwdScDiscountEnabled = (restaurantSetting) =>
  Number(restaurantSetting?.pwd_discount_status) === CONSTANT.PWD_STATUS.OPEN;

const getManualOrderOriginalAmount = (amountDetail) => Number(amountDetail?.sub_total ?? 0);

const toSafeAmount = (value) => {
  const amount = Number(value ?? 0);

  return Number.isFinite(amount) ? amount : 0;
};

// 弹窗金额统一把负号放在货币符号前，保持与 Bill Out 主账单一致。
const formatCurrencyAmount = (value, currencySymbol) => {
  const amount = toSafeAmount(value);
  const sign = amount < 0 ? "-" : "";

  return `${sign}${currencySymbol ?? ""}${format(Math.abs(amount))}`;
};

// 离线状态下兜底使用的现金支付渠道。
const CASH_PAYMENT_CHANNEL = {
  logo: CashPaymentIcon,
  name: "CASH",
  code: CASH_PAYMENT_CODE,
  pay_product_type: 0,
  payment_way: 2,
  balance: null,
  prepaid_card_agreement_status: null,
  is_valid: true,
};

// 手动录单进入独立结算态，支付渠道不再沿用普通现金/线上通道。
const MANUAL_ORDER_PAYMENT_CHANNEL = {
  name: "Manual Order",
  code: "MANUAL_ORDER",
  pay_product_type: null,
  payment_way: null,
  is_valid: true,
};

const isTypingTarget = (target) => {
  if (!target) return false;

  const tagName = target.tagName?.toLowerCase();

  return tagName === "input" || tagName === "textarea" || target.isContentEditable === true;
};

const BillOut = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedPayment, selectPayment] = useState("");
  const [guestNumber, setGuestNumber] = useState(1);
  const [modal, modalContextHolder] = Modal.useModal();

  const [showCustomDiscountModal, setShowCustomDiscountModal] = useState(false); // 控制自定义折扣弹窗
  const [showPwdScDiscountModal, setShowPwdScDiscountModal] = useState(false); // 控制PWD/SC信息弹窗
  const [showManualOrderModal, setShowManualOrderModal] = useState(false); // 控制手工录单弹窗
  const [manualOrder, setManualOrder] = useState(null); // 保存已通过 SI/OR 校验的手动录单草稿
  const [showServiceFeeModal, setShowServiceFeeModal] = useState(false); // 控制服务费弹窗
  // 控制优惠券使用方式弹窗
  const [editingPwdScType, setEditingPwdScType] = useState(null);
  const [showVatBreakdown, setVatVisible] = useState(false);
  const [pageOrderSummaryList, setPageOrderSummaryList] = useState([]); // order summary下的商品列表
  const [isReducingOrder, setIsReducingOrder] = useState(false);
  const [reduceDraftCounts, setReduceDraftCounts] = useState({});
  const [isSubmittingReduceOrder, setIsSubmittingReduceOrder] = useState(false);
  // 餐前首次结账不会携带 order_inner_no；已有订单或恢复结账才会从路由带入。
  const routeOrderInnerNo = location.state?.orderInnerNo ?? "";
  // 餐前首次结账使用菜单页传入的临时订单快照，支付时才真正创建 food_order。
  const beforeMealOrder = location.state?.beforeMealOrder ?? null;
  const [orderInnerNo, setOrderInnerNo] = useState(routeOrderInnerNo);
  const tableUuid = location.state?.tableUuid ?? "";
  // 只要当前还没有 order_inner_no 且存在临时订单，就按餐前未建单流程处理。
  const isBeforeMealDraft = !orderInnerNo && Boolean(beforeMealOrder);
  // 桌码餐前和排队点餐都会以临时订单进入 BillOut；后续接口需使用真实订单渠道。
  const currentOrderChannel = beforeMealOrder?.orderChannel ?? ORDER_CHANNEL.TABLE;
  const currentStatusType = currentOrderChannel === ORDER_CHANNEL.QUEUE ? STATUS_TYPE.QUEUE : STATUS_TYPE.TABLE;
  const isQueueOrder = currentOrderChannel === ORDER_CHANNEL.QUEUE;
  const canReduceOrder = Boolean(orderInnerNo) && currentOrderChannel === ORDER_CHANNEL.TABLE && !isBeforeMealDraft;

  const [messageApi, messageContextHolder] = message.useMessage();

  const restaurantSetting = useStore((state) => state.restaurantSetting);
  const birInfo = useStore((state) => state.bir_info);
  const user = useStore((state) => state.user);

  const { currency_symbol } = restaurantSetting;
  const vatRegisterStatus = Number(birInfo?.vat_register_status);
  const isNonVat = vatRegisterStatus === CONSTANT.TAX_FEE.OFF;
  const canUsePwdScDiscount = isPwdScDiscountEnabled(restaurantSetting);
  const discountList = useMemo(
    () => (canUsePwdScDiscount ? baseDiscountList : baseDiscountList.filter((item) => !["PWD", "SC"].includes(item))),
    [canUsePwdScDiscount],
  );

  const [discount, setDiscount] = useState(0);
  const [customDiscountType, setCustomDiscountType] = useState(null); // 如果discountType有值，则认为选择了自定义折扣。 否则认为是固定折扣
  const [serviceFee, setServiceFee] = useState(0); // 当前订单的服务费
  const [serviceFeeType, setServiceFeeType] = useState(null); // 当前订单的服务费类型
  const [receivedAmount, setReceivedAmount] = useState(0); // 收银计算器的输入值

  const [isCreatingPaymentOrder, setIsCreatingPaymentOrder] = useState(false);

  const paymentChannelListRef = useRef(null);
  const previousGuestNumberRef = useRef(guestNumber);

  const navigateAfterOrderFinished = useCallback(() => {
    // 支付完成后按点餐入口返回：排队点餐回排队菜单，桌码点餐回桌码首页。
    if (isQueueOrder) {
      navigate("/table-menu/counter", {
        state: {
          status_type: STATUS_TYPE.QUEUE,
        },
      });
      return;
    }

    const shouldPromptTableClear =
      currentOrderChannel === ORDER_CHANNEL.TABLE &&
      restaurantSetting?.mode === CONSTANT.MODE.AFTER_MEAL &&
      Boolean(tableUuid);

    navigate("/", {
      state: shouldPromptTableClear
        ? {
            promptTableClear: true,
            tableUuid,
          }
        : undefined,
    });
  }, [currentOrderChannel, isQueueOrder, navigate, restaurantSetting?.mode, tableUuid]);

  const { openPaymentSuccessModal, paymentSuccessModalHolder } = usePaymentSuccessModal({
    onComplete: navigateAfterOrderFinished,
  });

  const guestNumberModalConfig = {
    title: t("table_manage.guest_number"),
    content: (
      <>
        <p>{t("table_manage.guest_number_tip")}</p>
        <InputNumber mode="spinner" min={1} defaultValue={guestNumber} onChange={(value) => setGuestNumber(value)} />
      </>
    ),
    okText: t("components.confirm"),
  };

  // 选择支付方式的回调
  const onSelectPayment = (paymentDetail) => {
    const { code } = paymentDetail;
    selectPayment(code);
  };
  // 将税费信息的数据格式转换成数组，方便渲染
  const convertTaxToArray = (taxInfo) => {
    const { vatable_sales, tax_amount, vat_exempt_sales, vat_exemption, zero_rated_sales } = taxInfo;
    const taxArr = [];
    taxArr.push(["report.vatable_sales", vatable_sales]);
    taxArr.push(["order.vat", tax_amount]);
    taxArr.push(["order.vat_exempt_sales", vat_exempt_sales]);
    taxArr.push(["order.vat_exempt_amount", vat_exemption]);
    taxArr.push(["order.zero_rated_sales", zero_rated_sales]);

    return taxArr;
  };

  useEffect(() => {
    let ignore = false;

    if (isBeforeMealDraft) {
      // 餐前模式未建单时，BillOut 直接使用菜单页传入的临时菜品快照。
      setPageOrderSummaryList([
        {
          order_status: CONSTANT.ORDER_STATUS.PENDING,
          order_type: 1,
          product_list: beforeMealOrder.orderSummaryList ?? [],
          total_amount: beforeMealOrder.totalAmount ?? 0,
        },
      ]);
      setGuestNumber(beforeMealOrder.customerNum ?? 1);
      return undefined;
    }

    if (!orderInnerNo) {
      messageApi.open({
        type: "error",
        content: "订单号不能为空",
      });
      return;
    }

    window.api.orders
      .getOrderListByOrderInnerNo(orderInnerNo)
      .then((orderList) => {
        if (ignore) return;

        console.log(orderList, "Order List");
        setPageOrderSummaryList(orderList);
      })
      .catch((error) => {
        if (ignore) return;

        messageApi.error(error.message);
      });

    return () => {
      ignore = true;
    };
  }, [beforeMealOrder, isBeforeMealDraft, orderInnerNo, messageApi]);

  // 菜品总额
  const productsTotalAmount = useMemo(() => {
    return pageOrderSummaryList.reduce((orderAmount, order) => {
      const productAmount = order.product_list.reduce((sum, product) => {
        if (product.detail_type === 2) return sum;

        return sum + product.count * product.price;
      }, 0);

      return orderAmount + productAmount;
    }, 0);
  }, [pageOrderSummaryList]);

  // 账单详情里的服务费行跟随餐厅服务费开关；关闭时即使金额为 0 也不展示字段。
  const showServiceFeeBillingRow =
    !isQueueOrder && restaurantSetting?.service_fee_status !== CONSTANT.SERVICE_FEE_STATUS.CLOSE;
  const showCustomServiceFee =
    showServiceFeeBillingRow && restaurantSetting?.service_fee_type === SERVICE_FEE_TYPE.CUSTOM;

  const activeOrderItemCount = useMemo(
    () =>
      pageOrderSummaryList.reduce(
        (sum, order) =>
          sum +
          (order.product_list ?? []).reduce(
            (productSum, product) => productSum + (product.detail_type === 2 ? 0 : Number(product.count ?? 0)),
            0,
          ),
        0,
      ),
    [pageOrderSummaryList],
  );
  const reducibleProducts = useMemo(
    () =>
      pageOrderSummaryList.flatMap((order) =>
        (order.product_list ?? [])
          .filter((product) => product.order_detail_id != null && product.detail_type !== 2)
          .map((product) => ({
            ...product,
            order_no: order.order_no,
            original_count: Number(product.count ?? 0),
          })),
      ),
    [pageOrderSummaryList],
  );
  const hasReduceChanges = useMemo(
    () =>
      reducibleProducts.some((product) => {
        const detailId = String(product.order_detail_id);
        return Number(reduceDraftCounts[detailId] ?? product.original_count) !== product.original_count;
      }),
    [reducibleProducts, reduceDraftCounts],
  );

  const startReduceOrder = useCallback(() => {
    const nextDraftCounts = {};
    reducibleProducts.forEach((product) => {
      nextDraftCounts[String(product.order_detail_id)] = product.original_count;
    });
    setReduceDraftCounts(nextDraftCounts);
    setIsReducingOrder(true);
  }, [reducibleProducts]);

  const cancelReduceOrder = useCallback(() => {
    setIsReducingOrder(false);
    setReduceDraftCounts({});
  }, []);

  const {
    applyPwdScDiscount,
    calculateManualPwdScDiscount,
    clearPwdScDiscount,
    getPwdScPaymentPayload,
    pwdScDiscount,
    selectedPwdScType,
  } = usePwdScDiscount({
    orderInnerNo,
    productAmount: productsTotalAmount,
    restaurantSetting,
    vatRegisterStatus,
  });

  const amountDetail = useBillOutAmount({
    customDiscountType,
    discount,
    isQueueOrder,
    productsTotalAmount,
    pwdScDiscount,
    restaurantSetting,

    serviceFee,
    serviceFeeType,
    vatRegisterStatus,
  });

  const getEffectivePwdScPaymentPayload = useCallback(() => {
    const payload = getPwdScPaymentPayload();

    if (!isNonVat || !payload.discount_type) return payload;

    // NON-VAT 支付落库必须使用页面归一后的免税税费，不能回写服务端 VAT breakdown。
    return {
      ...payload,
      tax_info: amountDetail.tax_info,
    };
  }, [amountDetail.tax_info, getPwdScPaymentPayload, isNonVat]);

  const isManualOrder = Boolean(manualOrder);
  // 手动录单金额由录入表单提供，账单区域和支付渠道查询均应使用这笔金额。
  const displayedAmountDetail = useMemo(() => {
    if (!manualOrder) return amountDetail;

    const originalAmount = manualOrder.originalAmount ?? getManualOrderOriginalAmount(amountDetail);
    const inputAmount = manualOrder.totalAmount;
    const manualTaxInfo = manualOrder.taxInfo ?? {};
    const manualPwdScDiscount = [PWD, SC].includes(manualOrder.discountType)
      ? toSafeAmount(manualTaxInfo.pwd_discount ?? manualOrder.discountAmount)
      : 0;
    const manualLessVat = isNonVat ? 0 : toSafeAmount(manualTaxInfo.less_vat);
    const manualPromoDiscount = toSafeAmount(manualOrder.promoDiscount);
    const promoDiscount = manualPwdScDiscount > 0 ? manualPromoDiscount : Math.max(0, originalAmount - inputAmount);
    const surcharge = toSafeAmount(manualOrder.surcharge ?? Math.max(0, inputAmount - originalAmount));
    const taxAmount = isLocalTaxEnabled(restaurantSetting, vatRegisterStatus)
      ? originalAmount - Math.round(originalAmount / (1 + TAX_RATE))
      : 0;
    const fallbackTaxInfo = {
      vatable_sales: originalAmount - taxAmount,
      tax_amount: taxAmount,
      vat_exempt_sales: 0,
      vat_exemption: 0,
      zero_rated_sales: 0,
      less_vat: 0,
      pwd_discount: 0,
      promo_discount: promoDiscount,
    };

    const total = toSafeAmount(manualOrder.realAmount ?? inputAmount);
    const mergedTaxInfo = {
      ...fallbackTaxInfo,
      ...manualTaxInfo,
      less_vat: manualLessVat,
      pwd_discount: manualPwdScDiscount,
      promo_discount: promoDiscount,
      vat_register_status: vatRegisterStatus,
    };
    const taxInfo = isNonVat
      ? {
          ...mergedTaxInfo,
          vatable_sales: 0,
          tax_amount: 0,
          vat_exempt_sales: manualPwdScDiscount > 0 ? total : 0,
          vat_exemption: 0,
          zero_rated_sales: 0,
          less_vat: 0,
        }
      : mergedTaxInfo;

    return {
      ...amountDetail,
      sub_total: originalAmount,
      promo_discount: promoDiscount,
      coupon_amount: 0,
      pwd_sc_discount: manualPwdScDiscount,
      service_fee: 0,
      surcharge,
      total,
      tax_info: taxInfo,
    };
  }, [amountDetail, isNonVat, manualOrder, restaurantSetting, vatRegisterStatus]);

  const activePwdScType = manualOrder?.discountType || selectedPwdScType;

  const vatBreakdownList = convertTaxToArray(displayedAmountDetail.tax_info);
  const formattedPwdScValidDate = pwdScDiscount?.discountValidityPeriod
    ? dayjs(pwdScDiscount.discountValidityPeriod).format("MM/DD/YYYY")
    : "";
  // 根据联网状态得到当前页面可选择的支付渠道。
  // 纯离线版只提供本地现金与手工录单渠道。
  const availablePaymentChannels = useMemo(
    () =>
      isManualOrder
        ? [{ ...MANUAL_ORDER_PAYMENT_CHANNEL, name: t("table_manage.manual_order") }]
        : [CASH_PAYMENT_CHANNEL],
    [isManualOrder, t],
  );

  // 获取当前选中的支付渠道；仅离线状态下默认使用唯一的 CASH 渠道。
  const selectedPaymentChannel = useMemo(
    () => availablePaymentChannels.find((payment) => payment.code === selectedPayment) ?? availablePaymentChannels[0],
    [availablePaymentChannels, selectedPayment],
  );

  // UI 勾选态使用的最终支付渠道 code。
  const effectiveSelectedPaymentCode = selectedPaymentChannel?.code || "";

  // 支付渠道列表会随联网状态、金额、手动录单切换重排，复用公共列表动画。
  useGsapReflowAnimation(paymentChannelListRef, [availablePaymentChannels.map((payment) => payment.code).join(",")], {
    duration: 0.28,
    stagger: 0.01,
    itemSelector: ":scope > .payment-channel-item",
  });

  // 判断当前支付渠道是否为现金支付；在线现金渠道通常由 payment_way 标记。
  const isCashPayment =
    selectedPaymentChannel?.code === CASH_PAYMENT_CODE ||
    selectedPaymentChannel?.payment_way === CONSTANT.PAYMENT_WAY.CASH ||
    selectedPaymentChannel?.pay_product_type === PAY_PRODUCT_TYPE.OFFLINE;

  const chargeSummaryList = useMemo(() => {
    const discountAmount =
      toSafeAmount(displayedAmountDetail.promo_discount) + toSafeAmount(displayedAmountDetail.pwd_sc_discount);
    const summaryList = [{ key: "sub-total", label: t("order.sub_total"), value: displayedAmountDetail.sub_total }];

    if (discountAmount > 0) {
      summaryList.push({ key: "discount", label: t("order.discount"), value: -discountAmount });
    }

    // 收款确认弹窗始终展示服务费，未收取时明确显示 0。
    summaryList.push({ key: "service-fee", label: t("order.service_fee"), value: displayedAmountDetail.service_fee });

    if (displayedAmountDetail.coupon_amount > 0) {
      summaryList.push({
        key: "voucher",
        label: t("order.voucher"),
        value: -displayedAmountDetail.coupon_amount,
      });
    }

    // Total 的含税提示与 Bill Out 主账单保持一致，仅由 vat_included 控制。
    const totalLabel =
      Number(restaurantSetting?.vat_included) === CONSTANT.VAT_INCLUDED.YES
        ? `${t("components.total")}${t("order.incl_vat")}`
        : t("components.total");
    summaryList.push(
      { key: "total", label: totalLabel, value: displayedAmountDetail.total },
      { key: "cash-received", label: t("table_manage.cash_received"), value: receivedAmount },
    );

    return summaryList;
  }, [
    displayedAmountDetail.coupon_amount,
    displayedAmountDetail.promo_discount,
    displayedAmountDetail.pwd_sc_discount,
    displayedAmountDetail.service_fee,
    displayedAmountDetail.sub_total,
    displayedAmountDetail.total,
    receivedAmount,
    restaurantSetting?.vat_included,
    t,
  ]);
  const changeAmount = isManualOrder ? 0 : receivedAmount - displayedAmountDetail.total;
  // 手动录单使用独立创建订单 IPC；Charge 可继续点击，现金输入区保持禁用。
  const isChargeDisabled =
    isCreatingPaymentOrder || (!isManualOrder && (!selectedPaymentChannel || (isCashPayment && changeAmount < 0)));

  // 餐前临时单在支付节点才真正创建本地 food_order，后续现金收款复用同一份本地订单。
  const createBeforeMealLocalOrderRecord = useCallback(async () => {
    if (orderInnerNo) return { order_inner_no: orderInnerNo };
    if (!beforeMealOrder) {
      throw new Error("订单号不能为空");
    }

    const orderParams = {
      customer_num: guestNumber,
      mode: restaurantSetting?.mode,
      order_app: 3,
      order_channel: currentOrderChannel,
      customer_dining_style: beforeMealOrder.customerDiningStyle,
      restaurant_id: user.restaurant_id,
      // 餐前桌台单和排队单延迟到支付节点建单时，必须保留 Menu 草稿中的订单备注。
      remark: beforeMealOrder.remark,
      // 创建 food_order 时服务费为 0 也要明确传递，避免本地订单金额落成 null。
      service_fee: amountDetail.service_fee ?? 0,
      sku_list: beforeMealOrder.orderSummaryList ?? [],
      table_id: beforeMealOrder.tableId,
      total_amount: amountDetail.sub_total + amountDetail.service_fee,
      waiter_no: user.waiter_no,
    };
    const result = await window.api.orders.createOrder(orderParams);
    const nextOrderInnerNo = result?.order_inner_no ?? "";

    if (!nextOrderInnerNo) {
      throw new Error("创建订单失败：未返回 order_inner_no");
    }

    setOrderInnerNo(nextOrderInnerNo);

    // 返回本次新建订单号，后续 payment_order 与 cashReceived 都使用同一个订单组。
    return {
      ...result,
      order_inner_no: nextOrderInnerNo,
    };
  }, [
    amountDetail.service_fee,
    amountDetail.sub_total,
    beforeMealOrder,
    currentOrderChannel,
    guestNumber,
    orderInnerNo,
    restaurantSetting?.mode,
    user,
  ]);

  const createBeforeMealLocalOrder = useCallback(async () => {
    const result = await createBeforeMealLocalOrderRecord();

    return result?.order_inner_no ?? "";
  }, [createBeforeMealLocalOrderRecord]);

  // 创建线下现金支付订单。当前已有支付落库逻辑仅适用于 CASH 线下支付。
  const createOfflineCashPaymentOrder = useCallback(async () => {
    const effectiveOrderInnerNo = await createBeforeMealLocalOrder();
    const params = buildOfflinePaymentOrderParams({
      amountDetail,
      discount,
      guestNumber,
      orderInnerNo: effectiveOrderInnerNo,
      receivedAmount,
      selectedPaymentChannel,
      statusType: currentStatusType,
      user,
      vatRegisterStatus,
      pwdScPaymentPayload: getEffectivePwdScPaymentPayload(),
    });

    // 创建支付订单期间禁用收银按钮，避免重复点击生成多笔支付记录。
    setIsCreatingPaymentOrder(true);

    try {
      const { mch_order_id, order_inner_no, order_no, order_payment_id } =
        await window.api.orders.createPaymentOrder(params);
      const cashReceivedParams = {
        mch_order_id,
        order_inner_no,
        order_no,
        status_type: currentStatusType,
        operator_name: user.name,
        operator_id: user.id,
        order_payment_id,
        amountDetail,
        guestNumber,
      };
      return cashReceivedParams;
    } finally {
      setIsCreatingPaymentOrder(false);
    }
  }, [
    amountDetail,
    createBeforeMealLocalOrder,
    currentStatusType,
    discount,
    getEffectivePwdScPaymentPayload,

    guestNumber,
    receivedAmount,
    selectedPaymentChannel,
    user,
    vatRegisterStatus,
  ]);

  const chargeModalConfig = useMemo(
    () => ({
      width: 620,
      centered: true,
      icon: null,
      closable: true,
      title: (
        <div className="pt-2 text-center text-[15px] leading-normal text-[#8c8c8c] italic font-semibold">
          {t("table_manage.receive_cash_tip")}
        </div>
      ),
      content: (
        <div className="px-4 pt-4 pb-3">
          <div>
            <p className="m-0 mb-6 text-[17px] font-semibold text-[#4b5567]">{t("table_manage.billing_details")}</p>
            {/* 收款明细字段统一使用 8px 的垂直间距。 */}
            <div className="space-y-2">
              {chargeSummaryList.map((item) => (
                <div key={item.key} className="flex items-center justify-between text-[13px] text-[#5f5f5f]">
                  <span>{item.label}</span>
                  <span>{formatCurrencyAmount(item.value, currency_symbol)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-8">
            <span className="text-[17px] font-semibold text-[#181818]">{t("table_manage.change")}</span>
            <span className="text-[17px] font-semibold text-[#181818]">
              {formatCurrencyAmount(changeAmount, currency_symbol)}
            </span>
          </div>
        </div>
      ),
      okText: t("table_manage.confirm_received"),
      footer: (_, { OkBtn }) => (
        <div className="flex justify-center">
          <OkBtn />
        </div>
      ),
      okButtonProps: {
        style: {
          padding: "10px 20px",
          fontSize: "14px",
          fontWeight: 600,
          borderRadius: "6px",
        },
      },
    }),
    [t, chargeSummaryList, changeAmount, currency_symbol],
  );

  // CASH 渠道走线下支付：先创建本地支付记录，再弹出现金确认框，确认后完成 cashReceived。
  // 本地现金确认成功即完成收款，不再触发上传、打印或开钱箱。
  const processOfflineCashPayment = useCallback(async () => {
    const cashReceivedParams = await createOfflineCashPaymentOrder();
    await modal.info({
      ...chargeModalConfig,
      onOk: async () => {
        try {
          await window.api.orders.cashReceived(cashReceivedParams);
          messageApi.success(t("table_manage.payment_success"));
          openPaymentSuccessModal();
        } catch (error) {
          messageApi.error(error.message);
          throw error;
        }
      },
    });
  }, [chargeModalConfig, createOfflineCashPaymentOrder, messageApi, modal, openPaymentSuccessModal, t]);

  // 联网状态统一走线上创建支付订单，现金渠道再调用服务端确认收款完成核销。

  // 支付统一入口：页面按钮和快捷键只调用这里，不关心具体支付渠道的实现细节。
  const processManualOrder = useCallback(async () => {
    if (!manualOrder) {
      messageApi.error("Please submit manual order information first.");
      return;
    }

    setIsCreatingPaymentOrder(true);
    try {
      const manualTaxInfo = displayedAmountDetail.tax_info ?? {};
      const hasManualPwdScDiscount = [PWD, SC].includes(manualOrder.discountType);
      if (hasManualPwdScDiscount && !canUsePwdScDiscount) {
        // 支付前再校验餐厅开关，避免历史手动录单状态继续使用 PWD/SC。
        setManualOrder(null);
        selectPayment("");
        messageApi.error("PWD/SC discount is disabled.");
        return;
      }

      const isManualPromoDiscount = !hasManualPwdScDiscount && displayedAmountDetail.promo_discount > 0;
      const result = await window.api.orders.createManualOrder({
        receipt_no: manualOrder.receiptNo,
        total_amount: displayedAmountDetail.sub_total,
        real_amount: displayedAmountDetail.total,
        surcharge: displayedAmountDetail.surcharge ?? 0,
        remark: manualOrder.remark,
        sku_list: orderInnerNo ? undefined : (beforeMealOrder?.orderSummaryList ?? []),
        order_channel: manualOrder.orderChannel,
        real_tax_amount: manualTaxInfo.tax_amount ?? 0,
        order_inner_no: orderInnerNo || undefined,
        payment_way: CONSTANT.PAYMENT_WAY.CASH,
        pay_product_type: PAY_PRODUCT_TYPE.OFFLINE,
        channel_code:
          selectedPaymentChannel?.channel_code ?? selectedPaymentChannel?.code ?? MANUAL_ORDER_PAYMENT_CHANNEL.code,
        payment_platform: selectedPaymentChannel?.payment_platform ?? "PayCools",
        discount_number: isManualPromoDiscount ? null : hasManualPwdScDiscount ? guestNumber : null,
        discount_nos: isManualPromoDiscount ? [] : manualOrder.discountNos ? [manualOrder.discountNos] : [],
        discount_type: isManualPromoDiscount ? 2 : manualOrder.discountType || null,
        tax_info: manualTaxInfo,
        discounter_name: isManualPromoDiscount ? null : manualOrder.discounterName,
        discount_validity_period: isManualPromoDiscount ? null : manualOrder.discountValidityPeriod,
        user_no: user?.waiter_no,
        customer_num: guestNumber,
      });

      const nextOrderInnerNo = result?.order_inner_no ?? orderInnerNo;
      if (nextOrderInnerNo) {
        setOrderInnerNo(nextOrderInnerNo);
      }

      messageApi.success(t("table_manage.payment_success"));
      openPaymentSuccessModal();
    } finally {
      setIsCreatingPaymentOrder(false);
    }
  }, [
    beforeMealOrder?.orderSummaryList,
    canUsePwdScDiscount,
    displayedAmountDetail.promo_discount,
    displayedAmountDetail.sub_total,
    displayedAmountDetail.surcharge,
    displayedAmountDetail.tax_info,
    displayedAmountDetail.total,
    guestNumber,
    manualOrder,
    messageApi,
    openPaymentSuccessModal,
    orderInnerNo,

    selectedPaymentChannel,

    t,
    user?.waiter_no,
  ]);

  const processSelectedPayment = useCallback(async () => {
    if (isManualOrder) await processManualOrder();
    else await processOfflineCashPayment();
  }, [isManualOrder, processManualOrder, processOfflineCashPayment]);

  const onClickCharge = useCallback(async () => {
    try {
      await processSelectedPayment();
    } catch (error) {
      messageApi.error(error.message);
    }
  }, [messageApi, processSelectedPayment]);

  // 清空当前本地折扣草稿，保留原来的手工录单和 PWD/SC 重置行为。
  const clearDiscountSelection = useCallback(async () => {
    setDiscount(0);
    setCustomDiscountType(null);
    clearPwdScDiscount();
    setManualOrder(null);
    setShowCustomDiscountModal(false);
    setShowManualOrderModal(false);
    setShowPwdScDiscountModal(false);
    setEditingPwdScType(null);
  }, [clearPwdScDiscount]);

  const confirmReduceOrder = useCallback(async () => {
    if (!orderInnerNo || !hasReduceChanges) return;

    const orderDetailList = reducibleProducts
      .map((product) => {
        const detailId = String(product.order_detail_id);
        return {
          order_detail_id: product.order_detail_id,
          count: Number(reduceDraftCounts[detailId] ?? product.original_count),
        };
      })
      .filter((item, index) => item.count !== reducibleProducts[index].original_count);

    setIsSubmittingReduceOrder(true);
    try {
      const result = await window.api.orders.reduceOrder({
        order_inner_no: orderInnerNo,
        order_detail_list: orderDetailList,
      });

      await clearDiscountSelection();

      setPageOrderSummaryList(result?.order_list ?? []);
      setIsReducingOrder(false);
      setReduceDraftCounts({});

      if (result?.cancelled_all) {
        modal.warning({
          title: t("components.order_cancelled"),
          okText: t("components.confirm"),
          onOk: navigateAfterOrderFinished,
        });
      } else {
        messageApi.success(t("tips.success"));
      }
    } catch (error) {
      messageApi.error(error?.message || String(error));
    } finally {
      setIsSubmittingReduceOrder(false);
    }
  }, [
    clearDiscountSelection,
    hasReduceChanges,
    messageApi,
    modal,
    navigateAfterOrderFinished,
    orderInnerNo,
    reducibleProducts,
    reduceDraftCounts,

    t,
  ]);

  const openPwdScDiscountModal = useCallback(
    (discountType) => {
      if (!canUsePwdScDiscount) return;

      setEditingPwdScType(discountType);
      setShowPwdScDiscountModal(true);
    },
    [canUsePwdScDiscount],
  );

  const handlePwdScDiscountConfirm = useCallback(
    async (values) => {
      try {
        if (!canUsePwdScDiscount) {
          // PWD/SC 总开关关闭时，即使旧弹窗状态残留也不允许继续绑定。
          clearPwdScDiscount();
          setShowPwdScDiscountModal(false);
          setEditingPwdScType(null);
          return;
        }

        // PWD/SC 提交后统一由本机校验当天使用记录，并按本机 BIR 设置计算金额。
        await applyPwdScDiscount({
          ...values,
          guestNumber,
        });
        setDiscount(0);
        setCustomDiscountType(null);
        setShowPwdScDiscountModal(false);
      } catch (error) {
        messageApi.error(
          error?.code === PWD_SC_DISCOUNT_ID_USED_ERROR ? t("tips.pwd_sc_discount_verification") : error.message,
        );
      }
    },
    [applyPwdScDiscount, canUsePwdScDiscount, clearPwdScDiscount, guestNumber, messageApi, t],
  );

  const openManualOrderModal = useCallback(() => {
    if (isManualOrder) {
      modal.confirm({
        title: t("components.tips"),
        content: t("tips.confirm_cancel_manual_order"),
        okText: t("components.confirm"),
        cancelText: t("components.cancel"),
        onOk: () => {
          // 取消手动录单后恢复普通结账金额、折扣和支付渠道。
          setManualOrder(null);
          selectPayment("");
          setReceivedAmount(0);
        },
      });
      return;
    }

    setShowManualOrderModal(true);
  }, [isManualOrder, modal, t]);

  const handleManualOrderConfirm = useCallback(
    async (values) => {
      try {
        if (values.receiptNo) {
          // 与在线端一致：录单确认只验证 SI/OR，不在这里创建最终支付订单。
          const isReceiptNoAvailable = await window.api.orders.authManualOrderSerialNumber({
            receipt_no: values.receiptNo,
          });

          if (!isReceiptNoAvailable) {
            messageApi.error(t("tips.receipt_no_repeat"));
            return;
          }
        }

        clearPwdScDiscount();
        setDiscount(0);
        setCustomDiscountType(null);

        let manualAmountData = null;
        const hasManualPwdScDiscount = canUsePwdScDiscount && [PWD, SC].includes(values.discountType);
        if ([PWD, SC].includes(values.discountType) && !canUsePwdScDiscount) {
          // 手动录单同样受餐厅 PWD/SC 开关控制，关闭后禁止提交折扣信息。
          values.discountType = 0;
        }

        if (hasManualPwdScDiscount) {
          const manualOriginalAmount = getManualOrderOriginalAmount(amountDetail);

          // 手动录单也统一使用本机 ID 校验、BIR 设置和金额反算规则。
          try {
            manualAmountData = await calculateManualPwdScDiscount({
              discountNos: values.discountNos,
              discountType: values.discountType,
              manualProductAmount: manualOriginalAmount,
              totalAmount: values.totalAmount,
            });
          } catch (error) {
            if (error?.code === PWD_SC_DISCOUNT_ID_USED_ERROR) {
              messageApi.error(t("tips.pwd_sc_discount_verification"));
              return;
            }
            if (error?.code === MANUAL_PWD_SC_AMOUNT_ERROR) {
              modal.warning({
                title: t("components.tips"),
                content: t("tips.manual_order_amount_tips"),
                okText: t("components.confirm"),
              });
              return;
            }
            throw error;
          }
        }

        // 手动录单以当前订单原始应收为基准，输入金额和原始金额的差额显示为折扣或附加费。
        setManualOrder({
          ...values,
          discountAmount: manualAmountData?.discount_amount,
          originalAmount: getManualOrderOriginalAmount(amountDetail),
          promoDiscount: 0,
          realAmount: manualAmountData?.real_amount,
          subAmount: manualAmountData?.sub_amount,
          surcharge: manualAmountData?.surcharge,
          taxInfo: manualAmountData?.tax_info,
        });
        selectPayment(MANUAL_ORDER_PAYMENT_CHANNEL.code);
        setReceivedAmount(0);
        setShowManualOrderModal(false);
      } catch (error) {
        messageApi.error(error?.message || String(error));
      }
    },
    [amountDetail, calculateManualPwdScDiscount, canUsePwdScDiscount, clearPwdScDiscount, messageApi, modal, t],
  );

  useEffect(() => {
    if (previousGuestNumberRef.current === guestNumber) return;

    previousGuestNumberRef.current = guestNumber;
    if (!pwdScDiscount) return;

    // PWD/SC 折扣类型和本地分摊金额依赖就餐人数，人数变更后清空旧结果。
    clearPwdScDiscount();
  }, [clearPwdScDiscount, guestNumber, pwdScDiscount]);

  useEffect(() => {
    if (canUsePwdScDiscount || !pwdScDiscount) return;

    // 餐厅关闭 PWD/SC 后，清理已选择的 PWD/SC 折扣和弹窗状态。
    clearPwdScDiscount();
    setShowPwdScDiscountModal(false);
    setEditingPwdScType(null);
  }, [canUsePwdScDiscount, clearPwdScDiscount, pwdScDiscount]);

  useEffect(() => {
    if (canUsePwdScDiscount || ![PWD, SC].includes(manualOrder?.discountType)) return;

    // 餐厅关闭 PWD/SC 后，手动录单中的 PWD/SC 草稿也不能继续结算。
    setManualOrder(null);
    selectPayment("");
    setReceivedAmount(0);
  }, [canUsePwdScDiscount, manualOrder?.discountType]);

  // 优惠券方式弹窗提交入口：三种入口最终都复用服务端金额接口完成绑定。

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Enter" && event.code !== "Enter") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (isChargeDisabled) return;
      if (document.querySelector(".ant-modal-root .ant-modal-wrap")) return;

      event.preventDefault();
      onClickCharge();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isChargeDisabled, onClickCharge]);

  // 在线查询支付方式

  // 根据折扣项类型分流：固定折扣直接生效，Custom 打开对应弹窗。
  const onSelectDiscount = async (discountItem) => {
    if (isManualOrder) {
      openManualOrderModal();
      return;
    }

    switch (discountItem) {
      case "PWD":
      case "SC": {
        if (!canUsePwdScDiscount) break;

        const discountType = discountItem === "PWD" ? PWD : SC;

        if (selectedPwdScType === discountType) {
          await clearDiscountSelection();
          break;
        }

        openPwdScDiscountModal(discountType);
        break;
      }
      case "Custom":
        if (customDiscountType !== null) {
          await clearDiscountSelection();
          break;
        }
        setShowCustomDiscountModal(true);
        break;
      default:
        if (typeof discountItem === "number") {
          if (customDiscountType === null && discount === discountItem) {
            await clearDiscountSelection();
            break;
          }

          clearPwdScDiscount();
          setDiscount(discountItem);
          setCustomDiscountType(null);
        }
    }
  };

  const manualOrderTypeLabel = useMemo(() => {
    if (!manualOrder) return "";

    return (
      getManualOrderTypeOptions(restaurantSetting, t).find((option) => option.value === manualOrder.orderChannel)
        ?.label ?? String(manualOrder.orderChannel)
    );
  }, [manualOrder, restaurantSetting, t]);

  // 高亮折扣item的逻辑
  const hightDiscountItem = (discount_i) => {
    // 高亮固定折扣
    if (typeof discount_i === "number" && customDiscountType === null) {
      return discount_i === discount;
    }
    // 高亮custom折扣
    if (discount_i === "Custom" && customDiscountType !== null) {
      return true;
    }
    // 高亮 PWD/SC 折扣
    if (discount_i === "PWD" && selectedPwdScType === PWD) {
      return true;
    }
    if (discount_i === "SC" && selectedPwdScType === SC) {
      return true;
    }
  };

  // 动态渲染折扣文案
  const renderDiscountText = (discount_i) => {
    // 固定折扣
    if (typeof discount_i === "number") {
      return `${discount_i * 100}%`;
    }
    // 当custom被设置时的折扣

    if (discount_i === "Custom" && customDiscountType !== null) {
      if (customDiscountType === CUSTOM_DISCOUNT_TYPE.PERCENTAGE) {
        return `${discount * 100} %`;
      } else {
        return `${discount}`;
      }
    }
    // 其他非固定折扣
    if (typeof discount_i === "string") {
      const discountLabelMap = {
        Custom: t("order.custom"),
        PWD: t("order.pwd"),
        SC: t("order.sc"),
      };

      return discountLabelMap[discount_i] ?? discount_i;
    }
  };

  return (
    <div className="h-screen overflow-hidden">
      {modalContextHolder}
      {messageContextHolder}

      <CustomDiscountModal
        open={showCustomDiscountModal}
        onCancel={() => {
          setShowCustomDiscountModal(false);
        }}
        onConfirm={(customDiscountType, discount) => {
          console.log(discount, "passing dicousn");

          clearPwdScDiscount();
          setCustomDiscountType(customDiscountType);
          const activeDiscount = customDiscountType === CUSTOM_DISCOUNT_TYPE.PERCENTAGE ? discount / 100 : discount;
          setDiscount(activeDiscount);
          setShowCustomDiscountModal(false);
        }}
      />
      <PwdScDiscountModal
        open={showPwdScDiscountModal}
        discountType={editingPwdScType}
        discountInfo={selectedPwdScType === editingPwdScType ? pwdScDiscount : null}
        guestNumber={guestNumber}
        onCancel={() => {
          setShowPwdScDiscountModal(false);
          setEditingPwdScType(null);
        }}
        onConfirm={handlePwdScDiscountConfirm}
      />
      <ManualOrderModal
        open={showManualOrderModal}
        canUsePwdScDiscount={canUsePwdScDiscount}
        onCancel={() => setShowManualOrderModal(false)}
        onConfirm={handleManualOrderConfirm}
      />
      {!isQueueOrder && (
        <ServiceFeeModal
          open={showServiceFeeModal}
          onCancel={() => {
            setShowServiceFeeModal(false);
          }}
          onConfirm={(customServiceFeeType, serviceFeeValue) => {
            setServiceFeeType(customServiceFeeType);

            // 服务费在数据库中存储的就是分，所以在自定义设置的时候，在存储值时也转换成分存储
            setServiceFee(
              customServiceFeeType === SERVICE_FEE_TYPE.PERCENTAGE ? serviceFeeValue / 100 : serviceFeeValue * 100,
            );
            setShowServiceFeeModal(false);
          }}
        ></ServiceFeeModal>
      )}

      {paymentSuccessModalHolder}
      <Header currentTitle={t("menu.bill_out")} onTopPage={false}></Header>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* 折扣 & 支付方式 */}
        <div className="flex h-full min-h-0 flex-none basis-[33%] border-r border-line">
          <div className="flex min-h-0 flex-1 flex-col px-4 py-2">
            {/* 折扣 */}
            <div className="flex-none py-2 border-b border-line">
              <span className="text-normal text-[17px] font-semibold">{t("order.discount")}</span>
            </div>
            <div className="flex flex-none flex-wrap py-4">
              {discountList.map((discount_i) => (
                <div
                  onClick={() => {
                    onSelectDiscount(discount_i);
                  }}
                  key={discount_i}
                  style={{
                    ...(hightDiscountItem(discount_i)
                      ? {
                          backgroundColor: "#003498",
                          color: "#fff",
                          border: "1px solid #003498",
                        }
                      : {}),
                  }}
                  className="flex-none m-1 w-[116px] h-[40px] px-[14px] border border-primar text-primary text-center leading-[40px] cursor-pointer text-[15px]"
                >
                  {renderDiscountText(discount_i)}
                </div>
              ))}
            </div>
            {pwdScDiscount && (
              <div className="mb-4 w-full text-[13px] font-normal text-[#5f5f5f]">
                <div className="flex items-center justify-between">
                  <span>{t("table_manage.customer_information")}</span>
                  <EditOutlined
                    className="cursor-pointer text-[18px]"
                    onClick={() => openPwdScDiscountModal(selectedPwdScType)}
                  />
                </div>
                {selectedPwdScType === SC ? (
                  <>
                    <div className="my-[10px] flex w-full items-start justify-between gap-4">
                      <span>{t("order.sc_name")}</span>
                      <span className="max-w-[200px] break-words text-right">{pwdScDiscount.discounterName}</span>
                    </div>
                    <div className="my-[10px] flex w-full items-start justify-between gap-4">
                      <span>{t("order.sc_id")}</span>
                      <span className="max-w-[200px] break-words text-right">{pwdScDiscount.discountNos}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="my-[10px] flex w-full items-start justify-between gap-4">
                      <span>{t("order.pwd_name")}</span>
                      <span className="max-w-[200px] break-words text-right">{pwdScDiscount.discounterName}</span>
                    </div>
                    <div className="my-[10px] flex w-full items-start justify-between gap-4">
                      <span>{t("order.pwd_id")}</span>
                      <span className="max-w-[200px] break-words text-right">{pwdScDiscount.discountNos}</span>
                    </div>
                    <div className="my-[10px] flex w-full items-start justify-between gap-4">
                      <span>{t("order.valid_date")}</span>
                      <span className="max-w-[200px] break-words text-right">{formattedPwdScValidDate}</span>
                    </div>
                  </>
                )}
              </div>
            )}
            {/* 服务费 */}
            {showCustomServiceFee && (
              <div className="mb-4 flex-none">
                <span className="flex-1 text-normal text-[17px] font-semibold">{t("order.service_fee")}</span>
                <div
                  onClick={isManualOrder ? openManualOrderModal : () => setShowServiceFeeModal(true)}
                  className="border border-line p-2 flex flex-row gap-2 cursor-pointer"
                >
                  <span className="text-primary">PHP</span>
                  <span>{format(displayedAmountDetail.service_fee)}</span>
                </div>
              </div>
            )}
            {/* 支付方式 */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-none items-center border-b border-line py-2">
                <span className="flex-1 text-normal text-[17px] font-semibold">{t("order.payment_channel")}</span>
                <span className="text-[14px] text-primary font-semibold cursor-pointer" onClick={openManualOrderModal}>
                  {t(isManualOrder ? "table_manage.cancel_manual_order" : "table_manage.manual_order")}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div ref={paymentChannelListRef} className="min-h-[62px]">
                  {availablePaymentChannels.map((payment) => (
                    <div
                      key={payment.code}
                      className="payment-channel-item py-2 w-full h-[62px] flex items-center border-b border-line cursor-pointer"
                      onClick={() => onSelectPayment(payment)}
                    >
                      <div className="size-[46px] border border-[#f1f1f1] rounded-[4px] mr-4">
                        {payment.logo ? (
                          <img src={payment.logo} alt="Payment Logo" />
                        ) : (
                          <EditOutlined className="m-3 text-primary" />
                        )}
                      </div>
                      <span className="flex-1 text-[14px]">{payment.name}</span>
                      <Radio checked={effectiveSelectedPaymentCode === payment.code}></Radio>
                    </div>
                  ))}
                </div>
              </div>
              {manualOrder && (
                <div className="flex-none border-t border-line pt-3 text-[13px] text-normal">
                  {manualOrder.receiptNo && (
                    <div className="mb-2 flex items-start justify-between gap-4">
                      <span>{t("table_manage.manual_si_or")}</span>
                      <span className="break-all text-right">{manualOrder.receiptNo}</span>
                    </div>
                  )}
                  <div className="mb-2 flex items-start justify-between gap-4">
                    <span>{t("order.order_type")}</span>
                    <span className="text-right">{manualOrderTypeLabel}</span>
                  </div>
                  {displayedAmountDetail.surcharge > 0 && (
                    <div className="mb-2 flex items-start justify-between gap-4">
                      <span>{t("table_manage.surcharge")}</span>
                      <span className="text-right">{format(displayedAmountDetail.surcharge)}</span>
                    </div>
                  )}
                  {manualOrder.discountType === SC && (
                    <>
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <span>{t("order.sc_name")}</span>
                        <span className="break-all text-right">{manualOrder.discounterName}</span>
                      </div>
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <span>{t("order.sc_id")}</span>
                        <span className="break-all text-right">{manualOrder.discountNos}</span>
                      </div>
                    </>
                  )}
                  {manualOrder.discountType === PWD && (
                    <>
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <span>{t("order.pwd_name")}</span>
                        <span className="break-all text-right">{manualOrder.discounterName}</span>
                      </div>
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <span>{t("order.pwd_id")}</span>
                        <span className="break-all text-right">{manualOrder.discountNos}</span>
                      </div>
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <span>{t("order.valid_date")}</span>
                        <span className="text-right">{manualOrder.discountValidityPeriod}</span>
                      </div>
                    </>
                  )}
                  {manualOrder.remark && (
                    <div className="mb-2 flex items-start justify-between gap-4">
                      <span>{t("table_manage.remark")}</span>
                      <span className="break-all text-right">{manualOrder.remark}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 订单汇总 & 账单详情 */}
        <div className="min-h-0 flex-1 overflow-y-auto border-r border-line px-4 py-2">
          <div className="mb-4">
            <div className="flex items-center py-2 border-b border-line">
              <span className="flex-1 text-normal text-[18px] font-semibold">
                {t("order.order_summary")}
                {canReduceOrder && !isManualOrder && !isReducingOrder ? (
                  <span
                    className="ml-1.5 text-danger cursor-pointer text-[14px] font-semibold"
                    onClick={startReduceOrder}
                  >
                    <EditOutlined />
                  </span>
                ) : null}
              </span>
              {isReducingOrder ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="primary"
                    disabled={!hasReduceChanges}
                    loading={isSubmittingReduceOrder}
                    onClick={confirmReduceOrder}
                  >
                    {t("components.confirm")}
                  </Button>
                  <Button color="default" variant="solid" onClick={cancelReduceOrder}>
                    {t("components.cancel")}
                  </Button>
                </div>
              ) : (
                <div>
                  <span className="text-normal text-[16px] font-semibold mr-2">
                    {t("table_manage.guest")}:<span className="text-primary">{guestNumber}</span>
                  </span>
                  <span className="text-danger cursor-pointer" onClick={async () => modal.info(guestNumberModalConfig)}>
                    <EditOutlined />
                  </span>
                </div>
              )}
            </div>
            {pageOrderSummaryList.map((order, index) => (
              <div key={order.order_no} className="mt-4">
                <p className="m-0! text-[14px] text-primary font-medium">
                  {index === 0 ? t("table_manage.original_order") : t("table_manage.additional_order")}
                </p>
                <div>
                  {order.product_list.map((prod) => (
                    <div key={prod.order_detail_id ?? prod.sku_no}>
                      <SkuItemInOrderSummary
                        skuItem={prod}
                        currencySymbol={currency_symbol}
                        isReducing={isReducingOrder && prod.detail_type !== 2}
                        reduceCount={reduceDraftCounts[String(prod.order_detail_id)] ?? prod.count}
                        onReduceCountChange={(nextCount) => {
                          const detailId = String(prod.order_detail_id);
                          // 扣菜编辑态只允许在当前数量内减少，不能增加超过原数量。
                          setReduceDraftCounts((prevCounts) => ({
                            ...prevCounts,
                            [detailId]: nextCount,
                          }));
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="py-2 flex border-b border-line items-center">
              <span className="flex-1 text-normal text-[18px] font-semibold">{t("table_manage.billing_details")}</span>
              <span className="text-[14px] text-[#afafaf] font-medium">
                {t("order.item_count", { count: activeOrderItemCount })}
              </span>
            </div>
            <div className="space-y-2 py-3">
              <div className="flex min-h-[24px] items-center justify-between text-normal text-[14px]">
                <span>{`${t("order.sub_total")}(${t("setting.tax_included")})`}</span>
                <RollingNumber value={`${currency_symbol}${format(displayedAmountDetail.sub_total)}`}></RollingNumber>
              </div>
              {!displayedAmountDetail.coupon_amount && displayedAmountDetail.promo_discount > 0 && (
                <div className="flex min-h-[24px] items-center justify-between text-normal text-[14px]">
                  <span>{t("order.promo_discount")}</span>
                  <RollingNumber
                    value={`-${currency_symbol}${format(displayedAmountDetail.promo_discount)}`}
                  ></RollingNumber>
                </div>
              )}
              {displayedAmountDetail.surcharge > 0 && (
                <div className="flex min-h-[24px] items-center justify-between text-normal text-[14px]">
                  <span>{t("table_manage.surcharge")}</span>
                  <RollingNumber value={`${currency_symbol}${format(displayedAmountDetail.surcharge)}`} />
                </div>
              )}
              {showServiceFeeBillingRow && (
                <div className="flex min-h-[24px] items-center justify-between text-normal text-[14px]">
                  <span>{t("order.service_fee")}</span>
                  <RollingNumber
                    value={`${currency_symbol}${format(displayedAmountDetail.service_fee)}`}
                  ></RollingNumber>
                </div>
              )}

              {displayedAmountDetail.pwd_sc_discount > 0 && (
                <span
                  type="button"
                  onClick={isManualOrder ? undefined : () => openPwdScDiscountModal(activePwdScType)}
                  className={`flex min-h-[24px] w-full items-center justify-between border-0 bg-transparent p-0 text-left text-[14px] text-normal ${
                    isManualOrder ? "" : "cursor-pointer"
                  }`}
                >
                  <span>{activePwdScType === SC ? t("order.sc_discount") : t("order.pwd_discount")}</span>
                  <span className="flex items-center gap-1 text-primary">
                    <RollingNumber value={`-${currency_symbol}${format(displayedAmountDetail.pwd_sc_discount)}`} />
                    {!isManualOrder && <RightOutlined className="text-[11px] font-bold" />}
                  </span>
                </span>
              )}
              {displayedAmountDetail.tax_info?.less_vat > 0 && (
                <div className="flex min-h-[24px] items-center justify-between text-normal text-[14px]">
                  <span>{t("order.less_vat")}</span>
                  <RollingNumber value={`-${currency_symbol}${format(displayedAmountDetail.tax_info.less_vat)}`} />
                </div>
              )}

              {/* 总计 */}
              <div className="py-3">
                <div className="flex justify-between items-center text-normal text-[17px] mb-2">
                  <span className="font-medium">
                    {t("components.total")}
                    {/* 门店启用含税价时，在总计标题后提示金额已包含 VAT。 */}
                    {Number(restaurantSetting?.vat_included) === CONSTANT.VAT_INCLUDED.YES && (
                      <span className="ml-1 text-[15px] font-medium text-[#FF332E]">{t("order.incl_vat")}</span>
                    )}
                  </span>
                  <RollingNumber
                    className="font-medium"
                    value={`${currency_symbol}${format(displayedAmountDetail.total)}`}
                  ></RollingNumber>
                </div>
                {/* 查看vat */}
                <div
                  className="flex justify-between items-center text-primary text-[14px] cursor-pointer select-none"
                  onClick={() => setVatVisible((prev) => !prev)}
                >
                  <span className="font-medium">{t("order.view_vat_breakdown")}</span>
                  <span
                    className={`font-medium transition-transform duration-300 ease-in-out ${
                      showVatBreakdown ? "rotate-180" : "rotate-0"
                    }`}
                  >
                    <DownOutlined />
                  </span>
                </div>
                <div
                  className={`space-y-2 overflow-hidden transition-all duration-300 ease-in-out ${
                    showVatBreakdown ? "max-h-[240px] opacity-100 mt-2" : "max-h-0 opacity-0 mt-0"
                  }`}
                >
                  {vatBreakdownList.map((item) => (
                    <div
                      key={item[0]}
                      className="flex min-h-[24px] items-center justify-between text-[14px] text-normal"
                    >
                      <span>{t(`${item[0]}`)}</span>
                      <RollingNumber value={`${currency_symbol}${format(item[1])}`}></RollingNumber>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 收款按钮 */}
        <div className="flex min-h-0 flex-none basis-[33%] flex-col overflow-y-auto">
          <div className="flex min-h-full flex-col">
            <CashReceiver
              className="min-h-[560px] flex-1"
              currencySymbol={currency_symbol}
              disabled={isManualOrder || !isCashPayment}
              totalAmount={displayedAmountDetail.total}
              onAmountChange={setReceivedAmount}
            ></CashReceiver>
            <div className="flex-none py-5 px-4">
              {/* 手动录单不支持打印账单小票，禁用打印入口。 */}

              <Button
                block={true}
                variant="solid"
                color="primary"
                disabled={isChargeDisabled}
                loading={isCreatingPaymentOrder}
                onClick={onClickCharge}
                style={{
                  height: "48px",
                  fontSize: "18px",
                  fontWeight: "600",
                }}
              >
                {t("table_manage.charge")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// UI组件 -- 订单汇总下订单列表的列表项
const SkuItemInOrderSummary = ({ skuItem, currencySymbol, isReducing = false, reduceCount, onReduceCountChange }) => {
  const { count, price, option_list } = skuItem;
  const displayCount = isReducing ? Number(reduceCount ?? count) : Number(count ?? 0);
  const isCancelledDetail = Number(skuItem.detail_type) === 2;
  const shouldStrikeThrough = isCancelledDetail || (isReducing && displayCount === 0);
  const productName = skuItem?.product_name ?? skuItem?.name ?? "";
  const skuName = skuItem?.sku_name ?? skuItem?.currentDish?.sku_name ?? "";
  const getOptions = () => {
    return (option_list ?? []).flatMap((option) =>
      (option?.option_item_list ?? []).map((opItem) => opItem.option_item_name ?? opItem.name),
    );
  };
  return (
    <div className="w-full flex items-center">
      {isReducing ? (
        <QuantityStepper
          className="mr-4"
          value={displayCount}
          min={0}
          max={Number(count ?? 0)}
          onChange={onReduceCountChange}
        />
      ) : (
        <div className="w-[38px] h-[28px] mr-4 border border-line text-center text-[15px] leading-[28px]">{count}</div>
      )}
      <div className={`flex-1 ${shouldStrikeThrough ? "line-through" : ""}`}>
        <p className="m-0! text-normal text-[14px]">
          {skuName === productName || !skuName ? productName : `${productName}(${skuName})`}
        </p>
        <p className="m-0! text-[12px] text-[#afafaf]">{getOptions().join(",")}</p>
      </div>
      {/* 菜品行金额统一展示门店货币符号，并在数量变化时滚动更新数字。 */}
      <RollingNumber
        className={`text-[15px] ${shouldStrikeThrough ? "line-through" : ""}`}
        value={`${currencySymbol}${format(price * displayCount)}`}
      />
    </div>
  );
};

SkuItemInOrderSummary.propTypes = {
  skuItem: PropTypes.object,
  currencySymbol: PropTypes.string,
  isReducing: PropTypes.bool,
  reduceCount: PropTypes.number,
  onReduceCountChange: PropTypes.func,
};
export default BillOut;
