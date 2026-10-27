import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";

export const appApi = {
  getVersion() {
    return ipcRenderer.invoke(IPC_CHANNELS.APP.GET_VERSION);
  },

  getEnv() {
    return ipcRenderer.invoke(IPC_CHANNELS.APP.GET_ENV);
  },

  getDeviceIdentity() {
    return ipcRenderer.invoke(IPC_CHANNELS.APP.GET_DEVICE_IDENTITY);
  },

  getLocalHardwares() {
    return ipcRenderer.invoke(IPC_CHANNELS.APP.GET_LOCAL_HARDWARES);
  },

  logMessage(message, options = {}) {
    ipcRenderer.send(IPC_CHANNELS.APP.LOG_MESSAGE, {
      message,
      ...options,
      timestamp: Date.now(),
    });
  },
};
