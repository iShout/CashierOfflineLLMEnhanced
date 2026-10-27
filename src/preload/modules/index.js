import { coreApi, wrapApiErrors } from "./core";
import { appApi } from "./app";
import { authApi } from "./auth";
import { loginApi } from "./login";

import { ordersApi } from "./orders";
import { settingsApi } from "./settings";
import { assetsApi } from "./assets";
import { staffApi } from "./staff";
import { reportApi } from "./report";
import { dishApi } from "./dish";

import { fileApi } from "./file";
import { logsApi } from "./logs";
import { agentApi } from "./agent";

const rawCustomApi = {
  ...coreApi,
  app: appApi,
  file: fileApi,
  logs: logsApi,
  agent: agentApi,
  auth: authApi,
  login: loginApi,
  orders: ordersApi,
  settings: settingsApi,
  assets: assetsApi,
  staff: staffApi,
  report: reportApi,
  dish: dishApi,
};

export const customApi = wrapApiErrors(rawCustomApi);
