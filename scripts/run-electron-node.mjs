import electronPath from "electron";
import { spawnSync } from "node:child_process";
import path from "node:path";

const [, , scriptPath, ...scriptArguments] = process.argv;

if (!scriptPath) {
  throw new Error("A script path is required.");
}

// 原生 SQLite 模块按 Electron ABI 构建，维护脚本需复用同一运行时。
const result = spawnSync(electronPath, [path.resolve(scriptPath), ...scriptArguments], {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
  },
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
