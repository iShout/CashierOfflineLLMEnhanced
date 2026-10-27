import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../../shared/ipc/channels";

// 页面只提交问题并接收结果，模型调用和工具执行留在主进程。
export const agentApi = {
  ask: (question) => ipcRenderer.invoke(IPC_CHANNELS.AGENT.ASK, question),
};
