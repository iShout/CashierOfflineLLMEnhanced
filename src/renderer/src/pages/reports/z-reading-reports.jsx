import Header from "@renderer/components/Header";
import EmptyHolder from "@renderer/components/EmptyHolder";
import { Button, Image, message, Modal, Table } from "antd";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "@renderer/utils/MoneyUtils";
import useStore from "@renderer/store";
import { useTranslation } from "react-i18next";
import { CloseOutlined, EyeOutlined } from "@ant-design/icons";
import DateAndTime from "./components/DateAndTime";
import ReportDateRangePicker from "./components/ReportDateRangePicker";
import { DATE_TIME_SHIFT_KEYS } from "./components/dateAndTimeConstants";
import PropTypes from "prop-types";
import dayjs from "dayjs";
import RollingNumber from "@renderer/components/RollingNumber";
import useGsapTableAnimation from "@renderer/hooks/useGsapTableAnimation";

const REPORT_TYPES = {
  END_OF_DAY: 1,
  BIR: 2,
  E_JOURNAL: 3,
};

// BIR 无可下载报告时使用和 E-Journal 一致的简短提示，避免暴露 IPC/底层错误。
const isBirNoReportError = (error) => {
  const messageText = String(error?.message ?? error ?? "").toLowerCase();

  return (
    messageText.includes("end of day report not generate") ||
    messageText.includes("previous related reports") ||
    messageText.includes("report you want to print does not exist")
  );
};

