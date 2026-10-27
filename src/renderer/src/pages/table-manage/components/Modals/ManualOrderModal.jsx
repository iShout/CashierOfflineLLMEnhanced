import PropTypes from "prop-types";
import { Button, DatePicker, Form, Input, InputNumber, Modal, Radio, Select } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CONSTANT from "@renderer/const";
import useStore from "@renderer/store";
import { SYSTEM_RECEIPT_NO_LENGTH } from "@shared/constants/enums";
import { getManualOrderTypeOptions } from "../../orderTypeOptions";

const { PWD, SC } = CONSTANT.DISCOUNT_TYPE;
const DISCOUNT_OFF = 0;
const DATE_FORMAT = "YYYY-MM-DD";
const MANUAL_RECEIPT_NO_PATTERN = new RegExp(`^[A-Za-z0-9-]{1,${SYSTEM_RECEIPT_NO_LENGTH}}$`);

const getInitialValues = () => ({
  discount_type: DISCOUNT_OFF,
});

const toMinorUnits = (amount) => Math.round(Number(amount ?? 0) * 100);

const isPhilippines = (restaurantSetting) =>
  !restaurantSetting?.country_name || restaurantSetting.country_name === "Philippines";

const ManualOrderModal = ({ canUsePwdScDiscount = false, open, onCancel, onConfirm }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const restaurantSetting = useStore((state) => state.restaurantSetting);
  const isOpenFee = restaurantSetting?.tax_fee === CONSTANT.TAX_FEE.ON;
  const showPwdScFields = canUsePwdScDiscount && isPhilippines(restaurantSetting);
  const orderTypeOptions = useMemo(() => getManualOrderTypeOptions(restaurantSetting, t), [restaurantSetting, t]);
  const discountType = Form.useWatch("discount_type", form);

  // 弹窗打开时重置为默认表单，确认时由父页面通过 IPC 校验手写 SI/OR。
  useEffect(() => {
    if (!open) return;

    form.resetFields();
    form.setFieldsValue(getInitialValues());
  }, [form, open]);

  const handleSubmit = async () => {
    const values = await form.validateFields();

    setSubmitting(true);
    try {
      await onConfirm({
        discountNos: values.discount_nos,
        discountType: showPwdScFields ? values.discount_type : DISCOUNT_OFF,
        discountValidityPeriod: showPwdScFields ? values.discount_validity_period?.format(DATE_FORMAT) : undefined,
        discounterName: showPwdScFields ? values.discounter_name : undefined,
        orderChannel: values.order_channel,
        receiptNo: values.receipt_no,
        remark: values.remark,
        totalAmount: toMinorUnits(values.total_amount),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      width={522}
      centered
      open={open}
      title={<div className="text-[16px] font-semibold text-primary">{t("table_manage.manual_order")}</div>}
      mask={{ blur: true, closable: false }}
      closable={{ "aria-label": t("components.close") }}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {t("components.cancel")}
        </Button>,
        <Button key="submit" type="primary" className="bg-primary" loading={submitting} onClick={handleSubmit}>
          {t("components.confirm")}
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="horizontal"
        className="px-6 pt-6 pb-2"
        labelCol={{ flex: "180px" }}
        labelAlign="left"
        colon={false}
        initialValues={getInitialValues()}
      >
        {isOpenFee && (
          <Form.Item
            label={<span className="text-[14px] font-semibold text-primary">{t("table_manage.manual_si_or")}</span>}
            name="receipt_no"
            required
            rules={[
              {
                required: true,
                message: t("tips.field_required", { field: t("table_manage.manual_si_or") }),
              },
              {
                pattern: MANUAL_RECEIPT_NO_PATTERN,
                message: t("tips.manual_receipt_format"),
              },
              {
                validator: (_, value) => {
                  const normalizedValue = String(value || "").trim();
                  if (normalizedValue.length === SYSTEM_RECEIPT_NO_LENGTH && /^\d+$/.test(normalizedValue)) {
                    // 手写发票号不能使用系统自动 receipt_no 的纯数字格式，避免与本机自增号混淆。
                    return Promise.reject(
                      new Error(t("tips.manual_receipt_numeric_format", { count: SYSTEM_RECEIPT_NO_LENGTH })),
                    );
                  }

                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input maxLength={SYSTEM_RECEIPT_NO_LENGTH} allowClear />
          </Form.Item>
        )}

        <Form.Item
          label={<span className="text-[14px] font-semibold text-primary">{t("order.order_type")}</span>}
          name="order_channel"
          required
          rules={[{ required: true, message: t("tips.field_required", { field: t("order.order_type") }) }]}
        >
          <Select options={orderTypeOptions} />
        </Form.Item>

        {showPwdScFields && (
          <Form.Item
            label={<span className="text-[14px] font-semibold text-primary">PWD/SC</span>}
            name="discount_type"
            required
          >
            <Radio.Group>
              <Radio value={DISCOUNT_OFF}>{t("components.off")}</Radio>
              <Radio value={PWD}>{t("order.pwd")}</Radio>
              <Radio value={SC}>{t("order.sc")}</Radio>
            </Radio.Group>
          </Form.Item>
        )}

        {showPwdScFields && discountType === SC && (
          <>
            <Form.Item
              label={<span className="text-[14px] font-semibold text-primary">{t("order.sc_name")}</span>}
              name="discounter_name"
              required
              rules={[
                { required: true, message: t("tips.field_required", { field: t("order.sc_name") }) },
                { whitespace: true, message: t("tips.field_required", { field: t("order.sc_name") }) },
              ]}
            >
              <Input maxLength={50} allowClear autoComplete="off" />
            </Form.Item>
            <Form.Item
              label={<span className="text-[14px] font-semibold text-primary">{t("order.sc_id")}</span>}
              name="discount_nos"
              required
              rules={[{ required: true, whitespace: true, message: t("tips.input_number") }]}
            >
              <Input maxLength={30} allowClear autoComplete="off" />
            </Form.Item>
          </>
        )}

        {showPwdScFields && discountType === PWD && (
          <>
            <Form.Item
              label={<span className="text-[14px] font-semibold text-primary">{t("order.pwd_name")}</span>}
              name="discounter_name"
              required
              rules={[
                { required: true, message: t("tips.field_required", { field: t("order.pwd_name") }) },
                { whitespace: true, message: t("tips.field_required", { field: t("order.pwd_name") }) },
              ]}
            >
              <Input maxLength={50} allowClear autoComplete="off" />
            </Form.Item>
            <Form.Item
              label={<span className="text-[14px] font-semibold text-primary">{t("order.valid_date")}</span>}
              name="discount_validity_period"
              required
              rules={[{ required: true, message: t("tips.field_required", { field: t("order.valid_date") }) }]}
            >
              <DatePicker format={DATE_FORMAT} className="w-full" />
            </Form.Item>
            <Form.Item
              label={<span className="text-[14px] font-semibold text-primary">{t("order.pwd_id")}</span>}
              name="discount_nos"
              required
              rules={[{ required: true, whitespace: true, message: t("tips.input_number") }]}
            >
              <Input maxLength={30} allowClear autoComplete="off" />
            </Form.Item>
          </>
        )}

        <Form.Item
          label={<span className="text-[14px] font-semibold text-primary">{t("order.total_amount")}</span>}
          name="total_amount"
          required
          rules={[{ required: true, message: t("tips.input_amount") }]}
        >
          <InputNumber
            min={0}
            max={100000}
            precision={2}
            controls={false}
            className="w-full"
            style={{ width: "100%" }}
          />
        </Form.Item>

        <Form.Item
          label={<span className="text-[14px] font-semibold text-primary">{t("table_manage.remark")}</span>}
          name="remark"
        >
          <Input.TextArea maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
};

ManualOrderModal.propTypes = {
  canUsePwdScDiscount: PropTypes.bool,
  onCancel: PropTypes.func,
  onConfirm: PropTypes.func,
  open: PropTypes.bool,
};

export default ManualOrderModal;
