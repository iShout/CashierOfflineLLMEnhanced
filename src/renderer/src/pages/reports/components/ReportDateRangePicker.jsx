import { DownloadOutlined } from "@ant-design/icons";
import { Button, DatePicker } from "antd";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

const ReportDateRangePicker = ({ value, onChange, onDownload }) => {
  const { t } = useTranslation();
  const hasSelectedRange = Boolean(value?.[0] && value?.[1]);

  return (
    <div className="w-full shrink-0 pr-1">
      <p className="text-[17px] font-semibold text-normal border-b border-line py-2! m-0! my-4!">
        {t("report.date_and_time")}
      </p>
      <DatePicker.RangePicker
        value={value}
        allowClear={false}
        format="YYYY-MM-DD"
        className="w-full"
        style={{ height: "40px" }}
        placeholder={[t("components.start_date"), t("components.end_date")]}
        onChange={onChange}
      />
      <Button
        type="primary"
        disabled={!hasSelectedRange}
        icon={<DownloadOutlined />}
        className={hasSelectedRange ? "w-full mt-4! bg-primary" : "w-full mt-4!"}
        style={{ height: "56px" }}
        onClick={() => onDownload?.(value)}
      >
        <span className="text-[16px] font-semibold">{t("components.download")}</span>
      </Button>
    </div>
  );
};

ReportDateRangePicker.propTypes = {
  value: PropTypes.array,
  onChange: PropTypes.func.isRequired,
  onDownload: PropTypes.func,
};

export default ReportDateRangePicker;
