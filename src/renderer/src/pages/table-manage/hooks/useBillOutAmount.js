import { useMemo } from "react";
import CONSTANT from "@renderer/const";
import { CUSTOM_DISCOUNT_TYPE, SERVICE_FEE_TYPE } from "@shared/constants/enums";

const TAX_RATE = 0.12;

const toAmount = (value) => {
  const amount = Number(value ?? 0);

  return Number.isFinite(amount) ? amount : 0;
};

const normalizeTaxInfo = (taxInfo) => ({
  vatable_sales: toAmount(taxInfo?.vatable_sales ?? taxInfo?.vatableSales),
  tax_amount: toAmount(taxInfo?.tax_amount ?? taxInfo?.taxAmount),
  vat_exempt_sales: toAmount(taxInfo?.vat_exempt_sales ?? taxInfo?.vatExemptSales),
  vat_exemption: toAmount(taxInfo?.vat_exemption ?? taxInfo?.vatExemption),
  zero_rated_sales: toAmount(taxInfo?.zero_rated_sales ?? taxInfo?.zeroRatedSales),
  less_vat: toAmount(taxInfo?.less_vat ?? taxInfo?.lessVat),
  pwd_discount: toAmount(taxInfo?.pwd_discount ?? taxInfo?.pwdDiscount),
  promo_discount: toAmount(taxInfo?.promo_discount ?? taxInfo?.promoDiscount),
});

const calculateIncludedVat = (amount) => {
  const taxableAmount = Math.max(0, toAmount(amount));
  const vatableSales = Math.round(taxableAmount / (1 + TAX_RATE));

  return {
    vatable_sales: vatableSales,
    tax_amount: taxableAmount - vatableSales,
    vat_exempt_sales: 0,
    vat_exemption: 0,
    zero_rated_sales: 0,
    less_vat: 0,
  };
};

const isTaxEnabled = (restaurantSetting, vatRegisterStatus) => {
  const taxFee = restaurantSetting?.tax_fee;

  // VAT 注册状态以 Zustand 的 BIR 配置为准；仅 NON-VAT 状态关闭 VAT 计算。
  return taxFee !== CONSTANT.TAX_FEE.OFF && vatRegisterStatus !== CONSTANT.TAX_FEE.OFF;
};

const getEffectiveServiceFeeConfig = ({ isQueueOrder, restaurantSetting, serviceFee, serviceFeeType }) => {
  if (isQueueOrder || restaurantSetting?.service_fee_status === CONSTANT.SERVICE_FEE_STATUS.CLOSE) {
    return {
      effectiveServiceFee: 0,
      effectiveServiceFeeType: null,
    };
  }

  if (restaurantSetting?.service_fee_type === SERVICE_FEE_TYPE.CUSTOM) {
    return {
      effectiveServiceFee: toAmount(serviceFee),
      effectiveServiceFeeType: serviceFeeType,
    };
  }

  return {
    effectiveServiceFee: toAmount(restaurantSetting?.service_fee),
    effectiveServiceFeeType: restaurantSetting?.service_fee_type,
  };
};

const calculateServiceFee = ({ effectiveServiceFee, effectiveServiceFeeType, serviceFeeBase }) => {
  if (SERVICE_FEE_TYPE.FIXED_AMOUNT === effectiveServiceFeeType) {
    return effectiveServiceFee;
  }

  if (SERVICE_FEE_TYPE.PERCENTAGE === effectiveServiceFeeType) {
    return Math.round(serviceFeeBase * effectiveServiceFee);
  }

  return 0;
};

export default function useBillOutAmount({
  customDiscountType,
  discount,
  isQueueOrder,
  productsTotalAmount,
  pwdScDiscount,
  restaurantSetting,

  serviceFee,
  serviceFeeType,
  vatRegisterStatus,
}) {
  return useMemo(() => {
    const subTotal = toAmount(productsTotalAmount);
    const taxEnabled = isTaxEnabled(restaurantSetting, vatRegisterStatus);
    const includedVatTaxInfo = taxEnabled ? calculateIncludedVat(subTotal) : null;
    const { effectiveServiceFee, effectiveServiceFeeType } = getEffectiveServiceFeeConfig({
      isQueueOrder,
      restaurantSetting,
      serviceFee,
      serviceFeeType,
    });
    // 含税商品的百分比服务费必须以 VATable Sales（未税销售额）为基数。
    const serviceFeeBase = includedVatTaxInfo?.vatable_sales ?? subTotal;
    const serviceFeeValue = calculateServiceFee({
      effectiveServiceFee,
      effectiveServiceFeeType,
      serviceFeeBase,
    });
    const discountValue =
      CUSTOM_DISCOUNT_TYPE.FIXED_AMOUNT === customDiscountType
        ? toAmount(discount) * 100
        : subTotal * toAmount(discount);
    const pwdScTaxInfo = normalizeTaxInfo(pwdScDiscount?.taxInfo);
    const pwdScDiscountAmount = toAmount(pwdScDiscount?.discountAmount);
    const isNonVat = vatRegisterStatus === CONSTANT.TAX_FEE.OFF;
    const pwdScLessVat = isNonVat ? 0 : pwdScTaxInfo.less_vat;
    const promoDiscount = pwdScDiscount ? 0 : discountValue;
    const activeCouponAmount = 0;
    const total = subTotal - promoDiscount - activeCouponAmount - pwdScDiscountAmount - pwdScLessVat + serviceFeeValue;
    let taxInfo = taxEnabled
      ? includedVatTaxInfo
      : {
          vatable_sales: 0,
          tax_amount: 0,
          vat_exempt_sales: 0,
          vat_exemption: 0,
          zero_rated_sales: 0,
          less_vat: 0,
        };

    if (pwdScDiscount?.taxInfo) {
      // PWD/SC 的 VAT exemption、Less VAT 与折扣金额沿用本地计算结果。
      taxInfo = {
        ...pwdScTaxInfo,
        pwd_discount: pwdScTaxInfo.pwd_discount || pwdScDiscountAmount,
      };
    }

    if (isNonVat) {
      // NON-VAT 的 Bill Out 税费全部归零；PWD/SC 仅把折后实付归入免税销售额。
      taxInfo = {
        ...taxInfo,
        vatable_sales: 0,
        tax_amount: 0,
        vat_exempt_sales: pwdScDiscount ? total : 0,
        vat_exemption: 0,
        zero_rated_sales: 0,
        less_vat: 0,
      };
    }

    return {
      sub_total: subTotal,
      promo_discount: promoDiscount,
      coupon_amount: activeCouponAmount,
      coupon_code: undefined,
      pwd_sc_discount: pwdScDiscountAmount,
      service_fee: serviceFeeValue,
      total,
      tax_info: taxInfo,
    };
  }, [
    customDiscountType,
    discount,
    isQueueOrder,
    productsTotalAmount,
    pwdScDiscount,
    restaurantSetting,

    serviceFee,
    serviceFeeType,
    vatRegisterStatus,
  ]);
}
