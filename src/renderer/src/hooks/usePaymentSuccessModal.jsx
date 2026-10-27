import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import PaySuccessModal from "@renderer/pages/table-manage/components/Modals/PaySuccessModal";

const usePaymentSuccessModal = ({ onComplete } = {}) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const openPaymentSuccessModal = useCallback(() => {
    setOpen(true);
  }, []);

  const handleComplete = useCallback(() => {
    setOpen(false);
    if (onComplete) {
      onComplete();
      return;
    }
    navigate("/");
  }, [navigate, onComplete]);

  const paymentSuccessModalHolder = useMemo(
    () => <PaySuccessModal open={open} onComplete={handleComplete} />,
    [handleComplete, open],
  );

  return {
    openPaymentSuccessModal,
    paymentSuccessModalHolder,
  };
};

export default usePaymentSuccessModal;
