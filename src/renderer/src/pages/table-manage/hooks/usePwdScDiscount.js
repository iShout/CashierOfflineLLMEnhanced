import { useCallback, useMemo, useState } from "react";
import CONSTANT from "@renderer/const";

const { PWD, PWD_NUMBER, SC, SC_NUMBER } = CONSTANT.DISCOUNT_TYPE;
const TAX_RATE = 0.12;
const PWD_SC_PAY_RATE = 0.8;
export const PWD_SC_DISCOUNT_ID_USED_ERROR = "PWD_SC_DISCOUNT_ID_USED";
export const MANUAL_PWD_SC_AMOUNT_ERROR = "MANUAL_PWD_SC_AMOUNT_ERROR";

const getServerDiscountType = (discountType, discountNumber, guestNumber) => {
  if (discountType === PWD) {
    return discountNumber === guestNumber ? PWD : PWD_NUMBER;
  }

  if (discountType === SC) {
    return discountNumber === guestNumber ? SC : SC_NUMBER;
  }

  return discountType;
};

const roundAmount = (value) => Math.round(Number(value ?? 0));

const createEmptyTaxInfo = () => ({
  vatable_sales: 0,
  tax_amount: 0,
  vat_exempt_sales: 0,
  vat_exemption: 0,
  zero_rated_sales: 0,
  less_vat: 0,
  pwd_discount: 0,
  promo_discount: 0,
});

const isTaxEnabled = (restaurantSetting, vatRegisterStatus) =>
  restaurantSetting?.tax_fee !== CONSTANT.TAX_FEE.OFF && vatRegisterStatus !== CONSTANT.TAX_FEE.OFF;

// 复刻后端 /tax/order/amount 的普通订单 PWD/SC 金额和税费拆分。
export const calculateLocalPwdScDiscount = ({
  discountNumber,
  guestNumber,
  productAmount,
  restaurantSetting,
  serverDiscountType,
  vatRegisterStatus,
}) => {
  const amount = Math.max(0, Number(productAmount ?? 0));
  const isPeopleDiscount = [PWD_NUMBER, SC_NUMBER].includes(serverDiscountType);
  const normalizedGuestNumber = Math.max(1, Number(guestNumber ?? 1));
  const normalizedDiscountNumber = isPeopleDiscount
    ? Math.min(normalizedGuestNumber, Math.max(0, Number(discountNumber ?? 0)))
    : normalizedGuestNumber;
  const proportion = normalizedDiscountNumber / normalizedGuestNumber;
  const taxEnabled = isTaxEnabled(restaurantSetting, vatRegisterStatus);
  const taxInfo = createEmptyTaxInfo();

  if (taxEnabled) {
    const vatableSales = roundAmount(amount / (1 + TAX_RATE));
    const vatAmount = amount - vatableSales;
    taxInfo.vat_exempt_sales = isPeopleDiscount ? roundAmount(vatableSales * proportion) : vatableSales;
    taxInfo.vat_exemption = isPeopleDiscount ? roundAmount(vatAmount * proportion) : vatAmount;
    taxInfo.vatable_sales = vatableSales - taxInfo.vat_exempt_sales;
    taxInfo.tax_amount = vatAmount - taxInfo.vat_exemption;
    taxInfo.less_vat = taxInfo.vat_exemption;
    taxInfo.pwd_discount = taxInfo.vat_exempt_sales - roundAmount(taxInfo.vat_exempt_sales * PWD_SC_PAY_RATE);
  } else {
    taxInfo.pwd_discount = roundAmount(amount * (1 - PWD_SC_PAY_RATE) * proportion);
  }

  return {
    discountAmount: taxInfo.pwd_discount,
    taxInfo,
  };
};

