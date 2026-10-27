import { app, session, BrowserWindow } from "electron";
import { join } from "path";
import { electronApp, is } from "@electron-toolkit/utils";

import icon from "../../resources/icon.png?asset";
import { initDB } from "@db/index";
import { registerIpcHandlers } from "./ipc";
import { initAppLogger } from "./services/appLogger";

import { registerLocalAssetProtocolHandler, registerLocalAssetProtocolScheme } from "./protocol/local-assets";

registerLocalAssetProtocolScheme();

const allowRendererDevTools = is.dev || import.meta.env.MAIN_VITE_ALLOW_RENDERER_DEVTOOLS === "true";

function registerWindowShortcuts(window) {
  if (!window) return;

  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    const isDevToolsShortcut =
      input.code === "F12" || (input.code === "KeyI" && ((input.alt && input.meta) || (input.control && input.shift)));

    if (isDevToolsShortcut) {
      if (allowRendererDevTools) {
        // 测试包允许现场打开渲染进程控制台，生产包保持关闭。
        if (window.webContents.isDevToolsOpened()) {
          window.webContents.closeDevTools();
        } else {
          window.webContents.openDevTools({ mode: "undocked" });
        }
      }

      event.preventDefault();
      return;
    }

    if (!is.dev && input.code === "KeyR" && (input.control || input.meta)) {
      event.preventDefault();
    }
  });
}

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 670,
    minWidth: 1000,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    // mainWindow.showInactive();
    mainWindow.showInactive();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.electron");

  app.on("browser-window-created", (_, window) => {
    registerWindowShortcuts(window);
  });

  // 纯离线版禁止外网资源请求；开发时仅放行本机 Vite 与热更新连接。
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      const hostname = new URL(details.url).hostname;
      const localDevelopment = is.dev && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
      callback({ cancel: !localDevelopment });
    },
  );

  initDB();
  initAppLogger();
  registerLocalAssetProtocolHandler();
  registerIpcHandlers();

  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
