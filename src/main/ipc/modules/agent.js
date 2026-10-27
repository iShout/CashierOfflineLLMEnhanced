import { app, ipcMain } from "electron";
import { resolve } from "node:path";
import { config } from "dotenv";
import { IPC_CHANNELS } from "@shared/ipc/channels";
import { getCurrentSession } from "@main/authManager";

export function registerAgentHandlers() {
  ipcMain.handle(IPC_CHANNELS.AGENT.ASK, async (_event, question) => {
    // 调用模型前先确认登录和餐厅，避免无权限请求先发送到云端。
    const initialSession = getCurrentSession();
    const initialRestaurantId = initialSession.user?.restaurant_id;

    if (!initialRestaurantId) {
      throw new Error("当前登录会话缺少餐厅信息，请重新登录。");
    }

    if (typeof question !== "string" || !question.trim()) {
      throw new Error("请输入需要查询的问题。");
    }

    // 开发环境继续读取 agent/.env；安装包读取 userData/agent.env。
    const envPath = app.isPackaged
      ? resolve(app.getPath("userData"), "agent.env")
      : resolve(app.getAppPath(), "agent/.env");

    config({ path: envPath, quiet: true });

    // 按需加载模型代码，未使用 Agent 时不创建模型或发起请求。
    const { runCashierAgent } = await import("@agent/run");
    const result = await runCashierAgent(question);

    // 模型调用期间如果发生退出登录或切换餐厅，不返回旧请求结果。
    const currentSession = getCurrentSession();
    if (currentSession.token !== initialSession.token || currentSession.user?.restaurant_id !== initialRestaurantId) {
      throw new Error("登录会话或餐厅已变化，请重新发起查询。");
    }

    return result;
  });
}