// 手动录单按后端规则从实付金额反算折前金额，并校验不得低于系统商品金额。
export const calculateLocalManualPwdScDiscount = ({
  productAmount,
  restaurantSetting,
  totalAmount,
  vatRegisterStatus,
}) => {
  const originalProductAmount = Math.max(0, Number(productAmount ?? 0));
  const realAmount = Math.max(0, Number(totalAmount ?? 0));
  const taxEnabled = isTaxEnabled(restaurantSetting, vatRegisterStatus);
  const calculatedProductAmount = Math.floor(
    taxEnabled ? (realAmount / PWD_SC_PAY_RATE) * (1 + TAX_RATE) : realAmount / PWD_SC_PAY_RATE,
  );

  if (calculatedProductAmount < originalProductAmount) {
    const error = new Error(MANUAL_PWD_SC_AMOUNT_ERROR);
    error.code = MANUAL_PWD_SC_AMOUNT_ERROR;
    throw error;
  }

  const effectiveProductAmount = Math.max(originalProductAmount, calculatedProductAmount);
  const taxInfo = createEmptyTaxInfo();
  if (taxEnabled) {
    taxInfo.vat_exempt_sales = roundAmount(effectiveProductAmount / (1 + TAX_RATE));
    taxInfo.vat_exemption = effectiveProductAmount - taxInfo.vat_exempt_sales;
    taxInfo.less_vat = taxInfo.vat_exemption;
    taxInfo.pwd_discount = taxInfo.vat_exempt_sales - roundAmount(taxInfo.vat_exempt_sales * PWD_SC_PAY_RATE);
  } else {
    taxInfo.pwd_discount = effectiveProductAmount - roundAmount(effectiveProductAmount * PWD_SC_PAY_RATE);
  }

  return {
    discount_amount: taxInfo.pwd_discount,
    real_amount: realAmount,
    sub_amount: originalProductAmount,
    surcharge: Math.max(0, effectiveProductAmount - originalProductAmount),
    tax_info: taxInfo,
  };
};

// 本机 PWD/SC 无论网络状态都使用本地 BIR 配置、校验记录和金额算法。
export default function usePwdScDiscount({ orderInnerNo, productAmount, restaurantSetting, vatRegisterStatus }) {
  const [pwdScDiscount, setPwdScDiscount] = useState(null);

  const clearPwdScDiscount = useCallback(() => {
    setPwdScDiscount(null);
  }, []);

  const assertDiscountIdAvailable = useCallback(
    async (discountNos, discountType) => {
      const isAvailable = await window.api.orders.checkPwdScDiscountIdAvailable({
        discount_id: discountNos,
        discount_type: discountType,
        order_inner_no: orderInnerNo,
      });
      if (!isAvailable) {
        const error = new Error(PWD_SC_DISCOUNT_ID_USED_ERROR);
        error.code = PWD_SC_DISCOUNT_ID_USED_ERROR;
        throw error;
      }
    },
    [orderInnerNo],
  );

  const applyPwdScDiscount = useCallback(
    async ({ discountNumber, discountType, discountValidityPeriod, discounterName, discountNos, guestNumber }) => {
      const serverDiscountType = getServerDiscountType(discountType, discountNumber, guestNumber);
      await assertDiscountIdAvailable(discountNos, serverDiscountType);
      const { discountAmount, taxInfo } = calculateLocalPwdScDiscount({
        discountNumber,
        guestNumber,
        productAmount,
        restaurantSetting,
        serverDiscountType,
        vatRegisterStatus,
      });

      const nextPwdScDiscount = {
        discountAmount,
        discountNos,
        discountNumber,
        discountType,
        discountValidityPeriod,
        discounterName,
        serverDiscountType,
        taxInfo,
      };

      setPwdScDiscount(nextPwdScDiscount);

      return nextPwdScDiscount;
    },
    [assertDiscountIdAvailable, productAmount, restaurantSetting, vatRegisterStatus],
  );

  const calculateManualPwdScDiscount = useCallback(
    async ({ discountNos, discountType, manualProductAmount, totalAmount }) => {
      await assertDiscountIdAvailable(discountNos, discountType);
      return calculateLocalManualPwdScDiscount({
        productAmount: manualProductAmount,
        restaurantSetting,
        totalAmount,
        vatRegisterStatus,
      });
    },
    [assertDiscountIdAvailable, restaurantSetting, vatRegisterStatus],
  );

  const getPwdScPaymentPayload = useCallback(() => {
    if (!pwdScDiscount) return {};

    return {
      discount_amount: pwdScDiscount.discountAmount || undefined,
      discount_nos: pwdScDiscount.discountNos ? [pwdScDiscount.discountNos] : [],
      discount_number: pwdScDiscount.discountNumber,
      discount_type: pwdScDiscount.serverDiscountType,
      discount_validity_period: pwdScDiscount.discountValidityPeriod || undefined,
      discounter_name: pwdScDiscount.discounterName || undefined,
      tax_info: pwdScDiscount.taxInfo,
    };
  }, [pwdScDiscount]);

  const selectedPwdScType = useMemo(() => pwdScDiscount?.discountType ?? null, [pwdScDiscount]);

  return {
    applyPwdScDiscount,
    calculateManualPwdScDiscount,
    clearPwdScDiscount,
    getPwdScPaymentPayload,
    pwdScDiscount,
    selectedPwdScType,
  };
}
