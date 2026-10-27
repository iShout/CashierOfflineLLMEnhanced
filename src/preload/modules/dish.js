import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";

export const dishApi = {
  getCategoryList(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.DISH.GET_CATEGORY_LIST, params);
  },
};
