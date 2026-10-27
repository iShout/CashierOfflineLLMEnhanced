import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";

export const staffApi = {
  getStaffClockRecordList(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.GET_STAFF_CLOCK_RECORD, params);
  },
  getStaffList() {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.GET_STAFF_LIST);
  },
  // 获取指定员工当前本地打卡状态，具体判断逻辑由主进程负责。
  getStaffClockState(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.GET_STAFF_CLOCK_STATE, params);
  },
  getClockRecordByWaiterNo(waiterNo) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.GET_CLOCK_RECORD_BY_WAITER_NO, waiterNo);
  },
  getStaffAllClockList(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.GET_STAFF_ALL_CLOCK_LIST, params);
  },
  getCashierReportByWaiter(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.GET_CASHIER_REPORT_BY_WAITER, params);
  },
  clock(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.CLOCK, params);
  },
  clockIn(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.CLOCK_IN, params);
  },
  takeBreak(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.TAKE_BREAK, params);
  },
  clockOut(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.CLOCK_OUT, params);
  },
  clockReportData(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.CLOCK_REPORT_DATA, params);
  },
  updateOpeningFund(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.UPDATE_OPENING_FUND, params);
  },
  addLessWithdrawal(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.ADD_LESS_WITHDRAWAL, params);
  },
  updateCashOnHand(params) {
    return ipcRenderer.invoke(IPC_CHANNELS.STAFF.UPDATE_CASH_ON_HAND, params);
  },
};
