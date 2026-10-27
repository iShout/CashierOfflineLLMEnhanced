import { Input, message, Modal } from "antd";
import { useTranslation } from "react-i18next";

const { TextArea } = Input;

const useCancelOrder = () => {
  const { t } = useTranslation();
  const [modal, modalContextHolder] = Modal.useModal();
  const [messageApi, messageContextHolder] = message.useMessage();

  const cancelOrder = ({ orderInnerNo, onSuccess }) => {
    if (!orderInnerNo) {
      messageApi.error("Please select an order first.");
      return;
    }

    let cancelRemark = "";

    modal.confirm({
      title: t("components.tips"),
      content: (
        <div>
          <p>{t("tips.sure_cancel_order")}</p>
          <TextArea
            rows={2}
            placeholder={t("order.cancel_order_note")}
            onChange={(event) => {
              cancelRemark = event.target.value;
            }}
          />
        </div>
      ),
      okText: t("components.confirm"),
      cancelText: t("components.cancel"),
      onOk: () =>
        window.api.orders
          .orderCancel({
            cancel_remark: cancelRemark,
            order_inner_no: orderInnerNo,
          })
          .then(() => {
            messageApi.success(t("tips.cancel_order_successfully"));
            return onSuccess?.();
          })
          .catch((error) => {
            messageApi.error(error?.message || String(error));
            return Promise.reject(error);
          }),
    });
  };

  return {
    cancelOrder,
    contextHolder: (
      <>
        {modalContextHolder}
        {messageContextHolder}
      </>
    ),
  };
};

export default useCancelOrder;
