import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc/channels";
import { queryWaiterSettlementReport } from "@db/DBManager/reports-nonsync";
import { convertKeysToSnakeCase } from "@db/utils";
import {
  clock,
  clockIn,
  clockReportData,
  clockOut,
  getClockRecordByWaiterID,
  getClockRecordByWaiterNo,
  getStaffClockState,
  getStaffClockRecordList,
  addLessWithdrawal,
  takeBreak,
  updateCashOnHand,
  updateOpeningFund,
} from "@db/DBManager/shift-nonsync";
import { getStaffList } from "@db/DBManager/utils";

export function registerStaffHandlers() {
  ipcMain.handle(IPC_CHANNELS.STAFF.GET_STAFF_CLOCK_RECORD, (_event, params) => {
    return getStaffClockRecordList(params);
  });

  ipcMain.handle(IPC_CHANNELS.STAFF.CLOCK_IN, (_event, params) => {
    return clockIn(params);
  });

  // 对齐在线端 /restaurant/cashier/clock：由主进程统一判断上班卡或下班卡。
  ipcMain.handle(IPC_CHANNELS.STAFF.CLOCK, (_event, params) => {
    return clock(params);
  });

  ipcMain.handle(IPC_CHANNELS.STAFF.TAKE_BREAK, (_event, params) => {
    return takeBreak(params);
  });

  ipcMain.handle(IPC_CHANNELS.STAFF.CLOCK_OUT, (_event, params) => {
    return clockOut(params);
  });

  // 对齐在线端签退接口：先下班打卡，再生成并保存本班次收银员报告快照。
  ipcMain.handle(IPC_CHANNELS.STAFF.CLOCK_REPORT_DATA, async (_event, params) => {
    const report = await clockReportData(params);

    return convertKeysToSnakeCase(report);
  });

  ipcMain.handle(IPC_CHANNELS.STAFF.UPDATE_OPENING_FUND, (_event, params) => {
    return updateOpeningFund(params);
  });

  ipcMain.handle(IPC_CHANNELS.STAFF.ADD_LESS_WITHDRAWAL, (_event, params) => {
    return addLessWithdrawal(params);
  });

  ipcMain.handle(IPC_CHANNELS.STAFF.UPDATE_CASH_ON_HAND, (_event, params) => {
    return updateCashOnHand(params);
  });

  // 查询指定员工当前本地打卡状态，供渲染进程复用统一判断结果。
  ipcMain.handle(IPC_CHANNELS.STAFF.GET_STAFF_CLOCK_STATE, (_event, params) => {
    return getStaffClockState(params);
  });

  ipcMain.handle(IPC_CHANNELS.STAFF.GET_STAFF_LIST, () => {
    return getStaffList();
  });

  ipcMain.handle(IPC_CHANNELS.STAFF.GET_CLOCK_RECORD_BY_WAITER_NO, (_event, waiterNo) => {
    return getClockRecordByWaiterNo(waiterNo);
  });

  ipcMain.handle(IPC_CHANNELS.STAFF.GET_STAFF_ALL_CLOCK_LIST, (_event, params) => {
    return getClockRecordByWaiterID(params);
  });

  ipcMain.handle(IPC_CHANNELS.STAFF.GET_CASHIER_REPORT_BY_WAITER, async (_event, params) => {
    const report = await queryWaiterSettlementReport({
      ...params,
      startTime: new Date(params.startTime),
      endTime: new Date(params.endTime),
    });

    return convertKeysToSnakeCase(report);
  });
}
