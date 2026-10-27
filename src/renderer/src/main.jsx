import "./assets/main.css";
import "antd/dist/reset.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import AntdProvider from "./providers/AntdProvider";

import router from "./router";
import i18n from "./lang";
import store, { selectToken } from "./store";
import { installRendererAppLogger } from "./utils/appLogger";

import { hasDefaultOrderingSettings } from "./router/defaultOrderingRoute";

const setRestaurantSetting = store.getState().setRestaurantSetting;

const setLocalDeviceIdentityId = store.getState().setLocalDeviceIdentityId;
const setLocalHardwareIdentity = store.getState().setLocalHardwareIdentity;
let currentSessionKey = "";
let currentRestaurantSettingRequestId = null; // 防止免登录恢复时重复请求餐厅设置。
let currentMallCertificationInitKey = null; // 防止同一登录餐厅重复初始化商场认证文件。
// 防止网络抖动时重复触发订单积压上传。
const rendererLogger = installRendererAppLogger();

const reportRendererError = (message, error) => {
  rendererLogger.record(message, {
    level: "error",
    tag: "System",
    stack: error?.stack ?? null,
    context: {
      _source: "window-event",
      ...(error
        ? {
            name: error?.name,
          }
        : {}),
    },
  });
};

window.addEventListener("error", (event) => {
  // 上线环境无法方便打开 DevTools，因此把渲染进程未捕获错误写入主进程日志表。
  reportRendererError(event.message, event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);

  reportRendererError(message, reason instanceof Error ? reason : null);
});

const normalizeLanguage = (locale) => {
  if (locale === "zh-CN") return "zh";
  return ["en", "zh", "km", "th"].includes(locale) ? locale : "en";
};

const getSessionKey = (state) => {
  const token = selectToken(state) || "";
  const user = state.user;

  return JSON.stringify({
    token,
    userId: user?.id ?? null,
    waiterNo: user?.waiter_no ?? null,
    account: user?.account ?? null,
    restaurantId: user?.restaurant_id ?? null,
  });
};

const syncSessionToMain = (state) => {
  const token = selectToken(state) || "";
  const user = state.user || null;

  if (token && state.isLoginFlowPending && !user) {
    return Promise.resolve();
  }

  // 主进程负责本地 DB 和 IPC，免登录恢复后也必须同步当前登录人。
  if (!token || !user) {
    return window.api.auth.clearSession();
  }

  return window.api.auth.setSession({
    token,
    user,
  });
};

// user 可能来自正常登录，也可能来自 zustand persist 恢复的免登录状态。
// 免登录恢复不会经过登录页，所以这里根据 user.restaurant_id 补齐本地餐厅设置。
const syncRestaurantSettingFromUser = async (state) => {
  const user = state.user;
  const restaurantSetting = state.restaurantSetting;
  const restaurantId = user?.restaurant_id;

  if (!restaurantId) {
    currentRestaurantSettingRequestId = null;
    return;
  }

  // 旧版持久化数据缺少入口路由配置时必须重新读取，避免按不完整设置选择默认页。
  if (restaurantSetting?.restaurant_id === restaurantId && hasDefaultOrderingSettings(restaurantSetting)) {
    currentRestaurantSettingRequestId = null;
    return;
  }

  if (currentRestaurantSettingRequestId === restaurantId) {
    return;
  }

  currentRestaurantSettingRequestId = restaurantId;

  try {
    const nextRestaurantSetting = await window.api.settings.getRestaurantSettingsById(restaurantId);
    const latestRestaurantId = store.getState().user?.restaurant_id;

    if (latestRestaurantId === restaurantId) {
      setRestaurantSetting(nextRestaurantSetting);
    }
  } catch (error) {
    console.error("Failed to sync restaurant setting:", error);
  } finally {
    if (currentRestaurantSettingRequestId === restaurantId) {
      currentRestaurantSettingRequestId = null;
    }
  }
};

const hydrateLocalDeviceIdentity = async () => {
  try {
    const localDeviceIdentityId = await window.api.app.getDeviceIdentity();
    const hardwareSnapshot = await window.api.app.getLocalHardwares();

    // 本机应用身份只用于本地文件和日志，不再映射为业务 POS。
    setLocalDeviceIdentityId(localDeviceIdentityId);
    setLocalHardwareIdentity({
      device_id: localDeviceIdentityId,
      hardware_snapshot: hardwareSnapshot || {},
    });
  } catch (error) {
    console.error("Failed to hydrate local device identity:", error);
  }
};

// 登录态恢复后初始化 SM 商场认证 CSV，非 SM 设置主进程会直接跳过。
const initializeMallCertificationFilesFromSession = async (state) => {
  const token = selectToken(state) || "";
  const restaurantId = state.user?.restaurant_id;

  if (!token || !restaurantId) {
    currentMallCertificationInitKey = null;
    return;
  }

  const initKey = `${token}:${restaurantId}`;
  if (currentMallCertificationInitKey === initKey) {
    return;
  }

  currentMallCertificationInitKey = initKey;

  try {
    await window.api.settings.initializeMallCertificationFiles();
  } catch (error) {
    console.error("Failed to initialize mall certification files:", error);
  }
};

hydrateLocalDeviceIdentity();

i18n.changeLanguage(normalizeLanguage(store.getState().locale));

const startupState = store.getState();
currentSessionKey = getSessionKey(startupState);
syncSessionToMain(startupState).finally(() => {
  initializeMallCertificationFilesFromSession(store.getState());
});
// 首次启动时先处理 persist 恢复的免登录状态：同步主进程 session、补餐厅设置、恢复本地设置。
syncRestaurantSettingFromUser(startupState);

// store 订阅用于覆盖免登录恢复和账号切换：renderer 状态变化后，把跨进程 session 和派生状态补齐。
store.subscribe((state) => {
  const nextSessionKey = getSessionKey(state);
  if (nextSessionKey === currentSessionKey) {
    // 登录人没变时，继续补齐本地餐厅设置。
    syncRestaurantSettingFromUser(state);

    initializeMallCertificationFilesFromSession(state);
    return;
  }

  currentSessionKey = nextSessionKey;
  // 登录人发生变化时，必须先同步主进程 session，再让后续 IPC/DB 查询使用新用户。
  syncSessionToMain(state).finally(() => {
    initializeMallCertificationFilesFromSession(store.getState());
  });
  syncRestaurantSettingFromUser(state);
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AntdProvider>
      <RouterProvider router={router} />
    </AntdProvider>
  </StrictMode>,
);
