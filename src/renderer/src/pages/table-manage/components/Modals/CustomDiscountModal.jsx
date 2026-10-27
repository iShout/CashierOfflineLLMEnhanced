import PropTypes from "prop-types";
import { Button, Form, InputNumber, Modal, Radio } from "antd";
import { useTranslation } from "react-i18next";
import { CUSTOM_DISCOUNT_TYPE } from "@shared/constants/enums";
import { useState } from "react";

const CustomDiscountModal = ({ open, onCancel, onConfirm }) => {
  const { t } = useTranslation();
  const [discountValue, setDiscountValue] = useState(null);
  const [customDiscountType, setCustomDiscountType] = useState(CUSTOM_DISCOUNT_TYPE.PERCENTAGE);

  // 每次关闭后恢复默认百分比，确保下次打开时已有明确预选项。
  const resetModalState = () => {
    setCustomDiscountType(CUSTOM_DISCOUNT_TYPE.PERCENTAGE);
    setDiscountValue(null);
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
          disabled={customDiscountType === null || discountValue === null || discountValue <= 0}
          onClick={() => onConfirm(customDiscountType, discountValue)}
        >
          {t("components.confirm")}
        </Button>,
      ]}
      title={<div className="text-[16px] font-semibold text-primary">{t("order.custom_discount")}</div>}
    >
      <Form layout="horizontal" className="px-4 pt-6 pb-2" labelCol={{ flex: "120px" }} colon={false} labelAlign="left">
        <Form.Item
          label={<span className="text-[14px] font-semibold text-primary">{t("order.discount_type")}</span>}
          className="mb-10"
        >
          <Radio.Group
            value={customDiscountType}
            onChange={(e) => {
              setCustomDiscountType(e.target.value);
              // 切换折扣类型后恢复为空值，让 0.00 继续作为占位提示。
              setDiscountValue(null);
            }}
          >
            <div className="flex flex-wrap gap-8 text-[16px]">
              <Radio value={CUSTOM_DISCOUNT_TYPE.PERCENTAGE}>{t("order.percentage")}</Radio>
              <Radio value={CUSTOM_DISCOUNT_TYPE.FIXED_AMOUNT}>{t("order.fixed_amount")}</Radio>
            </div>
          </Radio.Group>
        </Form.Item>

        <Form.Item label={<span className="text-[14px] font-semibold text-primary">{t("order.discount")}</span>}>
          <div className="flex items-center gap-3">
            <InputNumber
              onChange={(val) => setDiscountValue(val)}
              min={0}
              max={customDiscountType === CUSTOM_DISCOUNT_TYPE.PERCENTAGE ? 100 : undefined}
              controls={false}
              size="normal"
              value={discountValue}
              placeholder="0.00"
              precision={2}
              style={{ width: "100%" }}
            />
            <span className="text-[16px] text-normal">
              {customDiscountType === CUSTOM_DISCOUNT_TYPE.FIXED_AMOUNT ? "₱" : "%"}
            </span>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
};

CustomDiscountModal.propTypes = {
  open: PropTypes.bool,
  onCancel: PropTypes.func,
  onConfirm: PropTypes.func,
};

export default CustomDiscountModal;
