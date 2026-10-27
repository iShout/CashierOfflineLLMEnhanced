import { useCallback, useMemo, useState } from "react";
import CashOnHandModal from "@renderer/components/CashOnHandModal";

const noop = async () => {};

const useCashOnHandModal = ({ loading = false, onAutoCalculate = noop, onCancel = noop, onConfirm = noop } = {}) => {
  const [open, setOpen] = useState(false);
  const [initialCashOnHand, setInitialCashOnHand] = useState(0);

  const openCashOnHandModal = useCallback((amount = 0) => {
    // 支持不同业务入口在打开弹窗时传入当前应展示的手头现金。
    setInitialCashOnHand(amount);
    setOpen(true);
  }, []);

  const closeCashOnHandModal = useCallback(() => {
    setOpen(false);
  }, []);

  const handleAutoCalculate = useCallback(async () => {
    await onAutoCalculate();
  }, [onAutoCalculate]);

  const handleCancel = useCallback(async () => {
    await onCancel();
  }, [onCancel]);

  const handleConfirm = useCallback(
    async (cashOnHand) => {
      await onConfirm(cashOnHand);
    },
    [onConfirm],
  );

  const cashOnHandModalHolder = useMemo(
    () => (
      <CashOnHandModal
        open={open}
        loading={loading}
        initialCashOnHand={initialCashOnHand}
        onAutoCalculate={handleAutoCalculate}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    ),
    [handleAutoCalculate, handleCancel, handleConfirm, initialCashOnHand, loading, open],
  );

  return {
    cashOnHandModalHolder,
    closeCashOnHandModal,
    openCashOnHandModal,
  };
};

export default useCashOnHandModal;
