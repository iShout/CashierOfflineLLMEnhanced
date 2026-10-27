import { Button, Form, InputNumber, Modal } from "antd";
import PropTypes from "prop-types";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const CashOnHandModal = ({ open, loading, initialCashOnHand = 0, onAutoCalculate, onCancel, onConfirm }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;

    // Ant Design initialValues 不会随弹窗参数更新，打开时主动写入本次默认金额。
    form.setFields([
      {
        name: ["cash_on_hand"],
        value: initialCashOnHand,
        errors: [],
      },
    ]);
  }, [form, initialCashOnHand, open]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onConfirm(values.cash_on_hand);
  };

  return (
    <Modal
      centered
      width={420}
      open={open}
      title={<span className="text-primary font-semibold">{t("report.cash_on_hand")}</span>}
      confirmLoading={loading}
      mask={{ blur: true }}
      onCancel={onCancel}
      footer={[
        <Button key="auto-calculate" disabled={loading} onClick={onAutoCalculate}>
          {t("report.auto_calculate")}
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={handleOk}>
          {t("components.confirm")}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" initialValues={{ cash_on_hand: 0 }}>
        <Form.Item name="cash_on_hand" rules={[{ required: true, message: t("tips.input_amount") }]}>
          <InputNumber min={0} precision={2} controls={false} className="w-full!" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

CashOnHandModal.propTypes = {
  open: PropTypes.bool,
  loading: PropTypes.bool,
  initialCashOnHand: PropTypes.number,
  onAutoCalculate: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

export default CashOnHandModal;
