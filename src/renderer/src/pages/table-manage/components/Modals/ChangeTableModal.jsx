import { Button, Form, Modal, Select } from "antd";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";
import { useState, useEffect } from "react";

const ChangeTableModal = ({ open, onCancel, onConfirm }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  const [areaList, setAreaList] = useState([]); // area列表
  const [tableList, setTableList] = useState([]);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const resetForm = () => {
    form.resetFields();
    setTableList([]);
  };

  const handleCancel = () => {
    resetForm();
    onCancel?.();
  };

  const handleConfirm = async () => {
    const values = await form.validateFields();

    try {
      setConfirmLoading(true);
      await onConfirm?.(values);
      resetForm();
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleAreaChange = (areaUuid) => {
    const selectedArea = areaList.find((area) => area.area_uuid === areaUuid);
    setTableList(selectedArea?.table_info_list ?? []);
    form.setFieldValue("table", undefined);
  };

  useEffect(() => {
    window.api.orders.getTableAreaList().then((areaList) => {
      console.log(areaList, "Area List");
      setAreaList(areaList);
    });
  }, []);

  return (
    <Modal
      centered
      width={420}
      title={<span className="font-semibold text-primary text-[18px]">{t("order_list.change_table")}</span>}
      open={open}
      onCancel={handleCancel}
      mask={{ blur: true }}
      footer={[
        <Button key="submit" type="primary" onClick={handleConfirm} loading={confirmLoading} className="w-full">
          {t("components.save_changes")}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Form.Item label={t("table_manage.area")} name="area" rules={[{ required: true }]}>
          <Select
            placeholder={t("table_manage.area")}
            fieldNames={{
              label: "area_name",
              value: "area_uuid",
            }}
            options={areaList}
            onChange={handleAreaChange}
          />
        </Form.Item>

        <Form.Item label={t("order.table_number")} name="table" rules={[{ required: true }]}>
          <Select
            placeholder={t("order.table_number")}
            fieldNames={{
              label: "name",
              value: "id",
            }}
            options={tableList}
          />
        </Form.Item>

        <p className="text-info-dark">{t("table_manage.additional_order_tip")}</p>
      </Form>
    </Modal>
  );
};

ChangeTableModal.propTypes = {
  open: PropTypes.bool,
  onCancel: PropTypes.func,
  onConfirm: PropTypes.func,
};

export default ChangeTableModal;
