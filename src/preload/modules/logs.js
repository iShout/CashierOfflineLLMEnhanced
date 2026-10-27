import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";

export const logsApi = {
  getEntries(query) {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGS.GET_ENTRIES, query);
  },

  clear() {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGS.CLEAR);
  },
};
