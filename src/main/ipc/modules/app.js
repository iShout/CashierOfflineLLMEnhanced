import { app, ipcMain } from "electron";
import { IPC_CHANNELS } from "../../../shared/ipc/channels";

import { getDeviceIdentity } from "@main/services/deviceIdentity";
import { getLocalHardwareSnapshot } from "@db/DBManager/device-identity";
import { recordRendererLog } from "@main/services/appLogger";

export function registerAppHandlers() {
  ipcMain.handle(IPC_CHANNELS.APP.GET_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.APP.GET_ENV, () => {
    return {
      isPackaged: app.isPackaged,
      platform: process.platform,
    };
  });

  // 获取当前安装实例的稳定设备 ID，首次调用时会生成并持久化到本地数据库。
  ipcMain.handle(IPC_CHANNELS.APP.GET_DEVICE_IDENTITY, async () => {
    const identity = await getDeviceIdentity();

    return identity.deviceId;
  });

  // 查询首次生成设备 ID 时保存的本机硬件快照，供 renderer 展示或提交调试信息。
  ipcMain.handle(IPC_CHANNELS.APP.GET_LOCAL_HARDWARES, async () => {
    await getDeviceIdentity();

    return getLocalHardwareSnapshot();
  });

  ipcMain.on(IPC_CHANNELS.APP.LOG_MESSAGE, (_event, payload) => {
    recordRendererLog({
      level: payload?.level ?? "log",
      source: payload?.source ?? "renderer",
      tag: payload?.tag,
      message: payload?.message ?? payload,
      stack: payload?.stack,
      context: payload?.context ?? { timestamp: payload?.timestamp },
    });
  });
}
