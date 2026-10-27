import { Button, message, Modal } from "antd";
import Big from "big.js";
import PropTypes from "prop-types";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import useStore, { selectUser } from "../store";
import { STATUS_TYPE } from "@shared/constants/enums";
import CONSTANT from "@renderer/const";
import useCameraCapture from "@renderer/hooks/useCameraCapture";

import useCashOnHandModal from "@renderer/hooks/useCashOnHandModal";
import useCashierReportModal from "@renderer/hooks/useCashierReportModal";
import tableManageIcon from "@renderer/assets/menu-icons/table-manage.svg";
import counterIcon from "@renderer/assets/menu-icons/counter.svg";
import offlineOrderIcon from "@renderer/assets/menu-icons/offline-order.svg";
import cashierReportIcon from "@renderer/assets/menu-icons/cashier-report.svg";
import dayReportIcon from "@renderer/assets/menu-icons/day-report.svg";

import settingIcon from "@renderer/assets/menu-icons/setting.svg";
import staffIcon from "@renderer/assets/menu-icons/staff.svg";

const menuList = [
  {
    key: "table_manage",
    label: "table_manage",
    route: "/",
    settingKey: "table_order_status",
    icon: tableManageIcon,
  },
  {
    key: "counter_order",
    label: "counter_order",
    route: "/table-menu/counter",
    state: {
      status_type: STATUS_TYPE.QUEUE,
    },
    settingKey: "wait_order_status",
    icon: counterIcon,
  },
  {
    key: "offline_orders",
    label: "offline_orders",
    route: "/offline-orders",
    icon: offlineOrderIcon,
  },
  {
    key: "cashier_report",
    label: "cashier_report",
    route: "/cashier-reports",
    icon: cashierReportIcon,
  },
  {
    key: "z_reading_report",
    label: "end_of_day",
    route: "/cashier-reports/z-reading",
    icon: dayReportIcon,
  },

  {
    key: "staff",
    label: "staff",
    route: "/staff",
    icon: staffIcon,
  },
  {
    key: "settings",
    label: "setting",
    route: "/settings",
    icon: settingIcon,
  },
];
const isRouteMatched = (pathname, route) => {
  if (!route) return false;
  if (route === "/") return pathname === "/";

  return pathname === route || pathname.startsWith(`${route}/`);
};

const CLOCK_PHOTO_STATUS = {
  ON: 1,
  OFF: 2,
};

const toCents = (amount) => Number(new Big(amount || 0).times(100).round(0, 1).toString());

