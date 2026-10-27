import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";

export const fileApi = {
  // 打开系统文件夹选择弹窗，返回用户选择的目录路径。
  selectFolder() {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.SELECT_FOLDER);
  },
};
