import { DatePicker, Radio } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";
import dayjs from "dayjs";
import { DATE_TIME_SHIFT_KEYS } from "./dateAndTimeConstants";

const getDateTimeShiftList = (t) => {
  const today = dayjs();

  return [
    {
      key: DATE_TIME_SHIFT_KEYS.REALTIME,
      label: t("report.realtime_report"),
      start_time: today.startOf("day").format("YYYY-MM-DD HH:mm:ss"),
      end_time: today.endOf("day").format("YYYY-MM-DD HH:mm:ss"),
    },
    {
      key: DATE_TIME_SHIFT_KEYS.WEEKLY,
      label: t("report.weekly_report"),
      start_time: today
        .subtract(7, "day")
        .startOf("day")
        .format("YYYY-MM-DD HH:mm:ss"),
      end_time: today.endOf("day").format("YYYY-MM-DD HH:mm:ss"),
    },
    {
      key: DATE_TIME_SHIFT_KEYS.MONTHLY,
      label: t("report.monthly_report"),
      start_time: today
        .subtract(30, "day")
        .startOf("day")
        .format("YYYY-MM-DD HH:mm:ss"),
      end_time: today.endOf("day").format("YYYY-MM-DD HH:mm:ss"),
    },
  ];
};

// Date and Time 组件 （cashier为All时）
const DateAndTime = ({
  handleShiftClick,
  selectedShiftDay,
  setSelectedShiftDay,
}) => {
  const { t } = useTranslation();
  const [customRange, setCustomRange] = useState(null);
  const [rangePickerDates, setRangePickerDates] = useState(null);
  const dateTimeShiftList = useMemo(() => getDateTimeShiftList(t), [t]);

  const disabledCustomDate = (current) => {
    if (!current || !rangePickerDates) return false;

    const selectedDate = rangePickerDates[0] || rangePickerDates[1];
    if (!selectedDate) return false;

    return (
      Math.abs(
        current.startOf("day").diff(selectedDate.startOf("day"), "day"),
      ) > 30
    );
  };

  const handleCustomRangeChange = (range) => {
    setCustomRange(range);

    if (!range?.[0] || !range?.[1]) return;

    handleShiftClick({
      key: DATE_TIME_SHIFT_KEYS.CUSTOM,
      label: t("report.custom"),
      start_time: range[0].startOf("day").format("YYYY-MM-DD HH:mm:ss"),
      end_time: range[1].endOf("day").format("YYYY-MM-DD HH:mm:ss"),
    });
  };

  return (
    <div className="w-full shrink-0 pr-1">
      <p className="text-[17px] font-semibold text-normal border-b border-line py-2! m-0! mt-4!">
        {t("report.date_and_time")}
      </p>
      {dateTimeShiftList.map((shift) => (
        <div
          key={shift.key}
          className="w-full flex items-center cursor-pointer border-b border-line pt-4 pb-2"
          onClick={() => {
            setCustomRange(null);
            handleShiftClick(shift);
          }}
        >
          <span className="flex-1 text-[12px] font-medium">{shift.label}</span>
          <Radio checked={selectedShiftDay === shift.key} />
        </div>
      ))}
      <div
        className="w-full flex items-center cursor-pointer pt-4 pb-2"
        onClick={() => setSelectedShiftDay(DATE_TIME_SHIFT_KEYS.CUSTOM)}
      >
        <span className="flex-1 text-[12px] font-medium">
          {t("report.custom")}
        </span>
        <Radio checked={selectedShiftDay === DATE_TIME_SHIFT_KEYS.CUSTOM} />
      </div>
      {selectedShiftDay === DATE_TIME_SHIFT_KEYS.CUSTOM && (
        <DatePicker.RangePicker
          value={customRange}
          disabledDate={disabledCustomDate}
          allowClear={false}
          format="YYYY-MM-DD"
          suffixIcon={null}
          className="w-full mt-4"
          style={{ height: "40px" }}
          onCalendarChange={(dates) => setRangePickerDates(dates)}
          onOpenChange={(open) => {
            if (!open) setRangePickerDates(null);
          }}
          onChange={handleCustomRangeChange}
        />
      )}
    </div>
  );
};

DateAndTime.propTypes = {
  handleShiftClick: PropTypes.func.isRequired,
  selectedShiftDay: PropTypes.string.isRequired,
  setSelectedShiftDay: PropTypes.func.isRequired,
};

export default DateAndTime;
