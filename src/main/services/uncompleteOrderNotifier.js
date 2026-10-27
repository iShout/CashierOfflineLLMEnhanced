import { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";
import { getUncompleteOrderCount } from "@db/DBManager/order-nonsync";

export function notifyUncompleteOrderCountChanged() {
  let count = 0;

  try {
    count = getUncompleteOrderCount();
  } catch (error) {
    console.warn("Failed to calculate uncomplete order count:", error);
    return;
  }

  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.ORDERS.UNCOMPLETE_ORDER_COUNT_CHANGED, {
        count,
      });
    }
  });
}
