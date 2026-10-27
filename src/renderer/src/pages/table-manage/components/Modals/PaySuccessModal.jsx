import PropTypes from "prop-types";
import { Button, Modal } from "antd";
import { useTranslation } from "react-i18next";
import successIcon from "@renderer/assets/success-icon.svg";

const PaySuccessModal = ({ onComplete, open }) => {
  const { t } = useTranslation();

  return (
    <Modal
      width={620}
      centered
      open={open}
      mask={{ blur: true }}
      closable={false}
      footer={
        <div className="flex justify-center">
          <Button type="primary" className="bg-primary" onClick={onComplete}>
            {t("components.complete")}
          </Button>
        </div>
      }
    >
      <div className="px-4 pt-6 pb-2 flex flex-col items-center justify-center">
        <span className="mb-3 flex items-center justify-center overflow-hidden">
          <img
            src={successIcon}
            alt="Payment Success"
            style={{
              width: 140,
              height: 140,
              maxWidth: "none",
              flex: "0 0 auto",
            }}
            aria-hidden="true"
          />
        </span>
        <span className="text-[28px]">{t("table_manage.payment_success")}</span>
        <span className="text-[16px] text-info">{t("table_manage.payment_complete_tip")}</span>
      </div>
    </Modal>
  );
};

PaySuccessModal.propTypes = {
  onComplete: PropTypes.func,
  open: PropTypes.bool,
};

export default PaySuccessModal;
