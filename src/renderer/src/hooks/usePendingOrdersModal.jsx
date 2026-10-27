import { message } from "antd";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PendingOrdersModal from "@renderer/pages/table-manage/components/Modals/PendingOrdersModal";
import useUncompleteOrderCount from "@renderer/hooks/useUncompleteOrderCount";

const usePendingOrdersModal = ({ onOrderCanceled } = {}) => {
  const { t } = useTranslation();
  const { uncompleteOrderCount, refreshUncompleteOrderCount } = useUncompleteOrderCount();
  const [open, setOpen] = useState(false);
  const precheckPendingRef = useRef(false);

  const openPendingOrders = useCallback(() => {
    if (uncompleteOrderCount > 0) {
      setOpen(true);
      return;
    }

    if (precheckPendingRef.current) return;

    precheckPendingRef.current = true;

    // 当角标为 0 时，先向主进程确认真实未完成订单，避免状态订阅延迟导致误拦截。
    window.api.orders
      .getUncompleteOrders()
      .then((pendingOrders = []) => {
        if (pendingOrders.length === 0) {
          message.warning(t("tips.no_pending_orders"));
          return;
        }

        setOpen(true);
        refreshUncompleteOrderCount().catch((error) => {
          console.error(error);
        });
      })
      .catch((error) => {
        message.error(error?.message || String(error));
      })
      .finally(() => {
        precheckPendingRef.current = false;
      });
  }, [refreshUncompleteOrderCount, t, uncompleteOrderCount]);

  const closePendingOrders = useCallback(() => {
    setOpen(false);
  }, []);

  const pendingOrdersModalHolder = useMemo(
    () => <PendingOrdersModal open={open} cancelModal={closePendingOrders} onOrderCanceled={onOrderCanceled} />,
    [open, closePendingOrders, onOrderCanceled],
  );

  return {
    openPendingOrders,
    closePendingOrders,
    pendingOrdersModalHolder,
  };
};

export default usePendingOrdersModal;
