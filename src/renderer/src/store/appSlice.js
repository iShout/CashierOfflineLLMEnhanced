// 全局状态只保留本机身份、界面和收银流程所需字段。
const initialAppState = {
  locale: "en",
  theme: "light",
  isLoading: false,
  swifood_platform: 3,
  swifood_version: "1.0.4",
  localDeviceIdentityId: "",
  localHardwareIdentity: null,
  uncompleteOrderCount: 0,
  updateOpenFund: false,
};
export const createAppSlice = (set) => ({
  ...initialAppState,
  setLocale: (locale) => set({ locale }),
  setTheme: (theme) => set({ theme }),
  setLoading: (isLoading) => set({ isLoading }),
  setLocalDeviceIdentityId: (localDeviceIdentityId) => set({ localDeviceIdentityId: localDeviceIdentityId || "" }),
  setLocalHardwareIdentity: (localHardwareIdentity) => set({ localHardwareIdentity: localHardwareIdentity || null }),
  resetApp: () => set(initialAppState),
  setUncompleteOrderCount: (uncompleteOrderCount) => set({ uncompleteOrderCount: Number(uncompleteOrderCount ?? 0) }),
  setUpdateOpenFund: (updateOpenFund) => set({ updateOpenFund }),
});
