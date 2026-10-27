import { dialog } from "electron";

// 选择文件夹：打开系统目录选择弹窗，取消时返回 null。
export const selectFolder = async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (!result.canceled) {
    return result.filePaths[0] ?? null;
  }

  return null;
};
