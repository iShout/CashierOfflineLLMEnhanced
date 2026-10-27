import { IPC_CHANNELS } from "../../shared/ipc/channels";

const IPC_INVOKE_ERROR_PREFIX = /^Error invoking remote method ['"][^'"]+['"]:\s*(?:Error:\s*)?/;

const normalizeIpcErrorMessage = (message) => {
  return String(message ?? "")
    .replace(IPC_INVOKE_ERROR_PREFIX, "")
    .trim();
};

const normalizeIpcError = (error) => {
  const normalizedMessage = normalizeIpcErrorMessage(error?.message ?? error);

  if (!normalizedMessage || normalizedMessage === error?.message) {
    return error;
  }

  const normalizedError = new Error(normalizedMessage);
  normalizedError.name = error?.name || "Error";
  normalizedError.stack = error?.stack;
  normalizedError.cause = error;

  return normalizedError;
};

const wrapApiFunction = (apiFunction) => {
  return (...args) => {
    const result = apiFunction(...args);

    if (!result || typeof result.catch !== "function") {
      return result;
    }

    // IPC invoke 失败时清理 Electron 前缀，让 renderer 只展示真实业务原因。
    return result.catch((error) => {
      throw normalizeIpcError(error);
    });
  };
};

export const wrapApiErrors = (api) => {
  if (!api || typeof api !== "object") {
    return api;
  }

  return Object.fromEntries(
    Object.entries(api).map(([key, value]) => {
      if (typeof value === "function") {
        return [key, wrapApiFunction(value)];
      }

      if (value && typeof value === "object" && !Array.isArray(value)) {
        return [key, wrapApiErrors(value)];
      }

      return [key, value];
    }),
  );
};

export const coreApi = {
  channels: IPC_CHANNELS,
};