const MenuItem = ({ module, onItemClick, active }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { icon, label, route, state } = module;

  const handleClick = () => {
    if (!route) return;
    navigate(route, { state });
    onItemClick?.();
  };

  return (
    <div
      className={`flex items-center py-2 px-6 w-full h-[56px] border-b border-line ${
        route ? "cursor-pointer hover:bg-selected" : "cursor-default"
      } ${active ? "bg-selected" : ""}`}
      onClick={handleClick}
    >
      <img className="h-4 w-4 object-contain" src={icon} alt={t(`menu.${label}`)} />
      <span className="block ml-[14px] text-[14px]">{t(`menu.${label}`)}</span>
    </div>
  );
};
const VerticalMenu = ({ className = "", onItemClick }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [endingShift, setEndingShift] = useState(false);
  const [checkingLogoutShift, setCheckingLogoutShift] = useState(false);
  const [clockOutPhotoAssetId, setClockOutPhotoAssetId] = useState(null);
  const versionTapRef = useRef({ count: 0, timer: null });
  const { cameraCaptureHolder, openCameraCapture } = useCameraCapture();

  const user = useStore(selectUser);
  const restaurantSetting = useStore((state) => state.restaurantSetting);
  const logout = useStore((state) => state.logout);
  const roleName = user?.role_info?.role_name || "-";
  const name = user?.name || "-";
  const isClockEnabled = user?.clock_status === CONSTANT.CLOCK_STATUS.ON;
  const isClockPhotoEnabled = restaurantSetting?.clock_photo_status === CLOCK_PHOTO_STATUS.ON;
  const currencySymbol = restaurantSetting?.currency_symbol || "";

  // 点餐开关只控制对应业务入口，其余订单处理、报表和设置菜单保持可用。
  const visibleMenuList = menuList.filter(
    (item) => !item.settingKey || Number(restaurantSetting?.[item.settingKey]) === CONSTANT.SWITCH_STATUS.ON,
  );

  const finishLogout = async () => {
    await window.api.auth.clearSession();
    logout();
    navigate("/login", { replace: true });
    onItemClick?.();
  };

  const handleLogout = async () => {
    if (checkingLogoutShift) {
      return;
    }

    const waiterId = user?.id;
    if (!waiterId) {
      await finishLogout();
      return;
    }

    setCheckingLogoutShift(true);
    try {
      // Logout 只在当前用户存在本地进行中班次时提示，不能只依据考勤功能开关判断。
      const clockState = await window.api.staff.getStaffClockState({
        restaurant_waiter_id: waiterId,
      });

      if (clockState?.is_clocked_in) {
        openLogoutShiftPrompt();
        return;
      }

      await finishLogout();
    } catch (error) {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    } finally {
      setCheckingLogoutShift(false);
    }
  };

  function openLogoutShiftPrompt() {
    let promptInstance;
    const closePrompt = () => promptInstance?.destroy();

    // 复用 End your day 的 confirm 样式，统一宽度、字号与默认 warning 图标颜色。
    promptInstance = modal.confirm({
      title: t("tips.click_logout_tips_title"),
      content: <div className="pt-3 pb-4">{t("tips.click_logout_tips_content")}</div>,
      width: 520,
      closable: true,
      mask: { blur: true, closable: false },
      footer: (
        <div className="flex justify-end gap-3 pt-2">
          <Button
            style={{ height: 40, paddingInline: 20 }}
            onClick={async () => {
              closePrompt();
              await finishLogout();
            }}
          >
            {t("tips.click_logout_tips_cancel")}
          </Button>
          <Button
            type="primary"
            style={{ height: 40, paddingInline: 20 }}
            onClick={async () => {
              closePrompt();
              await handleEndShift();
            }}
          >
            {t("tips.click_logout_tips_confirm")}
          </Button>
        </div>
      ),
    });
  }

  const {
    cashOnHandModalHolder,
    closeCashOnHandModal,
    openCashOnHandModal: showCashOnHandModal,
  } = useCashOnHandModal({
    loading: endingShift,
    onAutoCalculate: () => submitEndShift(null),
    onCancel: resetEndShiftState,
    onConfirm: submitEndShift,
  });
  const { cashierReportModalHolder, openCashierReportModal } = useCashierReportModal({
    currencySymbol,
    onClose: finishLogout,
  });

  function resetEndShiftState() {
    closeCashOnHandModal();
    setClockOutPhotoAssetId(null);
    setEndingShift(false);
  }

  const openCashOnHandModal = (assetId = null) => {
    setClockOutPhotoAssetId(assetId);
    showCashOnHandModal();
  };

  async function submitEndShift(cashOnHand) {
    const waiterId = user?.id;

    if (!waiterId || endingShift) {
      return;
    }

    setEndingShift(true);

    try {
      const clockReportParams = {
        restaurant_waiter_id: waiterId,
        waiter_clock_type: 2,
        clock_out_local_image: clockOutPhotoAssetId,
      };

      if (cashOnHand !== undefined && cashOnHand !== null) {
        clockReportParams.cash_on_hand = toCents(cashOnHand);
      }

      // 交接班签退对齐在线端 clockReportData：下班打卡、手头现金、班次报表由主进程一次完成。
      const report = await window.api.staff.clockReportData(clockReportParams);
      console.log(report, "report data");

      // 下班打卡成功后展示当前班次报告，关闭报告时再退出登录。
      if (report) {
        openCashierReportModal(report);
      } else {
        await finishLogout();
      }

      closeCashOnHandModal();
    } catch (error) {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    } finally {
      setEndingShift(false);
    }
  }

  const handleEndShift = async () => {
    if (endingShift) {
      return;
    }

    setEndingShift(true);

    try {
      const count = await window.api.orders.getUncompleteOrderCount();

      // 交接班前必须先处理未完成订单，和在线收银端保持一致。
      if (Number(count) > 0) {
        modal.confirm({
          title: t("tips.click_end_shift_tips_title"),
          content: t("tips.click_end_shift_tips_content"),
          okText: t("tips.click_end_shift_tips_confirm"),
          cancelButtonProps: { style: { display: "none" } },
          onOk: () => {
            onItemClick?.();
            navigate("/offline-orders");
          },
        });
        return;
      }

      // 开启签退拍照时先拍照，再录入手头现金。
      if (isClockPhotoEnabled) {
        const clockOutPhoto = await openCameraCapture({
          title: t("staff.clock_out_photo"),
          capturedAlt: t("staff.captured_clock_out_photo"),
          sourceKey: "end-shift-clock-out-photo",
          cancelText: t("components.cancel"),
        });

        if (!clockOutPhoto) {
          return;
        }

        openCashOnHandModal(clockOutPhoto.asset?.id ?? null);
        return;
      }

      openCashOnHandModal();
    } catch (error) {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    } finally {
      setEndingShift(false);
    }
  };

  const activeMenuKey = visibleMenuList
    .filter((item) => isRouteMatched(location.pathname, item.route))
    .sort((prev, next) => next.route.length - prev.route.length)[0]?.key;

  const handleVersionTap = () => {
    if (versionTapRef.current.timer) {
      clearTimeout(versionTapRef.current.timer);
    }

    versionTapRef.current.count += 1;
    versionTapRef.current.timer = setTimeout(() => {
      versionTapRef.current.count = 0;
      versionTapRef.current.timer = null;
    }, 1500);

    // 开发者日志入口：版本号连续点击 8 次后打开隐藏页面。
    if (versionTapRef.current.count >= 8) {
      versionTapRef.current.count = 0;
      navigate("/developer-logs");
      onItemClick?.();
    }
  };

  return (
    <div className={`w-[358px] h-full min-h-0 overflow-hidden ${className} flex flex-col`}>
      {contextHolder}
      {modalContextHolder}
      {cameraCaptureHolder}
      {cashOnHandModalHolder}
      {cashierReportModalHolder}
      {/* 餐厅名称等 */}
      <p className="m-0! p-4 text-[18px] font-medium text-primary border-b border-line">
        {restaurantSetting.name}
        <span className="block cursor-default text-[13px] text-[#7F99CB]" onClick={handleVersionTap}>
          {t("system.app_version", { version: "1.0.4" })}
        </span>
      </p>
      {/* 菜单列表 */}
      {/* 小窗口时仅菜单列表滚动，底部账号和退出操作保持在侧栏内。 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {visibleMenuList.map((item) => (
          <MenuItem
            key={item.key}
            module={item}
            onItemClick={onItemClick}
            active={item.key === activeMenuKey}
          ></MenuItem>
        ))}
      </div>
      {/* 账号，退出登录等 */}
      <div className="w-full flex-none bg-white">
        <div className="py-3">
          <p className="m-0! text-center text-info text-[17px] font-medium">{user ? `${roleName}(${name})` : "-"}</p>
          <p className="m-0! text-center text-info text-[13px]">
            {t("staff.login_time")}: {user?.last_login_time || "-"}
          </p>
        </div>

        {isClockEnabled ? (
          <div
            className={`w-full p-4 border-t border-line text-center ${
              endingShift ? "cursor-wait opacity-60" : "cursor-pointer"
            }`}
            onClick={handleEndShift}
          >
            <span className="text-danger font-medium text-[17px]">{t("staff.end_your_shift")}</span>
          </div>
        ) : null}
        <div
          className={`w-full p-4 border-t border-line text-center ${
            checkingLogoutShift ? "cursor-wait opacity-60" : "cursor-pointer"
          }`}
          onClick={handleLogout}
        >
          <span className="text-danger font-medium text-[17px]">{t("components.logout")}</span>
        </div>
      </div>
    </div>
  );
};

MenuItem.propTypes = {
  module: PropTypes.object,
  onItemClick: PropTypes.func,
  active: PropTypes.bool,
};
VerticalMenu.propTypes = {
  className: PropTypes.string,
  onItemClick: PropTypes.func,
};

export default VerticalMenu;
