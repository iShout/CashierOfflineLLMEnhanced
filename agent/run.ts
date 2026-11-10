import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { createCashierAgent } from "./agent.js";
import { cashierAgentCheckpointer } from "./memory.js";

type AgentTraceEntry =
  | {
      type: "tool_call";
      id?: string;
      name: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      toolCallId: string;
      content: ToolMessage["content"];
    };

// 主进程共用执行入口只接收用户问题，并返回可通过 IPC 传输的普通数据。
export async function runCashierAgent(question: string, threadId: string) {
  const normalizedQuestion = question.trim();
  const normalizedThreadId = threadId.trim();

  if (!normalizedQuestion) {
    throw new Error("请输入需要查询的问题。");
  }

  if (!normalizedThreadId) {
    throw new Error("当前对话缺少会话标识。");
  }

  const agent = createCashierAgent();
  const config = {
    configurable: {
      thread_id: normalizedThreadId,
    },
    recursionLimit: 8,
  };

  const previousState = await agent.getState(config);
  const previousMessages = Array.isArray(previousState.values?.messages) ? previousState.values.messages : [];

  const result = await agent.invoke(
    {
      messages: [{ role: "user", content: normalizedQuestion }],
    },
    config,
  );
  const currentTurnMessages = result.messages.slice(previousMessages.length);

  const trace: AgentTraceEntry[] = [];

  // 多轮对话返回完整消息状态，trace 只统计本轮新增的工具调用。
  for (const message of currentTurnMessages) {
    if (AIMessage.isInstance(message)) {
      for (const call of message.tool_calls ?? []) {
        trace.push({
          type: "tool_call",
          id: call.id,
          name: call.name,
          args: call.args,
        });
      }
    } else if (ToolMessage.isInstance(message)) {
      trace.push({
        type: "tool_result",
        toolCallId: message.tool_call_id,
        content: message.content,
      });
    }
  }

  // 工具调用消息不是最终回答，最后一条必须是没有待执行工具的模型回答。
  const lastMessage = result.messages.at(-1);

  if (!lastMessage || !AIMessage.isInstance(lastMessage) || lastMessage.tool_calls?.length) {
    throw new Error("任务尚未生成最终回答。");
  }

  return {
    answer: lastMessage.text,
    trace,
  };
}

export async function getCashierAgentHistory(threadId: string) {
  // 历史读取直接访问本地 Checkpointer，不依赖模型配置或网络请求。
  const checkpoint = await cashierAgentCheckpointer.getTuple({
    configurable: { thread_id: threadId },
  });
  const rawMessages: unknown = checkpoint?.checkpoint.channel_values.messages;

  const messages: BaseMessage[] = Array.isArray(rawMessages)
    ? rawMessages.filter((message: unknown): message is BaseMessage => BaseMessage.isInstance(message))
    : [];

  // 页面历史只暴露用户消息和最终回答，不显示工具原始结果。
  return messages.flatMap((message) => {
    if (HumanMessage.isInstance(message)) {
      return [{ role: "user", content: message.text }];
    }

    if (AIMessage.isInstance(message) && !message.tool_calls?.length && message.text) {
      return [{ role: "assistant", content: message.text }];
    }

    return [];
  });
}

export async function clearCashierAgentHistory(threadId: string) {
  await cashierAgentCheckpointer.deleteThread(threadId);
}
