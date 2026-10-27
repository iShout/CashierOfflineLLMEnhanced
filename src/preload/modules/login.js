import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";

export const loginApi = {
  validate(account, password) {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGIN.VALIDATE, account, password);
  },

  getLocalWaiterByAccount(account) {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGIN.GET_LOCAL_WAITER_BY_ACCOUNT, account);
  },
  getSavedCredential() {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGIN.GET_SAVED_CREDENTIAL);
  },
  saveCredential(payload) {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGIN.SAVE_CREDENTIAL, payload);
  },
  clearSavedCredential() {
    return ipcRenderer.invoke(IPC_CHANNELS.LOGIN.CLEAR_SAVED_CREDENTIAL);
  },
};
