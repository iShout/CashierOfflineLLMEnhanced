import PropTypes from "prop-types";
import { Button, Form, InputNumber, Modal, Radio } from "antd";
import { useTranslation } from "react-i18next";
import { SERVICE_FEE_TYPE } from "@shared/constants/enums";
import { useState } from "react";

const ServiceFeeModal = ({ open, onCancel, onConfirm }) => {
  const { t } = useTranslation();
  const [serviceFeeValue, setServiceFeeValue] = useState(null);
  const [customServiceFeeType, setCustomServiceFeeType] = useState(SERVICE_FEE_TYPE.PERCENTAGE);

  // 服务费输入字段根据类型显示费率或固定金额，避免沿用折扣字段文案。
  const serviceFeeValueLabel =
    customServiceFeeType === SERVICE_FEE_TYPE.PERCENTAGE ? t("order.service_fee_rate") : t("order.service_fee_amount");

  // 每次关闭后恢复默认百分比，避免上一次选择影响下次打开。
  const resetModalState = () => {
    setCustomServiceFeeType(SERVICE_FEE_TYPE.PERCENTAGE);
    setServiceFeeValue(null);
  };

  return (
    <Modal
      width={500}
      centered
      open={open}
      mask={{ blur: true }}
      closable={{ "aria-label": t("components.close") }}
      onCancel={onCancel}
      afterClose={resetModalState}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {t("components.cancel")}
        </Button>,
        <Button
          key="confirm"
          type="primary"
          className="bg-primary"
          disabled={customServiceFeeType === null || serviceFeeValue === null || serviceFeeValue <= 0}
          onClick={() => onConfirm(customServiceFeeType, serviceFeeValue)}
        >
          {t("components.confirm")}
        </Button>,
      ]}
      title={<div className="text-[16px] font-semibold text-primary">{t("order.service_fee")}</div>}
    >
      <Form layout="horizontal" className="px-4 pt-6 pb-2" labelCol={{ flex: "120px" }} colon={false} labelAlign="left">
        <Form.Item
          label={<span className="text-[14px] font-semibold text-primary">{t("order.service_fee_type_label")}</span>}
          className="mb-10"
        >
          <Radio.Group
            value={customServiceFeeType}
            onChange={(e) => {
              setCustomServiceFeeType(e.target.value);
              // 切换服务费类型后恢复为空值，让 0.00 继续作为占位提示。
              setServiceFeeValue(null);
            }}
          >
            <div className="flex flex-wrap gap-8 text-[16px]">
              <Radio value={SERVICE_FEE_TYPE.PERCENTAGE}>{t("order.percentage")}</Radio>
              <Radio value={SERVICE_FEE_TYPE.FIXED_AMOUNT}>{t("order.fixed_amount")}</Radio>
            </div>
          </Radio.Group>
        </Form.Item>

        <Form.Item label={<span className="text-[14px] font-semibold text-primary">{serviceFeeValueLabel}</span>}>
          <div className="flex items-center gap-3">
            <InputNumber
              onChange={(val) => setServiceFeeValue(val)}
              min={0}
              max={customServiceFeeType === SERVICE_FEE_TYPE.PERCENTAGE ? 100 : undefined}
              controls={false}
              size="normal"
              value={serviceFeeValue}
              placeholder="0.00"
              precision={2}
              style={{ width: "100%" }}
            />
            <span className="text-[16px] text-normal">
              {customServiceFeeType === SERVICE_FEE_TYPE.FIXED_AMOUNT ? "₱" : "%"}
            </span>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
};

ServiceFeeModal.propTypes = {
  open: PropTypes.bool,
  onCancel: PropTypes.func,
  onConfirm: PropTypes.func,
};

export default ServiceFeeModal;
