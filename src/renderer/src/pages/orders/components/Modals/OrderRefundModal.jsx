import { Button, Modal, Input } from "antd";
const { TextArea } = Input;
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";
import { useState } from "react";

const OrderRefundModal = ({ open, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const [remark, setRemark] = useState("");

  const handleConfirm = async () => {
    await onConfirm(remark);
    setRemark("");
  };

  const handleCancel = () => {
    setRemark("");
    onCancel();
  };

  return (
    <Modal
      open={open}
      closable={false}
      mask={{ blur: true }}
      afterOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setRemark("");
        }
      }}
      title={t("order.refund_confirm")}
      footer={
        <div className="w-full flex flex-row gap-3">
          <div className="flex-1"></div>
          <Button
            variant="outlined"
            color="primary"
            size="mini"
            onClick={handleCancel}
          >
            {t("components.cancel")}
          </Button>
          <Button type="primary" size="mini" onClick={handleConfirm}>
            {t("components.confirm")}
          </Button>
        </div>
      }
    >
      <p>{t("order.refund_tip")}</p>
      <TextArea
        rows={2}
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
      ></TextArea>
    </Modal>
  );
};

OrderRefundModal.propTypes = {
  open: PropTypes.bool,
  onConfirm: PropTypes.func,
  onCancel: PropTypes.func,
};
export default OrderRefundModal;
