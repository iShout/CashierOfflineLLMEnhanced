import { Button, Modal, Steps } from "antd";
import { array, bool, func } from "prop-types";
import { useTranslation } from "react-i18next";

const OrderTrackModal = ({ open, historyList, onClose }) => {
  const { t } = useTranslation();
  const stepItems = historyList.map((item) => ({
    content: (
      <div className="w-full flex flex-row items-center">
        <div className="flex-1">
          <span className="block font-semibold text-[16px]">{item.remark || "-"}</span>
          <span className="text-[12px]">{item.waiter_name}</span>
        </div>
        <span className="flex-none">{item.create_time}</span>
      </div>
    ),
  }));
  return (
    <Modal
      open={open}
      closable={false}
      mask={{ blur: true }}
      title={<span className="text-primary">{t("table_manage.track_order")}</span>}
      footer={[
        <Button key="close" type="primary" className="w-full" onClick={onClose}>
          {t("components.close")}
        </Button>,
      ]}
    >
      <Steps type="dot" items={stepItems} orientation="vertical"></Steps>
    </Modal>
  );
};

OrderTrackModal.propTypes = {
  open: bool,
  historyList: array,
  onClose: func,
};

export default OrderTrackModal;
