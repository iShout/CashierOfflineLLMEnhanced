import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";

export const reportApi = {
  getProductSummaryReport(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORT.GET_PRODUCT_SUMMARY_REPORT, params);
  },
  getEosReport(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORT.GET_EOS_REPORT, params);
  },
  checkEosReportGenerated(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORT.CHECK_EOS_REPORT_GENERATED, params);
  },
  autoGenerateEodReports(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORT.AUTO_GENERATE_EOD_REPORTS, params);
  },
  previewEosReport(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORT.PREVIEW_EOS_REPORT, params);
  },

  previewCashierReport(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORT.PREVIEW_CASHIER_REPORT, params);
  },
  downloadTicketData(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORT.DOWNLOAD_TICKET_DATA, params);
  },
  downloadBirReport(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORT.DOWNLOAD_BIR_REPORT, params);
  },
};
