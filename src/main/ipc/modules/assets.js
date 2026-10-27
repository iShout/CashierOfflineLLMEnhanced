import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";
import {
  getLocalAssetById,
  getLocalAssetBySourceUrl,
  getLocalAssetFileUrl,
  saveImageFromDataUrl,
  withLocalFileUrl,
} from "@db/DBManager/local-assets";

// 注册本地资源相关 IPC，renderer 只能通过这些方法间接访问文件系统。
export function registerAssetsHandlers() {
  // 保存图片 data URL，并返回资源记录和本地 file:// 地址。
  ipcMain.handle(
    IPC_CHANNELS.ASSETS.SAVE_IMAGE_FROM_DATA_URL,
    (_event, payload) => {
      return saveImageFromDataUrl(payload);
    },
  );

  // 根据资源ID读取元信息，便于业务表只保存 asset id。
  ipcMain.handle(IPC_CHANNELS.ASSETS.GET_LOCAL_ASSET_BY_ID, (_event, id) => {
    const asset = getLocalAssetById(id);
    return asset ? withLocalFileUrl(asset) : null;
  });

  // 根据远程URL读取缓存记录，便于服务器图片离线展示。
  ipcMain.handle(
    IPC_CHANNELS.ASSETS.GET_LOCAL_ASSET_BY_SOURCE_URL,
    (_event, sourceUrl) => {
      const asset = getLocalAssetBySourceUrl(sourceUrl);
      return asset ? withLocalFileUrl(asset) : null;
    },
  );

  // 只需要展示图片时，可直接获取 img src 可用的 file:// 地址。
  ipcMain.handle(IPC_CHANNELS.ASSETS.GET_LOCAL_ASSET_FILE_URL, (_event, id) => {
    return getLocalAssetFileUrl(id);
  });
}
