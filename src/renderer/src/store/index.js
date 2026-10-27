import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { createAppSlice } from "./appSlice";
import { createFoodSlice } from "./foodSlice";
import { createPermissionSlice } from "./permissionSlice";
import { createStaffSlice } from "./staffSlice";
import { createUserSlice } from "./userSlice";

const createStore = (set, get, api) => ({
  ...createAppSlice(set, get, api),
  ...createUserSlice(set, get, api),
  ...createStaffSlice(set, get, api),
  ...createPermissionSlice(set, get, api),
  ...createFoodSlice(set, get, api),
  resetAll: () => {
    get().resetApp();
    get().logout();
    get().resetStaff();
    get().clearPermissions();
    get().resetFoods();
  },
});

const useStore = create()(
  devtools(
    persist(createStore, {
      name: "swifood-store",
      version: 3,
      // 升级 Agent 聚焦版时保留业务会话，移除旧同步、打印设备和 POS 绑定状态。
      migrate: (state) => {
        return Object.fromEntries(
          Object.entries(state).filter(
            ([key]) =>
              !["requiresDataSync", "lastSyncEventTime", "isOnline", "attachedUsbDevices", "deviceNo"].includes(key),
          ),
        );
      },
      partialize: (state) => ({
        locale: state.locale,
        theme: state.theme,
        user: state.user,
        bir_info: state.bir_info,
        restaurantSetting: state.restaurantSetting,
        token: state.token,
        loginAccount: state.loginAccount,
        authList: state.authList,
        localDeviceIdentityId: state.localDeviceIdentityId,
        localHardwareIdentity: state.localHardwareIdentity,
      }),
    }),
    { name: "swifood-store" },
  ),
);

export const selectUser = (state) => state.user;
export const selectToken = (state) => state.token;
export const getUser = () => useStore.getState().user;
export const getToken = () => useStore.getState().token;

export default useStore;
