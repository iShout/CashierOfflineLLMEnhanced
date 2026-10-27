import { registerAuthHandlers } from "./modules/auth";
import { registerAppHandlers } from "./modules/app";
import { registerLoginHandlers } from "./modules/login";

import { registerOrdersHandlers } from "./modules/orders";
import { registerSettingsHandlers } from "./modules/settings";
import { registerAssetsHandlers } from "./modules/assets";
import { registerStaffHandlers } from "./modules/staff";
import { registerReportHandlers } from "./modules/report";
import { registerDishHandlers } from "./modules/dish";

import { registerFileHandlers } from "./modules/file";
import { registerLogsHandlers } from "./modules/logs";
import { registerAgentHandlers } from "./modules/agent";

export function registerIpcHandlers() {
  registerAuthHandlers();
  registerAppHandlers();
  registerLoginHandlers();
  registerOrdersHandlers();
  registerSettingsHandlers();
  registerAssetsHandlers();
  registerStaffHandlers();
  registerReportHandlers();
  registerDishHandlers();
  registerFileHandlers();
  registerLogsHandlers();
  registerAgentHandlers();
}
