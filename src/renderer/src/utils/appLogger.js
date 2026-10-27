const MAX_RENDERER_CONTEXT_LENGTH = 10000;
const MAX_RENDERER_TAG_LENGTH = 500;

const isPlainObject = (value) => {
  return Object.prototype.toString.call(value) === "[object Object]";
};

const stringifyValue = (value) => {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.message || value.name;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const truncate = (value, maxLength) => {
  if (typeof value !== "string" || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...[truncated]`;
};

const normalizeArgs = (args) => {
  const error = args.find((arg) => arg instanceof Error);
  const nonErrorArgs = args.filter((arg) => !(arg instanceof Error));
  const [firstArg, ...restArgs] = nonErrorArgs;
  const message = firstArg !== undefined ? stringifyValue(firstArg) : stringifyValue(error ?? "");
  const tag = truncate(
    nonErrorArgs
      .filter((arg) => typeof arg === "string")
      .map((arg) => arg.trim())
      .filter(Boolean)
      .join(" "),
    MAX_RENDERER_TAG_LENGTH,
  );
  const contextArgs = restArgs.filter((arg) => typeof arg !== "string");

  let context = null;
  if (contextArgs.length === 1 && isPlainObject(contextArgs[0])) {
    context = contextArgs[0];
  } else if (contextArgs.length > 0) {
    context = { args: contextArgs.map((arg) => stringifyValue(arg)) };
  }

  return {
    message,
    tag: tag || null,
    stack: error?.stack ?? null,
    context,
  };
};

const createLogMethod = (level) => {
  return (...args) => {
    const consoleMethod = console[level] || console.log;
    consoleMethod(...args);

    if (!window.api?.app?.logMessage) {
      return;
    }

    const { message, tag, stack, context } = normalizeArgs(args);

    window.api.app.logMessage(message, {
      level,
      source: "renderer",
      tag,
      stack,
      context: context
        ? {
            ...context,
            _source: "appLogger",
          }
        : {
            _source: "appLogger",
          },
    });
  };
};

export const createRendererAppLogger = () => {
  return {
    log: createLogMethod("log"),
    info: createLogMethod("info"),
    warn: createLogMethod("warn"),
    error: createLogMethod("error"),
    record(message, options = {}) {
      console[options.level || "log"]?.(message, options.context ?? "");

      window.api.app.logMessage(message, {
        level: options.level ?? "log",
        source: options.source ?? "renderer",
        tag: truncate(options.tag ?? null, MAX_RENDERER_TAG_LENGTH),
        stack: options.stack ?? null,
        context:
          options.context === undefined
            ? { _source: "appLogger.record" }
            : truncate(stringifyValue(options.context), MAX_RENDERER_CONTEXT_LENGTH),
      });
    },
  };
};

export const installRendererAppLogger = () => {
  const logger = createRendererAppLogger();

  window.appLogger = logger;
  globalThis.appLogger = logger;

  return logger;
};
