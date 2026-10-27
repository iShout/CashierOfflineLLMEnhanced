import { app, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS } from "@shared/ipc/channels";
import {
  autoGenerateMissingEndOfDayReports,
  checkEndOfDayReportGenerated,
  downloadBirReport,
  downloadTicketData,
  generateCycleReport,
  previewCashierReport,
  previewEndOfDayReport,
  querySummaryReport,
} from "@db/DBManager/reports-nonsync";
import { convertKeysToSnakeCase } from "@db/utils";

const CASHIER_ALL = "all";

const safeUnlink = async (filePath) => {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch {
    // 清理生成中的临时文件失败不影响主流程，保留原始错误/取消状态。
  }
};

const showReportSaveDialog = async ({ defaultPath, filters }) => {
  const result = await dialog.showSaveDialog({
    title: "Save Report",
    defaultPath,
    filters,
  });

  return result.canceled ? "" : result.filePath;
};

export function registerReportHandlers() {
  ipcMain.handle(IPC_CHANNELS.REPORT.GET_PRODUCT_SUMMARY_REPORT, async (_event, params) => {
    const report = await querySummaryReport({
      restaurantId: params.restaurantId,
      startTime: new Date(params.startTime),
      endTime: new Date(params.endTime),
      categoryNo: params.categoryNo,
      waiterNo: params.waiterNo === CASHIER_ALL ? undefined : params.waiterNo,
    });

    return convertKeysToSnakeCase(report);
  });

  ipcMain.handle(IPC_CHANNELS.REPORT.GET_EOS_REPORT, async (_event, params) => {
    if (params.persistReportPrint) {
      // 手动 End Your Day 前先补齐历史自动 EOD，避免本次手动周期被旧数据拉成跨天。
      await autoGenerateMissingEndOfDayReports();
    }

    const report = await generateCycleReport({
      startTime: new Date(params.startTime),
      endTime: new Date(params.endTime),
      current: Boolean(params.current),
      persistReportPrint: Boolean(params.persistReportPrint),
    });

    return convertKeysToSnakeCase(report);
  });

  ipcMain.handle(IPC_CHANNELS.REPORT.CHECK_EOS_REPORT_GENERATED, async (_event, params) => {
    return checkEndOfDayReportGenerated({
      startTime: new Date(params.startTime),
      endTime: new Date(params.endTime),
    });
  });

  ipcMain.handle(IPC_CHANNELS.REPORT.AUTO_GENERATE_EOD_REPORTS, async (_event, params = {}) => {
    const result = await autoGenerateMissingEndOfDayReports({
      maxDays: params.maxDays,
    });

    return convertKeysToSnakeCase(result);
  });

  ipcMain.handle(IPC_CHANNELS.REPORT.PREVIEW_EOS_REPORT, async (_event, params) => {
    return previewEndOfDayReport({
      startTime: new Date(params.startTime),
      endTime: new Date(params.endTime),
      current: Boolean(params.current),
    });
  });

  ipcMain.handle(IPC_CHANNELS.REPORT.PREVIEW_CASHIER_REPORT, async (_event, params) => {
    return previewCashierReport({
      restaurantId: params.restaurantId,
      startTime: new Date(params.startTime),
      endTime: new Date(params.endTime),
      waiterNo: params.waiterNo === CASHIER_ALL ? undefined : params.waiterNo,
      type: params.type,
    });
  });

  ipcMain.handle(IPC_CHANNELS.REPORT.DOWNLOAD_TICKET_DATA, async (_event, params) => {
    const result = await downloadTicketData({
      beginTime: new Date(params.beginTime),
      endTime: new Date(params.endTime),
    });

    if (!Array.isArray(result.data) || !result.data.length) {
      return convertKeysToSnakeCase(result);
    }

    // E-Journal 文件保存交给主进程，确保使用系统保存弹窗选择最终 txt 路径。
    const filePath = await showReportSaveDialog({
      defaultPath: result.txtName || "E-Journal.txt",
      filters: [{ name: "Text File", extensions: ["txt"] }],
    });

    if (!filePath) {
      return convertKeysToSnakeCase({ ...result, data: [], canceled: true });
    }

    await fs.writeFile(filePath, Buffer.from(result.data.join(""), "hex"));

    return convertKeysToSnakeCase({
      ...result,
      data: [],
      fileName: path.basename(filePath),
      filePath,
      canceled: false,
    });
  });

  ipcMain.handle(IPC_CHANNELS.REPORT.DOWNLOAD_BIR_REPORT, async (_event, params) => {
    const result = await downloadBirReport({
      beginTime: new Date(params.beginTime),
      endTime: new Date(params.endTime),
    });

    const generatedFilePath = result.filePath;

    // BIR 仍复用现有 xlsx 生成逻辑，生成成功后再让用户选择最终保存位置。
    const filePath = await showReportSaveDialog({
      defaultPath: path.join(app.getPath("downloads"), result.fileName || "BIR Report.xlsx"),
      filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    });

    if (!filePath) {
      await safeUnlink(generatedFilePath);
      return { canceled: true };
    }

    if (generatedFilePath && path.resolve(filePath) !== path.resolve(generatedFilePath)) {
      await fs.copyFile(generatedFilePath, filePath);
      await safeUnlink(generatedFilePath);
    }

    return convertKeysToSnakeCase({
      ...result,
      fileName: path.basename(filePath),
      filePath,
      canceled: false,
    });
  });
}
