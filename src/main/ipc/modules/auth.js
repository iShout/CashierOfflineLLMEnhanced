import { ipcMain } from "electron";

import { IPC_CHANNELS } from "@shared/ipc/channels";
import { clearCurrentSession, setCurrentSession } from "@main/authManager";
import { initializeLocalSettingSequencesForRestaurant } from "@db/DBManager/local-setting";

import {
  startScheduledOrderTaskManager,
  stopScheduledOrderTaskManager,
} from "@main/services/scheduledOrderTaskManager";

export function registerAuthHandlers() {
  ipcMain.handle(IPC_CHANNELS.AUTH.SET_SESSION, (_event, session) => {
    const token = session?.token || "";

    if (!token || !session?.user) {
      clearCurrentSession();
      stopScheduledOrderTaskManager();
      return true;
    }

    setCurrentSession({
      token,
      user: session.user,
    });
    initializeLocalSettingSequencesForRestaurant(session.user?.restaurant_id);
    // 登录餐厅恢复后即可扫描任务，离线任务不再依赖 POS 绑定身份。
    startScheduledOrderTaskManager();

    return true;
  });

  ipcMain.handle(IPC_CHANNELS.AUTH.CLEAR_SESSION, () => {
    clearCurrentSession();
    stopScheduledOrderTaskManager();
    return true;
  });
}
