import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";
import {
  getBirInfo,
  getMallCertificationSettings,
  getRestaurantSettingsById,
  initializeMallCertificationFiles,
  regenerateMallCertificationFiles,
  saveMallCertificationSettings,
  selectMallCertificationFolder,
} from "@db/DBManager/restaurant-settings-nonsync";

export function registerSettingsHandlers() {
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_RESTAURANT_SETTINGS_BY_ID, (_event, restaurantId) => {
    return getRestaurantSettingsById(restaurantId);
  });

  // BIR 信息只从当前登录 session 派生餐厅身份，避免渲染进程传错餐厅。
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_BIR_INFO, () => {
    return getBirInfo();
  });

  // 商场认证设置读取：数据来自本地 settings 表。
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_MALL_CERTIFICATION_SETTINGS, () => {
    return getMallCertificationSettings();
  });

  // 商场认证设置保存：本地持久化，不请求服务器。
  ipcMain.handle(IPC_CHANNELS.SETTINGS.SAVE_MALL_CERTIFICATION_SETTINGS, (_event, settings) => {
    return saveMallCertificationSettings(settings);
  });

  // 商场认证目录选择：归属 SETTINGS 模块。
  ipcMain.handle(IPC_CHANNELS.SETTINGS.SELECT_MALL_CERTIFICATION_FOLDER, () => {
    return selectMallCertificationFolder();
  });

  // 商场认证补生成：主进程直接查询 SQLite 并写入本地文件。
  ipcMain.handle(IPC_CHANNELS.SETTINGS.REGENERATE_MALL_CERTIFICATION_FILES, (_event, params) => {
    return regenerateMallCertificationFiles(params);
  });

  // 商场认证初始化：主要用于 SM 最近 30 天 CSV 文件。
  ipcMain.handle(IPC_CHANNELS.SETTINGS.INITIALIZE_MALL_CERTIFICATION_FILES, () => {
    return initializeMallCertificationFiles();
  });
}
