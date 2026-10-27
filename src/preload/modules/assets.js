import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";

// 暴露给 renderer 的本地资源 API，具体文件读写统一留在主进程。
export const assetsApi = {
  // 保存摄像头/canvas 生成的图片 data URL。
  saveImageFromDataUrl(payload) {
    return ipcRenderer.invoke(
      IPC_CHANNELS.ASSETS.SAVE_IMAGE_FROM_DATA_URL,
      payload,
    );
  },
  // 通过本地资源ID查询资源记录。
  getLocalAssetById(id) {
    return ipcRenderer.invoke(IPC_CHANNELS.ASSETS.GET_LOCAL_ASSET_BY_ID, id);
  },
  // 通过远程URL查询已缓存的本地资源。
  getLocalAssetBySourceUrl(sourceUrl) {
    return ipcRenderer.invoke(
      IPC_CHANNELS.ASSETS.GET_LOCAL_ASSET_BY_SOURCE_URL,
      sourceUrl,
    );
  },
  // 获取可直接用于 img src 的本地 file:// 地址。
  getLocalAssetFileUrl(id) {
    return ipcRenderer.invoke(IPC_CHANNELS.ASSETS.GET_LOCAL_ASSET_FILE_URL, id);
  },
};
