import { app, ipcMain } from "electron";
import { resolve } from "node:path";
import { config } from "dotenv";
import { IPC_CHANNELS } from "@shared/ipc/channels";
import { getCurrentSession } from "@main/authManager";

const CONVERSATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const loadAgentEnvironment = () => {
  // 开发环境继续读取 agent/.env；安装包读取 userData/agent.env。
  const envPath = app.isPackaged
    ? resolve(app.getPath("userData"), "agent.env")
    : resolve(app.getAppPath(), "agent/.env");

  config({ path: envPath, quiet: true });
};

export const resolveAgentThreadId = (session, conversationId) => {
  if (typeof conversationId !== "string" || !CONVERSATION_ID_PATTERN.test(conversationId)) {
    throw new Error("无效的 Agent 会话标识。");
  }

  const restaurantId = session.user?.restaurant_id;
  const userId = session.user?.id;

  if (!restaurantId || !userId) {
    throw new Error("当前登录会话缺少餐厅或账号信息。");
  }

  // 会话同时按餐厅、账号和页面 conversationId 隔离。
  return `restaurant:${restaurantId}:user:${userId}:conversation:${conversationId}`;
};

const assertSessionUnchanged = (initialSession) => {
  const currentSession = getCurrentSession();

  if (
    currentSession.token !== initialSession.token ||
    currentSession.user?.restaurant_id !== initialSession.user?.restaurant_id ||
    currentSession.user?.id !== initialSession.user?.id
  ) {
    throw new Error("登录会话或餐厅已变化，请重新发起查询。");
  }
};

export function registerAgentHandlers() {
  ipcMain.handle(IPC_CHANNELS.AGENT.ASK, async (_event, request) => {
    // 调用模型前先确认登录和会话范围，避免无权限请求先发送到云端。
    const initialSession = getCurrentSession();
    const question = request?.question;
    const conversationId = request?.conversationId;

    if (typeof question !== "string" || !question.trim()) {
      throw new Error("请输入需要查询的问题。");
    }

    const threadId = resolveAgentThreadId(initialSession, conversationId);
    loadAgentEnvironment();

    // 按需加载模型代码，未使用 Agent 时不创建模型或发起请求。
    const { runCashierAgent } = await import("@agent/run");
    const result = await runCashierAgent(question, threadId);

    // 模型调用期间如果发生退出登录或切换餐厅，不返回旧请求结果。
    assertSessionUnchanged(initialSession);

    return result;
  });

  ipcMain.handle(IPC_CHANNELS.AGENT.HISTORY, async (_event, conversationId) => {
    const initialSession = getCurrentSession();
    const threadId = resolveAgentThreadId(initialSession, conversationId);

    const { getCashierAgentHistory } = await import("@agent/run");
    const history = await getCashierAgentHistory(threadId);

    assertSessionUnchanged(initialSession);
    return history;
  });

  ipcMain.handle(IPC_CHANNELS.AGENT.CLEAR, async (_event, conversationId) => {
    const initialSession = getCurrentSession();
    const threadId = resolveAgentThreadId(initialSession, conversationId);

    const { clearCashierAgentHistory } = await import("@agent/run");
    await clearCashierAgentHistory(threadId);
    assertSessionUnchanged(initialSession);

    return { success: true };
  });
}
