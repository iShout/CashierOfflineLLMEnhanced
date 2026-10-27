import { ipcMain } from "electron";

import { RESPONSE_CODE } from "@shared/constants/enums";
import { IPC_CHANNELS } from "@shared/ipc/channels";
import { getLocalWaiterByAccount, validateWaiter } from "@db/DBManager/waiter-permission";
import { setCurrentSession } from "@main/authManager";
import {
  clearSavedLoginCredential,
  getSavedLoginCredential,
  saveLoginCredential,
} from "@main/services/loginCredential";
import { initializeLocalSettingSequencesForRestaurant } from "@db/DBManager/local-setting";

const setSessionFromLoginResponse = (res) => {
  const token = res?.data?.token || "";
  const user = res?.data?.waiter || null;

  if (!token || !user) return;

  setCurrentSession({
    token,
    user,
  });
  initializeLocalSettingSequencesForRestaurant(user?.restaurant_id);
};

export function registerLoginHandlers() {
  ipcMain.handle(IPC_CHANNELS.LOGIN.VALIDATE, async (event, account, password) => {
    const res = await validateWaiter(account, password);
    setSessionFromLoginResponse(res);
    return res;
  });

  ipcMain.handle(IPC_CHANNELS.LOGIN.GET_LOCAL_WAITER_BY_ACCOUNT, (_event, account) => {
    return getLocalWaiterByAccount(account);
  });
  ipcMain.handle(IPC_CHANNELS.LOGIN.GET_SAVED_CREDENTIAL, () => {
    return {
      code: RESPONSE_CODE.SUCCESS,
      message: "Saved login credential fetched",
      data: getSavedLoginCredential(),
    };
  });
  ipcMain.handle(IPC_CHANNELS.LOGIN.SAVE_CREDENTIAL, (_event, payload) => {
    // 凭据持久化统一放在主进程，避免 renderer 直接接触本地落盘细节。
    return {
      code: RESPONSE_CODE.SUCCESS,
      message: "Saved login credential updated",
      data: saveLoginCredential(payload),
    };
  });
  ipcMain.handle(IPC_CHANNELS.LOGIN.CLEAR_SAVED_CREDENTIAL, () => {
    clearSavedLoginCredential();
    return {
      code: RESPONSE_CODE.SUCCESS,
      message: "Saved login credential cleared",
      data: true,
    };
  });
}
