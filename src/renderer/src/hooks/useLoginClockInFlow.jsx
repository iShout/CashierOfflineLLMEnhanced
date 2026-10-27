import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import CONSTANT from "@renderer/const";
import useStore from "@renderer/store";
import useCameraCapture from "@renderer/hooks/useCameraCapture";

const CLOCK_PHOTO_STATUS = {
  ON: 1,
  OFF: 2,
};

const isClockEnabled = (waiter) => waiter?.clock_status === CONSTANT.CLOCK_STATUS.ON;
const isClockPhotoEnabled = (restaurantSetting) => restaurantSetting?.clock_photo_status === CLOCK_PHOTO_STATUS.ON;

const useLoginClockInFlow = () => {
  const { t } = useTranslation();
  const { cameraCaptureHolder, openCameraCapture } = useCameraCapture();
  const setUpdateOpenFund = useStore((state) => state.setUpdateOpenFund);

  const hasLocalActiveClockRecord = useCallback(async (waiter) => {
    if (!waiter?.id) {
      return false;
    }

    // 统一查询本地打卡状态，避免新用户同步重试或重复确认时生成重复上班卡。
    const clockState = await window.api.staff.getStaffClockState({
      restaurant_waiter_id: waiter.id,
    });

    return Boolean(clockState?.is_clocked_in);
  }, []);

  const clockInAfterLogin = useCallback(
    async ({ waiter, clockInLocalImage }) => {
      const waiterId = waiter?.id;

      if (!waiterId) {
        throw new Error("Login waiter id is missing.");
      }

      // 登录打卡对齐在线端 cashier/clock，先以 0 写入 opening_fund，进入系统后再补录。
      await window.api.staff.clock({
        restaurant_waiter_id: waiterId,
        waiter_clock_type: 1,
        opening_fund: 0,
        clock_in_local_image: clockInLocalImage ?? null,
      });
      setUpdateOpenFund(true);
    },
    [setUpdateOpenFund],
  );

  const completeLoginClockInIfNeeded = useCallback(
    async ({ waiter, restaurantSetting }) => {
      if (!isClockEnabled(waiter)) {
        return false;
      }

      if (await hasLocalActiveClockRecord(waiter)) {
        return false;
      }

      if (isClockPhotoEnabled(restaurantSetting)) {
        const loginPhoto = await openCameraCapture({
          title: t("staff.take_login_photo"),
          capturedAlt: t("staff.captured_login_photo"),
          sourceKey: "login-photo",
          canCancel: false,
        });

        await clockInAfterLogin({
          waiter,
          clockInLocalImage: loginPhoto?.asset?.id,
        });
        return true;
      }

      await clockInAfterLogin({
        waiter,
        clockInLocalImage: null,
      });
      return true;
    },
    [clockInAfterLogin, hasLocalActiveClockRecord, openCameraCapture, t],
  );

  return {
    cameraCaptureHolder,
    completeLoginClockInIfNeeded,
  };
};

export default useLoginClockInFlow;
