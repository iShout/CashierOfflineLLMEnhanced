import dayjs from "dayjs";
import { inspect } from "util";
import { insertAppLog, pruneAppLogs, type AppLogEntry, type AppLogLevel, type AppLogSource } from "@db/DBManager/logs";

type ConsoleMethod = "log" | "info" | "warn" | "error";

type LoggerPayload = {
  level?: AppLogLevel;
  source?: AppLogSource | string;
  tag?: unknown;
  message?: unknown;
  stack?: unknown;
  context?: unknown;
};

const MAX_MESSAGE_LENGTH = 4000;
const MAX_TAG_LENGTH = 500;
const MAX_STACK_LENGTH = 8000;
const MAX_CONTEXT_LENGTH = 10000;

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let isInstalled = false;
let isWritingLog = false;

const truncate = (value: string | null | undefined, maxLength: number): string | null => {
  if (!value) return null;

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...[truncated]`;
};

const stringifyValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.message || value.name;
  }

  return inspect(value, {
    depth: 4,
    breakLength: 160,
    maxArrayLength: 80,
  });
};

const buildConsoleMessage = (args: unknown[]): string => {
  return args.map((arg) => stringifyValue(arg)).join(" ");
};

const buildTagFromStringArgs = (args: unknown[]): string | null => {
  const tag = args
    .filter((arg) => typeof arg === "string")
    .map((arg) => (arg as string).trim())
    .filter(Boolean)
    .join(" ");

  return tag || null;
};

const findStack = (args: unknown[]): string | null => {
  const errorArg = args.find((arg) => arg instanceof Error) as Error | undefined;

  return errorArg?.stack ?? null;
};

const normalizeLevel = (level?: string): AppLogLevel => {
  if (level === "info" || level === "warn" || level === "error") {
    return level;
  }

  return "log";
};

const writeLog = (entry: AppLogEntry): void => {
  if (isWritingLog) {
    return;
  }

  isWritingLog = true;

  try {
    insertAppLog(entry);
  } catch (error) {
    originalConsole.error("[appLogger] Failed to write log:", error);
  } finally {
    isWritingLog = false;
  }
};

export const recordAppLog = (payload: LoggerPayload): void => {
  const now = Date.now();
  const message = stringifyValue(payload.message ?? "");
  const tag = payload.tag === undefined ? null : stringifyValue(payload.tag);
  const stack = payload.stack ? stringifyValue(payload.stack) : null;
  const context = payload.context === undefined ? null : stringifyValue(payload.context);

  writeLog({
    created_at: dayjs(now).format("YYYY-MM-DD HH:mm:ss"),
    created_at_ms: now,
    level: normalizeLevel(payload.level),
    source: payload.source ?? "main",
    tag: truncate(tag, MAX_TAG_LENGTH),
    message: truncate(message, MAX_MESSAGE_LENGTH) || "",
    stack: truncate(stack, MAX_STACK_LENGTH),
    context: truncate(context, MAX_CONTEXT_LENGTH),
  });
};

const createConsoleWrapper = (method: ConsoleMethod) => {
  return (...args: unknown[]) => {
    recordAppLog({
      level: normalizeLevel(method),
      source: "main",
      tag: buildTagFromStringArgs(args),
      message: buildConsoleMessage(args),
      stack: findStack(args),
    });

    originalConsole[method](...args);
  };
};

const registerProcessErrorHandlers = (): void => {
  process.on("uncaughtException", (error) => {
    recordAppLog({
      level: "error",
      source: "process",
      tag: "System",
      message: error.message,
      stack: error.stack,
    });

    originalConsole.error("[uncaughtException]", error);
  });

  process.on("unhandledRejection", (reason) => {
    recordAppLog({
      level: "error",
      source: "process",
      tag: "System",
      message: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : null,
    });

    originalConsole.error("[unhandledRejection]", reason);
  });
};

export const initAppLogger = (): void => {
  if (isInstalled) {
    return;
  }

  isInstalled = true;
  console.log = createConsoleWrapper("log");
  console.info = createConsoleWrapper("info");
  console.warn = createConsoleWrapper("warn");
  console.error = createConsoleWrapper("error");
  registerProcessErrorHandlers();

  // 启动时清理旧日志，防止诊断表长期无限增长。
  try {
    pruneAppLogs();
  } catch (error) {
    originalConsole.error("[appLogger] Failed to prune logs:", error);
  }
};

export const recordRendererLog = (payload: LoggerPayload): void => {
  recordAppLog({
    ...payload,
    level: normalizeLevel(payload.level),
    source: payload.source ?? "renderer",
  });
};
