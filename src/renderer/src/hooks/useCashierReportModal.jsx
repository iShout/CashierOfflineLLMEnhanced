import { useCallback, useMemo, useState } from "react";
import CashierReportModal from "@renderer/components/CashierReportModal";

const noop = async () => {};

const useCashierReportModal = ({ currencySymbol = "", onClose = noop } = {}) => {
  const [reportDetail, setReportDetail] = useState(null);

  const openCashierReportModal = useCallback((report) => {
    setReportDetail(report ?? null);
  }, []);

  const closeCashierReportModal = useCallback(async () => {
    setReportDetail(null);
    await onClose();
  }, [onClose]);

  const cashierReportModalHolder = useMemo(
    () => (
      <CashierReportModal
        open={Boolean(reportDetail)}
        reportDetail={reportDetail}
        currencySymbol={currencySymbol}
        onClose={closeCashierReportModal}
      />
    ),
    [closeCashierReportModal, currencySymbol, reportDetail],
  );

  return {
    cashierReportModalHolder,
    closeCashierReportModal,
    openCashierReportModal,
  };
};

export default useCashierReportModal;
