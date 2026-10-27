import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../../shared/ipc/channels";
import { clearAppLogs, queryAppLogs } from "@db/DBManager/logs";

export function registerLogsHandlers() {
  ipcMain.handle(IPC_CHANNELS.LOGS.GET_ENTRIES, (_event, query) => {
    return queryAppLogs(query);
  });

  ipcMain.handle(IPC_CHANNELS.LOGS.CLEAR, () => {
    clearAppLogs();

    return true;
  });
}
