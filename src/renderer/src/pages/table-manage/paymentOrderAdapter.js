const CUSTOM_DISCOUNT_TYPE = 2;

// 构建线下 CASH 支付订单参数：这份结构用于本地数据库落库，保持原有字段模型。
export function buildOfflinePaymentOrderParams({
  amountDetail,
  discount,
  guestNumber,
  orderInnerNo,
  receivedAmount,
  selectedPaymentChannel,
  statusType,
  user,
  vatRegisterStatus = 1,
  voucherPaymentPayload = {},
  pwdScPaymentPayload = {},
}) {
  const { sub_total, total, service_fee, promo_discount, tax_info } = amountDetail;
  const paymentTaxInfo = pwdScPaymentPayload.tax_info ?? tax_info;
  const channelCode = selectedPaymentChannel?.channel_code ?? selectedPaymentChannel?.code ?? "";

  return {
    restaurant_id: user.restaurant_id,
    order_inner_no: orderInnerNo,
    // 本地线下落库沿用原模型：amount 是商品小计，不包含服务费。
    amount: sub_total,
    // 离线 CASH 也沿用页面当前支付渠道，避免把餐厅自定义离线通道误写成现金 code。
    channel_code: channelCode,
    // 线下本地 real_amount 是最终应收金额：商品小计 - 折扣 + 服务费。
    real_amount: total,
    discount_amount: pwdScPaymentPayload.discount_amount,
    discount_no: pwdScPaymentPayload.discount_nos?.length
      ? JSON.stringify(pwdScPaymentPayload.discount_nos)
      : undefined,
    discount_nos: pwdScPaymentPayload.discount_nos,
    discount_number: pwdScPaymentPayload.discount_number,
    discount_type: pwdScPaymentPayload.discount_type ?? (discount !== 0 ? CUSTOM_DISCOUNT_TYPE : null),
    discount_validity_period: pwdScPaymentPayload.discount_validity_period,
    discounter_name: pwdScPaymentPayload.discounter_name,
    real_tax_amount: paymentTaxInfo.tax_amount,
    real_service_fee: service_fee,
    cash_receipt_amount: receivedAmount,
    waiter_id: user.id,
    real_customer_num: guestNumber,
    promo_discount: promo_discount,
    tax_info: paymentTaxInfo,
    vat_register_status: vatRegisterStatus,
    status_type: statusType,
    operator_name: user.name,
    coupon_amount: voucherPaymentPayload.coupon_amount,
    coupon_code: voucherPaymentPayload.coupon_code,
  };
}
