import { Modal, Input, Button } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";
const { TextArea } = Input;

const MAX_REMARK_LENGTH = 500;

const AddOrderMarkModal = ({ onConfirm, showMarkModal, closeMarkModal, value }) => {
  const { t } = useTranslation();
  const [markContent, setMarkContent] = useState(value ?? "");

  const closedCallback = () => {
    setMarkContent(value ?? "");
  };
  return (
    <Modal
      width={390}
      title={
        <div className="border-b border-line text-primary pb-3">
          <span className="font-semibold">{t("table_manage.add_instructions")}</span>
        </div>
      }
      afterClose={closedCallback}
      mask={{ blur: true }}
      closable={{ "aria-label": t("components.close") }}
      open={showMarkModal}
      onOk={() => onConfirm(markContent)}
      onCancel={closeMarkModal}
      footer={[
        <Button key="submit" type="primary" className="w-full bg-primary!" onClick={() => onConfirm(markContent)}>
          {t("components.confirm")}
        </Button>,
      ]}
    >
      <div className="px-4">
        <span className="font-semibold">{t("table_manage.special_note")}</span>
      </div>
      <div className="py-2 px-4">
        <TextArea
          rows={4}
          placeholder={t("table_manage.instructions_hint")}
          value={markContent}
          maxLength={MAX_REMARK_LENGTH}
          showCount
          onChange={(event) => setMarkContent(event.target.value)}
        />
      </div>
    </Modal>
  );
};

AddOrderMarkModal.propTypes = {
  onConfirm: PropTypes.func,
  showMarkModal: PropTypes.bool,
  closeMarkModal: PropTypes.func,
  value: PropTypes.string,
};
export default AddOrderMarkModal;
