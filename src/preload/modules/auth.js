import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";

export const authApi = {
  setSession(session) {
    return ipcRenderer.invoke(IPC_CHANNELS.AUTH.SET_SESSION, session);
  },
  clearSession() {
    return ipcRenderer.invoke(IPC_CHANNELS.AUTH.CLEAR_SESSION);
  },
};
