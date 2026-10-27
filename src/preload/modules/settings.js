import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";

export const settingsApi = {
  getRestaurantSettingsById(restaurantId) {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_RESTAURANT_SETTINGS_BY_ID, restaurantId);
  },
  // 获取当前登录餐厅和设备对应的 BIR 信息。
  getBirInfo() {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_BIR_INFO);
  },

  // 获取当前餐厅商场认证设置。
  getMallCertificationSettings() {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_MALL_CERTIFICATION_SETTINGS);
  },
  // 保存当前餐厅商场认证设置。
  saveMallCertificationSettings(settings) {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SAVE_MALL_CERTIFICATION_SETTINGS, settings);
  },
  // 打开商场认证目录选择弹窗。
  selectMallCertificationFolder() {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SELECT_MALL_CERTIFICATION_FOLDER);
  },
  // 按日期范围补生成商场认证文件。
  regenerateMallCertificationFiles(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.REGENERATE_MALL_CERTIFICATION_FILES, params);
  },
  // 初始化 SM 商场认证 CSV 文件。
  initializeMallCertificationFiles() {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.INITIALIZE_MALL_CERTIFICATION_FILES);
  },
};