const ZReadingReports = () => {
  const { t } = useTranslation();
  const [activeReportType, setActiveReportType] = useState(REPORT_TYPES.END_OF_DAY);
  const [selectedDateTimeKey, setSelectedDateTimeKey] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState(null);
  const [selectedEosRange, setSelectedEosRange] = useState(null);
  const [summaryDetail, setSummaryDetail] = useState(null); // 报告详情数据
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isGeneratedDayReport, setIsGeneratedDayReport] = useState(false);
  const [modal, modalContextHolder] = Modal.useModal();

  useEffect(() => {
    const today = dayjs();
    const startTime = today.startOf("day").format("YYYY-MM-DD HH:mm:ss");
    const endTime = today.endOf("day").format("YYYY-MM-DD HH:mm:ss");

    // 进入页面时现查一次当天日报状态，后续按钮只消费页面状态。
    window.api.report
      .checkEosReportGenerated({ startTime, endTime })
      .then((generated) => {
        setIsGeneratedDayReport(Boolean(generated));
      })
      .catch((error) => {
        message.error(error?.message ?? "Failed to check day report status.");
      });
  }, []);

  const reportTypeOptions = [
    {
      label: t("report.end_of_day"),
      value: REPORT_TYPES.END_OF_DAY,
    },
    {
      label: t("report.bir_report"),
      value: REPORT_TYPES.BIR,
    },
    {
      label: "E-Journal",
      value: REPORT_TYPES.E_JOURNAL,
    },
  ];

  const handleReportTypeChange = (reportType) => {
    if (reportType === activeReportType) {
      return;
    }
    setActiveReportType(reportType);
    setSelectedDateTimeKey("");
    setSelectedDateRange(null);
    setSelectedEosRange(null);
    setSummaryDetail(null);
    setPreviewImageUrl("");
    setIsPreviewOpen(false);
  };

  const handleDateAndTimeClick = (shift) => {
    setSelectedDateTimeKey(shift.key);
    const { start_time, end_time } = shift;
    const isCurrent = shift.key === DATE_TIME_SHIFT_KEYS.REALTIME;
    setSelectedEosRange({ start_time, end_time, current: isCurrent });

    window.api.report
      .getEosReport({ startTime: start_time, endTime: end_time, current: isCurrent })
      .then((report) => {
        setSummaryDetail(report);
      })
      .catch((error) => {
        message.error(error?.message ?? "Failed to load day report.");
      });
  };

  const persistDayReport = () => {
    if (!selectedEosRange) {
      return Promise.resolve();
    }

    // 生成日报时保留本地快照，供电子凭证、商场认证和报表导出使用。
    return window.api.report
      .getEosReport({
        startTime: selectedEosRange.start_time,
        endTime: selectedEosRange.end_time,
        current: Boolean(selectedEosRange.current),
        persistReportPrint: true,
      })
      .then((report) => {
        setSummaryDetail(report);
        setIsGeneratedDayReport(true);
        message.success(t("tips.success"));
      })
      .catch((error) => {
        message.error(error?.message ?? "Failed to generate day report.");
        return Promise.reject(error);
      });
  };

  const handleGenerateDayReport = () => {
    if (!selectedEosRange) {
      return;
    }

    if (isGeneratedDayReport) return;

    // 首次 End Your Day 前增加二次确认；取消即终止生成流程。
    modal.confirm({
      title: t("components.tips"),
      content: t("tips.generate_day_report_tips"),
      okText: t("components.confirm"),
      cancelText: t("components.cancel"),
      width: 450,
      mask: { enabled: true, blur: true },
      centered: true,
      onOk: persistDayReport,
    });
  };

  const handleViewDigitalCopy = () => {
    if (!selectedEosRange) {
      return;
    }

    // 报表 Digital Copy 复刻后端 /order-print/preview，在主进程生成图片。
    setIsPreviewLoading(true);
    window.api.report
      .previewEosReport({
        startTime: selectedEosRange.start_time,
        endTime: selectedEosRange.end_time,
        current: Boolean(selectedEosRange.current),
      })
      .then((imageUrl) => {
        setPreviewImageUrl(imageUrl);
        setIsPreviewOpen(true);
      })
      .catch((error) => {
        message.error(error?.message ?? "Failed to preview day report.");
      })
      .finally(() => {
        setIsPreviewLoading(false);
      });
  };

  const handleDateRangeChange = (range) => {
    setSelectedDateRange(range);
    // TODO: 接入 BIR/E-Journal report 查询接口。
  };

  const handleDateRangeDownload = (range) => {
    if (!range?.[0] || !range?.[1]) {
      return;
    }

    if (range[1].startOf("day").diff(range[0].startOf("day"), "day") > 30) {
      message.warning(t("report.select_date_within_31_days"));
      return;
    }

    if (activeReportType === REPORT_TYPES.E_JOURNAL) {
      // E-Journal 由主进程弹出保存框并写入 txt，页面只处理结果提示。
      window.api.report
        .downloadTicketData({
          beginTime: range[0].startOf("day").format("YYYY-MM-DD HH:mm:ss"),
          endTime: range[1].endOf("day").format("YYYY-MM-DD HH:mm:ss"),
        })
        .then((textInfo) => {
          if (textInfo?.canceled) {
            return;
          }

          if (textInfo?.file_path || textInfo?.file_name) {
            message.success(`Downloaded: ${textInfo.file_path || textInfo.file_name}`);
            return;
          }

          message.warning(t("tips.no_report_tips"));
        })
        .catch((error) => {
          message.error(error?.message ?? "Failed to download E-Journal.");
        });
      return;
    }

    if (activeReportType === REPORT_TYPES.BIR) {
      // BIR xlsx 由主进程按后端 javaDownloadBirReport 模板和本地 SQLite 数据生成。
      window.api.report
        .downloadBirReport({
          beginTime: range[0].startOf("day").format("YYYY-MM-DD HH:mm:ss"),
          endTime: range[1].endOf("day").format("YYYY-MM-DD HH:mm:ss"),
        })
        .then((fileInfo) => {
          if (fileInfo?.canceled) {
            return;
          }

          message.success(`Downloaded: ${fileInfo?.file_path || fileInfo?.fileName || fileInfo?.file_name}`);
        })
        .catch((error) => {
          if (isBirNoReportError(error)) {
            message.warning(t("tips.no_report_tips"));
            return;
          }

          message.error(error?.message ?? "Failed to download BIR Report.");
        });
    }
  };

  return (
    <div>
      <Header currentTitle={t("menu.end_of_day")} />
      <div className="flex h-[calc(100vh-64px)]">
        <div className="w-[380px] shrink-0 h-full p-6 border-r border-line flex flex-col min-h-0 overflow-y-auto">
          <p className="text-[17px] font-semibold text-normal border-b border-line py-2! m-0!">
            {t("report.report_type")}
          </p>
          {reportTypeOptions.map((option, index) => (
            <div
              key={option.value}
              onClick={() => handleReportTypeChange(option.value)}
              style={activeReportType === option.value ? { backgroundColor: "#003498", color: "#fff" } : {}}
              className={`w-full h-[56px] shrink-0 border border-primary text-primary rounded-md flex items-center justify-center hover:bg-primary hover:text-white cursor-pointer ${
                index === 0 ? "my-3" : index > 1 ? "mt-3" : ""
              }`}
            >
              <span className="text-[16px] font-semibold">{option.label}</span>
            </div>
          ))}
          {activeReportType === REPORT_TYPES.END_OF_DAY ? (
            <>
              <DateAndTime
                handleShiftClick={handleDateAndTimeClick}
                selectedShiftDay={selectedDateTimeKey}
                setSelectedShiftDay={setSelectedDateTimeKey}
              />
              {selectedDateTimeKey === DATE_TIME_SHIFT_KEYS.REALTIME && (
                <div className="w-full shrink-0 mt-6 space-y-3">
                  <Button
                    type="primary"
                    className="w-full bg-primary"
                    style={{ height: "56px", marginBottom: "12px" }}
                    disabled={isGeneratedDayReport}
                    onClick={handleGenerateDayReport}
                  >
                    <span className="text-[16px] font-semibold">{t("report.print_day_report")}</span>
                  </Button>
                  <Button
                    className="w-full border-primary! text-primary!"
                    style={{ height: "56px" }}
                    loading={isPreviewLoading}
                    onClick={handleViewDigitalCopy}
                  >
                    <span className="text-[16px] font-semibold">
                      <EyeOutlined className="text-[18px] mr-1" />
                      {t("order.view_digital_copy")}
                    </span>
                  </Button>
                </div>
              )}
            </>
          ) : (
            <ReportDateRangePicker
              value={selectedDateRange}
              onChange={handleDateRangeChange}
              onDownload={handleDateRangeDownload}
            />
          )}
        </div>
        <div className="flex-1 h-full min-h-0 overflow-y-auto">
          {summaryDetail === null ? <EmptyHolder /> : <ReportSummary summaryDetail={summaryDetail} />}
        </div>
      </div>
      <Modal
        open={isPreviewOpen}
        footer={null}
        width={680}
        closeIcon={<CloseOutlined className="text-[#3157ff] text-[24px]" />}
        style={{ top: 22 }}
        styles={{
          content: { padding: 0, borderRadius: 0, background: "#fff" },
          body: { padding: 0, maxHeight: "92vh", overflowY: "auto" },
          mask: { backgroundColor: "rgba(0, 0, 0, 0.5)" },
        }}
        onCancel={() => setIsPreviewOpen(false)}
      >
        {previewImageUrl && (
          <Image src={previewImageUrl} alt={t("report.end_of_day")} preview={false} className="block w-full" />
        )}
      </Modal>
      {modalContextHolder}
    </div>
  );
};

