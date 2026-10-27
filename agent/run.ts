import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { createCashierAgent } from "./agent.js";

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
export async function runCashierAgent(question: string) {
  const normalizedQuestion = question.trim();

  if (!normalizedQuestion) {
    throw new Error("请输入需要查询的问题。");
  }

  const agent = createCashierAgent();
  const result = await agent.invoke(
    {
      messages: [{ role: "user", content: normalizedQuestion }],
    },
    {
      recursionLimit: 8,
    },
  );

  const trace: AgentTraceEntry[] = [];

  for (const message of result.messages) {
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

  if (
    !lastMessage ||
    !AIMessage.isInstance(lastMessage) ||
    lastMessage.tool_calls?.length
  ) {
    throw new Error("任务尚未生成最终回答。");
  }

  return {
    answer: lastMessage.text,
    trace,
  };
}