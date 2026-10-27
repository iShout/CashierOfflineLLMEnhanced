import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const alias = {
  "@shared": resolve("src/shared"),
  "@main": resolve("src/main"),
  "@db": resolve("src/main/db"),
  "@preload": resolve("src/preload"),
  "@renderer": resolve("src/renderer/src"),
  "@pages": resolve("src/renderer/src/pages"),
  "@assets": resolve("src/renderer/src/assets"),
  "@app-types": resolve("src/types"),
};

export default defineConfig({
  main: {
    resolve: {
      alias: {
        ...alias,
        // Agent 只接入主进程，模型与工具代码不进入收银页面。
        "@agent": resolve("agent"),
      },
    },
  },
  preload: {
    resolve: {
      alias,
    },
  },
  renderer: {
    resolve: {
      alias,
    },
    plugins: [react(), tailwindcss()],
  },
});
