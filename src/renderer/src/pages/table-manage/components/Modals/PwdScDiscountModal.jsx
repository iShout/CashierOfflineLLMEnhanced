import PropTypes from "prop-types";
import { Button, DatePicker, Form, Input, InputNumber, Modal } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CONSTANT from "@renderer/const";

const { SC } = CONSTANT.DISCOUNT_TYPE;
const DATE_FORMAT = "YYYY-MM-DD";

const getDiscountLabels = (discountType, t) => {
  if (discountType === SC) {
    return {
      id: t("order.sc_id"),
      name: t("order.sc_name"),
    };
  }

  return {
    id: t("order.pwd_id"),
    name: t("order.pwd_name"),
  };
};

const PwdScDiscountModal = ({ discountInfo, discountType, guestNumber, open, onCancel, onConfirm }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const labels = getDiscountLabels(discountType, t);

  // 打开时回填当前 PWD/SC 信息，方便重复点击后编辑。
  useEffect(() => {
    if (!open) return;

    form.setFieldsValue({
      discounter_name: discountInfo?.discounterName ?? "",
      discount_nos: discountInfo?.discountNos ?? "",
      discount_validity_period: discountInfo?.discountValidityPeriod
        ? dayjs(discountInfo.discountValidityPeriod, DATE_FORMAT)
        : null,
      discount_number: discountInfo?.discountNumber ?? guestNumber,
    });
  }, [discountInfo, form, guestNumber, open]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await onConfirm({
        discountType,
        discounterName: values.discounter_name,
        discountNos: values.discount_nos,
        discountValidityPeriod: values.discount_validity_period?.format(DATE_FORMAT),
        discountNumber: values.discount_number ?? 1,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      width={540}
      centered
      open={open}
      mask={{ blur: true }}
      closable={{ "aria-label": t("components.close") }}
      onCancel={onCancel}
      title={<div className="text-[16px] font-semibold text-primary">{t("table_manage.customer_information")}</div>}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {t("components.cancel")}
        </Button>,
        <Button key="submit" type="primary" className="bg-primary" loading={submitting} onClick={handleSubmit}>
          {t("components.submit")}
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="horizontal"
        className="px-4 pt-6 pb-2"
        labelCol={{ flex: "220px" }}
        colon={false}
        labelAlign="left"
      >
        {guestNumber > 1 && (
          <Form.Item
            label={
              <span className="text-[14px] font-semibold text-primary">{t("table_manage.num_of_discount_rec")}</span>
            }
            name="discount_number"
            rules={[
              {
                required: true,
                message: t("tips.field_required", { field: t("table_manage.num_of_discount_rec") }),
              },
            ]}
          >
            <InputNumber min={1} max={guestNumber} precision={0} controls={false} className="w-full" />
          </Form.Item>
        )}

        <Form.Item
          label={<span className="text-[14px] font-semibold text-primary">{labels.name}</span>}
          name="discounter_name"
          rules={[{ required: true, message: t("tips.field_required", { field: labels.name }) }]}
        >
          <Input maxLength={50} allowClear autoComplete="off" />
        </Form.Item>

        {discountType !== SC && (
          <Form.Item
            label={<span className="text-[14px] font-semibold text-primary">{t("order.valid_date")}</span>}
            name="discount_validity_period"
            rules={[{ required: true, message: t("tips.field_required", { field: t("order.valid_date") }) }]}
          >
            <DatePicker format={DATE_FORMAT} className="w-full" />
          </Form.Item>
        )}

        <Form.Item
          label={<span className="text-[14px] font-semibold text-primary">{labels.id}</span>}
          name="discount_nos"
          rules={[{ required: true, message: t("tips.input_number") }]}
        >
          <Input maxLength={30} allowClear autoComplete="off" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

PwdScDiscountModal.propTypes = {
  discountInfo: PropTypes.object,
  discountType: PropTypes.number,
  guestNumber: PropTypes.number,
  open: PropTypes.bool,
  onCancel: PropTypes.func,
  onConfirm: PropTypes.func,
};

export default PwdScDiscountModal;
