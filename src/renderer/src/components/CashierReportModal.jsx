import { Button, Modal, Table } from "antd";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { format } from "@renderer/utils/MoneyUtils";

const CashierReportModal = ({ open, reportDetail, currencySymbol, onClose }) => {
  const { t } = useTranslation();
  const transactionSummary = [
    [t("report.opening_fund"), reportDetail?.opening_fund],
    [t("report.cash_on_hand"), reportDetail?.cash_on_hand],
    [t("report.less_withdrawal"), reportDetail?.less_withdrawal],
    [t("report.payment_received"), reportDetail?.payment_received],
    [t("report.short_over"), reportDetail?.short_or_over],
  ];
  const columns = [
    {
      title: t("report.payment_type"),
      dataIndex: "channel_name",
      key: "channel_name",
    },
    {
      title: t("report.no_of_transactions"),
      dataIndex: "transaction_count",
      key: "transaction_count",
    },
    {
      title: t("report.total_amount"),
      dataIndex: "transaction_amount",
      key: "transaction_amount",
      render: (value) => format(value),
    },
  ];

  return (
    <Modal
      centered
      width={850}
      open={open}
      title={t("menu.cashier_report")}
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          {t("components.close")}
        </Button>,
      ]}
      onCancel={onClose}
    >
      <div className="max-h-[70vh] overflow-y-auto">
        <div className="mb-3 border-b border-line pb-3 text-[16px] font-semibold">
          {t("report.transaction_summary")}
        </div>
        <div className="mb-6 grid grid-cols-5 gap-3">
          {transactionSummary.map(([label, value]) => (
            <div key={label} className="border-r border-line pr-3 last:border-r-0">
              <p className="m-0! text-[13px] text-normal">{label}</p>
              <p className="m-0! text-[20px] font-semibold text-primary">
                {currencySymbol} {format(value)}
              </p>
            </div>
          ))}
        </div>
        <Table
          rowKey={(row) => row.channel_id ?? row.channel_name}
          columns={columns}
          dataSource={reportDetail?.channel_settlement_reports ?? []}
          pagination={false}
        />
        <div className="mt-5 space-y-3 text-[15px]">
          <div className="flex justify-between">
            <span>{t("report.total_amount")}</span>
            <span>
              {currencySymbol} {format(reportDetail?.payment_received)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>{t("report.cancelled")}</span>
            <span>
              {currencySymbol} {format(reportDetail?.cancelled)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>{t("report.refund")}</span>
            <span>
              {currencySymbol} {format(reportDetail?.refund)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>{t("report.withdrawal")}</span>
            <span>
              {currencySymbol} {format(reportDetail?.withdrawal)}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
};

CashierReportModal.propTypes = {
  open: PropTypes.bool,
  reportDetail: PropTypes.object,
  currencySymbol: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};

export default CashierReportModal;
