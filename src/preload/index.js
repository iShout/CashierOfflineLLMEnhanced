import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import { exposePreloadApis } from "./bridge/expose";
import { customApi } from "./modules";

exposePreloadApis({
  contextBridge,
  electronAPI,
  customApi,
  isContextIsolated: process.contextIsolated,
});
