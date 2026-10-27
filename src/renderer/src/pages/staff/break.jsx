import { message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";

import Header from "@renderer/components/Header";

const formatDuration = (seconds) => {
  const normalizedSeconds = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const restSeconds = normalizedSeconds % 60;

  return [hours, minutes, restSeconds].map((item) => String(item).padStart(2, "0")).join(":");
};

const getBreakElapsedSeconds = (restStartTime) => {
  if (!restStartTime) {
    return 0;
  }

  return Math.max(0, dayjs().diff(dayjs(restStartTime), "second"));
};

const StaffBreak = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [messageApi, contextHolder] = message.useMessage();
  const staffInfo = location.state?.staff;
  const initialRestDuration = useMemo(
    () => getBreakElapsedSeconds(staffInfo?.rest_start_time),
    [staffInfo?.rest_start_time],
  );
  const [restDuration, setRestDuration] = useState(initialRestDuration);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!staffInfo) {
      messageApi.open({
        type: "error",
        content: "Missing staff information.",
      });
      navigate("/staff");
    }
  }, [messageApi, navigate, staffInfo]);

  useEffect(() => {
    setRestDuration(initialRestDuration);
  }, [initialRestDuration]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRestDuration((currentDuration) => currentDuration + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const handleResumeWork = async () => {
    if (!staffInfo?.restaurant_waiter_id) {
      messageApi.open({
        type: "error",
        content: "Missing staff information.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await window.api.staff.takeBreak({
        restaurant_waiter_id: staffInfo.restaurant_waiter_id,
      });
      navigate("/staff");
    } catch (error) {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {contextHolder}
      <Header currentTitle={t("menu.take_a_break")} onTopPage={false} backPath="/staff" />

      <div className="p-8">
        <div className="flex min-h-[calc(100vh-128px)] flex-col items-center rounded-lg border border-line px-6 py-8">
          <span className="text-[14px] font-semibold text-primary">
            {staffInfo?.waiter_name || staffInfo?.waiter_no || "-"}
          </span>
          <span className="mt-4 text-[22px] font-medium text-normal">{formatDuration(restDuration)}</span>
          <div
            disabled={isSubmitting}
            className="mt-8 flex aspect-square w-[320px] max-w-[60vw] items-center justify-center rounded-full bg-[#FFBF00] text-[32px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-70"
            onClick={handleResumeWork}
          >
            {t("staff.resume_work")}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffBreak;
