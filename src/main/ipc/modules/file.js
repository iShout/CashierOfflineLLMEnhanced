import { ipcMain } from "electron";
import { selectFolder } from "@db/utils/file";
import { IPC_CHANNELS } from "@shared/ipc/channels";

export function registerFileHandlers() {
  // 选择文件夹：纯前端交互所需的系统目录选择弹窗。
  ipcMain.handle(IPC_CHANNELS.FILE.SELECT_FOLDER, () => {
    return selectFolder();
  });
}
