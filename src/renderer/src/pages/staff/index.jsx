import Header from "@renderer/components/Header";
import { Input, message, Modal } from "antd";
const { Search } = Input;

import Big from "big.js";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import PropTypes from "prop-types";
import { useState, useEffect, useCallback } from "react";
import { cloneDeep } from "lodash";
import { WAITER_STATUS } from "@shared/constants/enums";
import useStore from "@renderer/store";
import useCameraCapture from "@renderer/hooks/useCameraCapture";
import useCashOnHandModal from "@renderer/hooks/useCashOnHandModal";
import useCashierReportModal from "@renderer/hooks/useCashierReportModal";

const CLOCK_ACTION = {
  IN: "in",
  OUT: "out",
};

const CLOCK_PHOTO_STATUS = {
  ON: 1,
  OFF: 2,
};

const toCents = (amount) => Number(new Big(amount || 0).times(100).round(0, 1).toString());

const Staff = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const restaurantSetting = useStore((state) => state.restaurantSetting);
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const [staffList, setStaffList] = useState([]);
  const [allStaffList, setAllStaffList] = useState([]);
  const [endingSelfShift, setEndingSelfShift] = useState(false);
  const [selfClockOutPhotoAssetId, setSelfClockOutPhotoAssetId] = useState(null);
  const { cameraCaptureHolder, openCameraCapture } = useCameraCapture();

  const currencySymbol = restaurantSetting?.currency_symbol || "";

  // 将打卡记录中的本地资源ID转换成可展示的 file:// 地址
  const resolveStaffPhotoUrls = useCallback(async (list) => {
    return Promise.all(
      list.map(async (staff) => {
        const [clockInImageUrl, clockOutImageUrl] = await Promise.all([
          staff.clock_in_local_image ? window.api.assets.getLocalAssetFileUrl(staff.clock_in_local_image) : null,
          staff.clock_out_local_image ? window.api.assets.getLocalAssetFileUrl(staff.clock_out_local_image) : null,
        ]);

        return {
          ...staff,
          clock_in_local_image_url: clockInImageUrl,
          clock_out_local_image_url: clockOutImageUrl,
        };
      }),
    );
  }, []);

  // 重新拉取员工打卡记录，并补齐本地图片展示地址
  const refreshStaffList = useCallback(async () => {
    const list = await window.api.staff.getStaffClockRecordList();
    const staffListWithPhotoUrls = await resolveStaffPhotoUrls(list);
    setAllStaffList(staffListWithPhotoUrls);
    setStaffList(staffListWithPhotoUrls);
  }, [resolveStaffPhotoUrls]);

  const onSearchStaff = (value) => {
    const filteredStaffList = cloneDeep(allStaffList).filter((staff) =>
      (staff.waiter_name || "").toLowerCase().includes(value.toLowerCase()),
    );
    setStaffList(filteredStaffList);
  };

  const finishSelfLogout = useCallback(async () => {
    await window.api.auth.clearSession();
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  const { cashierReportModalHolder, openCashierReportModal } = useCashierReportModal({
    currencySymbol,
    onClose: finishSelfLogout,
  });

  const {
    cashOnHandModalHolder,
    closeCashOnHandModal,
    openCashOnHandModal: showCashOnHandModal,
  } = useCashOnHandModal({
    loading: endingSelfShift,
    onAutoCalculate: () => submitSelfEndShift(null),
    onCancel: resetSelfEndShiftState,
    onConfirm: submitSelfEndShift,
  });

  function resetSelfEndShiftState() {
    closeCashOnHandModal();
    setSelfClockOutPhotoAssetId(null);
    setEndingSelfShift(false);
  }

  const openSelfCashOnHandModal = (assetId = null) => {
    setSelfClockOutPhotoAssetId(assetId);
    showCashOnHandModal();
  };

  async function submitSelfEndShift(cashOnHand) {
    const waiterId = user?.id;

    if (!waiterId || endingSelfShift) {
      return;
    }

    setEndingSelfShift(true);

    try {
      const clockReportParams = {
        restaurant_waiter_id: waiterId,
        waiter_clock_type: 2,
        clock_out_local_image: selfClockOutPhotoAssetId,
      };

      if (cashOnHand !== undefined && cashOnHand !== null) {
        clockReportParams.cash_on_hand = toCents(cashOnHand);
      }

      // Staff 页面当前用户签退复用交接班接口，确保下班打卡、手头现金和班次报表保持同一条链路。
      const report = await window.api.staff.clockReportData(clockReportParams);

      // Staff 页交接班同样最多等待 6 秒，上传失败不影响本地签退和退出。

      if (report) {
        openCashierReportModal(report);
      } else {
        await finishSelfLogout();
      }

      closeCashOnHandModal();
    } catch (error) {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    } finally {
      setEndingSelfShift(false);
    }
  }

  const isCurrentLoginStaff = (staff) => {
    if (!staff || !user) {
      return false;
    }

    return Number(staff.restaurant_waiter_id) === Number(user.id) || String(staff.waiter_no) === String(user.waiter_no);
  };

  const handleSelfEndShift = async () => {
    if (endingSelfShift) {
      return;
    }

    setEndingSelfShift(true);

    try {
      const count = await window.api.orders.getUncompleteOrderCount();

      // 自己签退时必须先处理未完成订单，和侧栏 End your shift 保持一致。
      if (Number(count) > 0) {
        Modal.confirm({
          title: t("tips.click_end_shift_tips_title"),
          content: t("tips.click_end_shift_tips_content"),
          okText: t("tips.click_end_shift_tips_confirm"),
          cancelButtonProps: { style: { display: "none" } },
          onOk: () => {
            navigate("/offline-orders");
          },
        });
        return;
      }

      // 开启签退拍照时，先保存本地照片资源，再进入手头现金弹窗。
      if (isClockPhotoEnabled) {
        const clockOutPhoto = await openCameraCapture({
          title: t("staff.clock_out_photo"),
          capturedAlt: t("staff.captured_clock_out_photo"),
          sourceKey: "staff-end-shift-clock-out-photo",
          cancelText: t("components.cancel"),
        });

        if (!clockOutPhoto) {
          return;
        }

        openSelfCashOnHandModal(clockOutPhoto.asset?.id ?? null);
        return;
      }

      openSelfCashOnHandModal();
    } catch (error) {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    } finally {
      setEndingSelfShift(false);
    }
  };

  // 每次操作前从主进程获取最新本地打卡状态，渲染层只消费判断结果。
  const getLatestLocalStaffClock = async (staff) => {
    const clockState = await window.api.staff.getStaffClockState({
      restaurant_waiter_id: staff.restaurant_waiter_id,
    });

    return {
      ...staff,
      ...(clockState?.clock_record ?? {}),
      restaurant_waiter_id: staff.restaurant_waiter_id,
      waiter_status: clockState?.waiter_status ?? null,
      is_clocked_in: Boolean(clockState?.is_clocked_in),
      is_working: Boolean(clockState?.is_working),
      is_resting: Boolean(clockState?.is_resting),
    };
  };

  // 初始化员工打卡记录
  useEffect(() => {
    refreshStaffList().catch((error) => {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    });
  }, [messageApi, refreshStaffList]);

  const handleTakeBreak = async (staff) => {
    try {
      // 每次操作前重新读取本地打卡记录，避免依赖页面缓存或线上 waiter_status。
      const latestStaff = await getLatestLocalStaffClock(staff);

      // 未打卡时提示先打卡，和在线 Web 的 StaffEmployeeItem 保持一致。
      if (!latestStaff.is_clocked_in) {
        messageApi.error(t("staff.please_punch_in"));
        return;
      }

      // 已在休息中的员工直接进入休息页，避免再次调用接口变成恢复上班
      if (latestStaff.is_resting) {
        navigate("/staff/break", { state: { staff: latestStaff } });
        return;
      }

      // 已下班员工点击 BREAK 时不触发接口，保持在线 Web 的无操作行为。
      if (!latestStaff.is_working) {
        return;
      }

      const res = await window.api.staff.takeBreak({
        restaurant_waiter_id: latestStaff.restaurant_waiter_id,
      });

      navigate("/staff/break", {
        state: {
          staff: {
            ...latestStaff,
            ...res,
          },
        },
      });
    } catch (error) {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    }
  };

  // 拍照开关只决定是否先打开摄像头，不影响打卡功能本身
  const isClockPhotoEnabled = restaurantSetting?.clock_photo_status === CLOCK_PHOTO_STATUS.ON;

  const handleClockAction = async (action, staff) => {
    // 每次操作前重新读取本地打卡记录，避免依赖页面缓存或线上 waiter_status。
    const latestStaff = await getLatestLocalStaffClock(staff);

    // 已经上班时再次点击 IN，和在线 Web 一样只给提示，不重复提交。
    if (action === CLOCK_ACTION.IN && latestStaff.is_working) {
      messageApi.warning(t("staff.you_have_punched_in"));
      return;
    }

    // 下班打卡要求员工当前处于上班状态，未上班或休息中时提示先打卡。
    if (action === CLOCK_ACTION.OUT && !latestStaff.is_working) {
      messageApi.error(t("tips.punch_in"));
      return;
    }

    try {
      const isClockIn = action === CLOCK_ACTION.IN;

      // 当前登录用户从 Staff 页签退时，走和侧栏 End your shift 相同的两段弹窗流程。
      if (!isClockIn && isCurrentLoginStaff(latestStaff)) {
        await handleSelfEndShift();
        return;
      }

      const localImageField = isClockIn ? "clock_in_local_image" : "clock_out_local_image";
      const payload = {
        restaurant_waiter_id: latestStaff.restaurant_waiter_id,
      };

      // 开启拍照打卡时，先拍照并把本地图片资源ID带入打卡接口。
      if (isClockPhotoEnabled) {
        const clockPhoto = await openCameraCapture({
          title: isClockIn ? t("staff.clock_in_photo") : t("staff.clock_out_photo"),
          capturedAlt: t("staff.captured_clock_photo"),
          sourceKey: isClockIn ? "staff-clock-in-photo" : "staff-clock-out-photo",
          cancelText: t("components.cancel"),
        });

        if (!clockPhoto) {
          return;
        }

        payload[localImageField] = clockPhoto.asset?.id;
      }

      // 未开启拍照时，直接执行打卡/签退
      if (isClockIn) {
        await window.api.staff.clockIn(payload);
      } else {
        await window.api.staff.clockOut(payload);
      }

      await refreshStaffList();
    } catch (error) {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    }
  };

  return (
    <div className="h-screen overflow-hidden">
      {contextHolder}
      <Header
        currentTitle={t("menu.staff")}
        rightSlot={<Search style={{ width: "240px" }} placeholder={t("staff.input_name")} onSearch={onSearchStaff} />}
      />
      {cameraCaptureHolder}
      {cashOnHandModalHolder}
      {cashierReportModalHolder}
      {/* 员工列表区域独立滚动，避免 body 滚动时带动 Header 产生错位感。 */}
      <div className="h-[calc(100vh-64px)] min-h-0 overflow-y-auto p-8">
        <div className="grid grid-cols-3 gap-4 mt-4">
          {staffList.map((staff) => (
            <StaffItem
              key={staff.restaurant_waiter_id}
              staffInfo={staff}
              onClockIn={() => handleClockAction(CLOCK_ACTION.IN, staff)}
              onClockOut={() => handleClockAction(CLOCK_ACTION.OUT, staff)}
              onTakeBreak={() => handleTakeBreak(staff)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const StaffItem = ({ staffInfo, onClockIn, onClockOut, onTakeBreak }) => {
  const { waiter_name, last_check_out_time } = staffInfo;
  const { t } = useTranslation();
  const isOuted = staffInfo.waiter_status === WAITER_STATUS.OUTED;

  return (
    <div className="p-5 flex flex-col items-center justify-center border border-line rounded-2xl text-center">
      <span className="font-semibold text-[12px] text-normal">{waiter_name}</span>
      <span>{"-"}</span>
      <div className="flex items-center gap-4 my-4">
        {/* IN  */}
        <div className="flex flex-col items-center">
          <div
            className="size-20 overflow-hidden rounded-full bg-[#1D3A71] text-white text-[10px] font-semibold leading-20 mb-2 cursor-pointer"
            onClick={onClockIn}
          >
            {/* 有上班打卡照片时展示照片，否则保留默认 IN 文案 */}
            {staffInfo.clock_in_local_image_url ? (
              <img
                src={staffInfo.clock_in_local_image_url}
                alt={t("staff.clock_in")}
                className="h-full w-full object-cover"
              />
            ) : (
              t("staff.in")
            )}
          </div>
          <span className="block text-[10px] mb-1">{t("staff.in")}</span>
          <span className="block text-[10px] font-medium">{staffInfo.working_time || "-"}</span>
        </div>
        {/* TAKE A BREAK */}
        <div className="flex flex-col items-center">
          <div
            className={`size-20 rounded-full bg-[#FFBF0070] text-white text-[10px] font-semibold leading-20 mb-2 ${
              isOuted ? "cursor-not-allowed opacity-40" : "cursor-pointer"
            }`}
            onClick={onTakeBreak}
          >
            {t("menu.take_a_break")}
          </div>
          <span className="block text-[10px] mb-1">{t("staff.break")}</span>
          <span className="block text-[10px] font-medium">{staffInfo.rest_start_time || "-"}</span>
        </div>
        {/* OUT */}
        <div className="flex flex-col items-center">
          <div
            className="size-20 overflow-hidden rounded-full bg-[#CF1813] text-white text-[10px] font-semibold leading-20 mb-2 cursor-pointer"
            onClick={onClockOut}
          >
            {/* 有下班打卡照片时展示照片，否则保留默认 OUT 文案 */}
            {staffInfo.clock_out_local_image_url ? (
              <img
                src={staffInfo.clock_out_local_image_url}
                alt={t("staff.clock_out")}
                className="h-full w-full object-cover"
              />
            ) : (
              t("staff.out")
            )}
          </div>
          <span className="block text-[10px] mb-1">{t("staff.out")}</span>
          <span className="block text-[10px] font-medium">{staffInfo.off_time || "-"}</span>
        </div>
      </div>
      <span className="font-normal text-[12px] text-normal">
        {last_check_out_time && `${t("staff.last_checked_out_at")}: ${last_check_out_time}`}
      </span>
    </div>
  );
};

StaffItem.propTypes = {
  staffInfo: PropTypes.object.isRequired,
  onClockIn: PropTypes.func.isRequired,
  onClockOut: PropTypes.func.isRequired,
  onTakeBreak: PropTypes.func.isRequired,
};

export default Staff;