const ReportSummary = ({ summaryDetail }) => {
  const restaurantSetting = useStore((state) => state.restaurantSetting);
  const { currency_symbol } = restaurantSetting;
  const { t } = useTranslation();
  const channelTableWrapperRef = useRef(null);
  const channelSettlementReports = useMemo(
    () => summaryDetail.channel_settlement_reports ?? [],
    [summaryDetail.channel_settlement_reports],
  );
  const channelTableAnimationKey = useMemo(() => {
    return channelSettlementReports
      .map((item, index) => item.channel_code ?? item.channel_id ?? item.channel_name ?? `channel-${index}`)
      .join("|");
  }, [channelSettlementReports]);

  // End of Day 支付渠道表格切换日期后平滑过渡行变化。
  useGsapTableAnimation(channelTableWrapperRef, [channelTableAnimationKey]);

  const renderMoney = (amount, className = "") => (
    <span className={className}>
      {currency_symbol} <RollingNumber className={className} value={`${format(amount)}`} />
    </span>
  );

  // 表格配置
  const columns = [
    {
      title: t("report.payment_type"),
      dataIndex: "channel_name",
      key: "channel_name",
    },
    {
      title: t("report.count"),
      dataIndex: "transaction_count",
      key: "transaction_count",
    },
    {
      title: t("order.amount"),
      dataIndex: "transaction_amount",
      key: "transaction_amount",
      render: (text) => format(text),
    },
  ];
  // sales breakdown配置
  const salesBreakdownConfig = [
    { label: t("report.vatable_sales"), amount: summaryDetail.vatable_sales },
    { label: t("report.vat_amount"), amount: summaryDetail.vat_amount },
    { label: t("report.vat_exempt_sales"), amount: summaryDetail.vat_exempt_sales },
    { label: t("report.zero_rated_sales"), amount: summaryDetail.zero_rated_sales },
    { label: t("report.gross_amount"), amount: summaryDetail.gross_amount },
    { label: t("report.less_discount"), amount: summaryDetail.less_discount },
    { label: t("report.less_refund"), amount: summaryDetail.less_refund },
    { label: t("report.less_cancelled"), amount: summaryDetail.less_cancelled },
    { label: t("report.less_vat_adjustment"), amount: summaryDetail.less_vat_adjustment },
    { label: t("report.net_amount"), amount: summaryDetail.net_amount },
  ];
  // service charge配置
  const serviceChargeConfig = [
    // 服务费金额正常列示；服务费不参与计税，因此税额字段由日报生成器固定为 0。
    { label: t("report.service_charge_amount"), amount: summaryDetail.service_fee ?? 0 },
    { label: t("report.service_charge_tax"), amount: summaryDetail.service_fee_tax ?? 0 },
    { label: t("report.total_service_charge"), amount: summaryDetail.total_service_fee ?? 0 },
  ];
  // discount summary配置
  const discountSummaryConfig = [
    { label: t("order.pwd_discount"), amount: summaryDetail.pwd_discount },
    { label: t("order.sc_discount"), amount: summaryDetail.sc_discount },
    { label: t("report.NAAC_discounts"), amount: summaryDetail.naac_discount },
    { label: t("report.solo_parent_discount"), amount: summaryDetail.solo_parent_discount },
    { label: t("report.other_discounts"), amount: summaryDetail.other_discount },
  ];
  // Sales Adjustment 配置
  const salesAdjustmentConfig = [
    { label: t("order.cancelled"), amount: summaryDetail.cancelled },
    { label: t("report.refund"), amount: summaryDetail.refund },
  ];
  // VAT Adjustment 配置
  const vatAdjustmentConfig = [
    { label: t("report.pwd_transactions"), amount: summaryDetail.pwd_transactions },
    { label: t("report.sc_transactions"), amount: summaryDetail.sc_transactions },
    { label: t("report.regular_discount_transactions"), amount: summaryDetail.regular_discount_transactions },
    { label: t("report.zero_rated_transactions"), amount: summaryDetail.zero_rated_transactions },
    { label: t("report.vat_on_refund"), amount: summaryDetail.vat_on_refund },
    { label: t("report.other_vat_adjustments"), amount: summaryDetail.other_vat_adjustments },
  ];

  return (
    <div className="min-h-full py-4 px-5">
      <div className="w-full shrink-0 flex items-center border-b border-line pb-2.5! my-2.5">
        <p className="flex-1 m-0! text-[20px] text-normal font-semibold">{t("report.report_summary")}</p>
      </div>
      {/* overviews */}
      <div className="flex shrink-0 flex-nowrap">
        <div className="px-6 border-r border-line">
          <span className="block">{t("report.present_accumulated_sales")}</span>
          {renderMoney(summaryDetail.present_accumulated_sales, "text-primary font-semibold text-[20px]")}
        </div>
        <div className="px-6 border-r border-line">
          <span className="block">{t("report.past_accumulated_sales")}</span>
          {renderMoney(summaryDetail.past_accumulated_sales, "text-primary font-semibold text-[20px]")}
        </div>
        <div className="px-6 border-r border-line">
          <span className="block">{t("report.sales_of_the_day")}</span>
          {renderMoney(summaryDetail.sales_of_the_day, "text-primary font-semibold text-[20px]")}
        </div>
      </div>

      <div ref={channelTableWrapperRef} className="my-6">
        <Table
          rowKey={(row, index) => row.channel_code ?? row.channel_id ?? row.channel_name ?? `channel-${index}`}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          columns={columns}
          dataSource={channelSettlementReports}
          scroll={{ y: "max(160px, calc(100vh - 360px))" }}
          className="custom-table-header"
        />
      </div>

      {/* sales breakdown */}
      <div className="w-full">
        <div className="border-b border-line">
          <span className="text-[24px] font-medium">{t("report.sales_breakdown")}</span>
        </div>
        <div className="py-2">
          {salesBreakdownConfig.map((item) => (
            <div className="flex py-2" key={item.label}>
              <span className="flex-1">{item.label}</span>
              {renderMoney(item.amount, "flex-none")}
            </div>
          ))}
        </div>
      </div>
      {/* service charge */}
      <div className="w-full">
        <div className="border-b border-line">
          <span className="text-[24px] font-medium">{t("report.service_charge")}</span>
        </div>
        <div className="py-2">
          {serviceChargeConfig.map((item) => (
            <div className="flex py-2" key={item.label}>
              <span className="flex-1">{item.label}</span>
              {renderMoney(item.amount, "flex-none")}
            </div>
          ))}
        </div>
      </div>
      {/* Discount Summary */}
      <div className="w-full">
        <div className="border-b border-line">
          <span className="text-[24px] font-medium">{t("report.discount_summary")}</span>
        </div>
        <div className="py-2">
          {discountSummaryConfig.map((item) => (
            <div className="flex py-2" key={item.label}>
              <span className="flex-1">{item.label}</span>
              {renderMoney(item.amount, "flex-none")}
            </div>
          ))}
        </div>
      </div>
      {/* Sales Adjustment */}
      <div className="w-full">
        <div className="border-b border-line">
          <span className="text-[24px] font-medium">{t("report.sales_adjustment")}</span>
        </div>
        <div className="py-2">
          {salesAdjustmentConfig.map((item) => (
            <div className="flex py-2" key={item.label}>
              <span className="flex-1">{item.label}</span>
              {renderMoney(item.amount, "flex-none")}
            </div>
          ))}
        </div>
      </div>
      {/* VAT Adjustment */}
      <div className="w-full">
        <div className="border-b border-line">
          <span className="text-[24px] font-medium">{t("report.vat_adjustments")}</span>
        </div>
        <div className="py-2">
          {vatAdjustmentConfig.map((item) => (
            <div className="flex py-2" key={item.label}>
              <span className="flex-1">{item.label}</span>
              {renderMoney(item.amount, "flex-none")}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

ReportSummary.propTypes = {
  summaryDetail: PropTypes.object,
};

export default ZReadingReports;
