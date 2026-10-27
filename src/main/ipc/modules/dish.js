import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";
import { getCategoryList } from "@db/DBManager/dish-nonsync";

export function registerDishHandlers() {
  ipcMain.handle(IPC_CHANNELS.DISH.GET_CATEGORY_LIST, async () => {
    return getCategoryList();
  });
}
