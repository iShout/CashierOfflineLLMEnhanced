import { BrowserWindow, powerMonitor } from "electron";
import dayjs from "dayjs";
import { getCurrentSession } from "@main/authManager";
import { getDB } from "@db/index";
import {
  scheduledQueueOrderCancel,
  scheduledQueueOrderPickup,
  scheduledQueueOrderPrepare,
  scheduledTableOrderComplete,
} from "@db/DBManager/order-nonsync";
import { getRestaurantWaitSettingByRestaurantId } from "@db/DBManager/restaurant-settings-nonsync";
import {
  SCHEDULED_ORDER_TASK_STATUS,
  SCHEDULED_ORDER_TASK_TYPE,
  cancelObsoleteScheduledOrderTasks,
  cancelScheduledOrderTask,
  claimScheduledOrderTask,
  deleteExpiredTerminalScheduledOrderTasks,
  ensureScheduledOrderTask,
  finishScheduledOrderTask,
  getNearestScheduledOrderTask,
  listDueScheduledOrderTasks,
  recoverScheduledOrderTasks,
  retryScheduledOrderTask,
  type ScheduledOrderTaskRecord,
  type ScheduledOrderTaskType,
} from "@db/DBManager/scheduled-order-task";

import { ORDER_CHANGE_STATUS, ORDER_STATUS, ORDER_TYPE, PAYMENT_STATUS } from "@db/constants/order";
import { ORDER_CHANNEL } from "@shared/constants/enums";
import { IPC_CHANNELS } from "@shared/ipc/channels";

import { notifyUncompleteOrderCountChanged } from "@main/services/uncompleteOrderNotifier";

const QUEUE_UNPAID_CANCEL_DELAY_MS = 15 * 60 * 1000;
const TABLE_ORDER_AUTO_COMPLETE_DELAY_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_WAKE_DELAY_MS = 60 * 1000;
const TASK_LEASE_MS = 5 * 60 * 1000;
const MAX_DUE_BATCH_SIZE = 50;
const TERMINAL_TASK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL_TASK_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TERMINAL_TASK_CLEANUP_BATCH_SIZE = 1000;

const DELAY_LEVEL_MS = new Map<number, number>([
  [1, 1000],
  [5, 60 * 1000],
  [6, 2 * 60 * 1000],
  [7, 3 * 60 * 1000],
  [8, 4 * 60 * 1000],
  [9, 5 * 60 * 1000],
  [10, 6 * 60 * 1000],
  [11, 7 * 60 * 1000],
  [12, 8 * 60 * 1000],
  [13, 9 * 60 * 1000],
  [14, 10 * 60 * 1000],
  [15, 20 * 60 * 1000],
  [16, 30 * 60 * 1000],
]);

const resolveDelayLevelMs = (delayLevel: number | null | undefined): number | null =>
  DELAY_LEVEL_MS.get(Number(delayLevel)) ?? null;

const isImmediateDelayLevel = (delayLevel: number | null | undefined): boolean =>
  delayLevel === null || delayLevel === undefined || Number(delayLevel) === 0;

type SchedulableMasterOrder = {
  restaurant_id: number;
  order_inner_no: string;
  order_channel: number;
  order_status: number;
  payment_status: number | null;
  create_time: string | null;
  update_time: string | null;
  paid_at: string | null;
  taken_at: string | null;
  ready_at: string | null;
};

type ScheduledActionResult = {
  applied: boolean;
  reason: string;
  order_inner_no: string;
};

type OrderAutomationContext = {
  taskKey: string | null;
  taskType: ScheduledOrderTaskType;
  restaurantId: number;
  orderInnerNo: string;
  executionMode: "IMMEDIATE" | "SCHEDULED";
};

let timer: NodeJS.Timeout | null = null;
let cleanupTimer: NodeJS.Timeout | null = null;
let scheduleVersion = 0;
let activeRestaurantId: number | null = null;
let isDraining = false;
let refreshRequested = false;
let powerMonitorRegistered = false;
let isCleaningTerminalTasks = false;

const clearTimer = (): void => {
  scheduleVersion += 1;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};

const clearCleanupTimer = (): void => {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
};

const buildLocalSqliteTime = (timeMs: number): string => dayjs(timeMs).format("YYYY-MM-DD HH:mm:ss");

// 清理属于可补偿的数据库维护，不写入订单任务表；关闭期间错过的清理由下次启动补做。
const runTerminalTaskCleanup = async (): Promise<void> => {
  if (isCleaningTerminalTasks || activeRestaurantId === null) return;

  isCleaningTerminalTasks = true;
  clearCleanupTimer();
  try {
    const finishedBefore = buildLocalSqliteTime(Date.now() - TERMINAL_TASK_RETENTION_MS);
    let deletedCount: number;
    do {
      deletedCount = deleteExpiredTerminalScheduledOrderTasks({
        finishedBefore,
        limit: TERMINAL_TASK_CLEANUP_BATCH_SIZE,
      });
      if (deletedCount === TERMINAL_TASK_CLEANUP_BATCH_SIZE) {
        // 大批历史数据分段删除，避免长时间占用主进程事件循环。
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    } while (deletedCount === TERMINAL_TASK_CLEANUP_BATCH_SIZE && activeRestaurantId !== null);
  } catch (error) {
    console.error("Scheduled order task cleanup failed:", error);
  } finally {
    isCleaningTerminalTasks = false;
    if (activeRestaurantId !== null) {
      cleanupTimer = setTimeout(() => {
        cleanupTimer = null;
        void runTerminalTaskCleanup();
      }, TERMINAL_TASK_CLEANUP_INTERVAL_MS);
    }
  }
};

const parseTimeMs = (value: string | null | undefined, fallbackMs: number): number => {
  if (!value) return fallbackMs;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.valueOf() : fallbackMs;
};

const cancelOrderTask = (order: SchedulableMasterOrder, taskType: ScheduledOrderTaskType): void => {
  cancelScheduledOrderTask({
    restaurantId: order.restaurant_id,
    orderInnerNo: order.order_inner_no,
    taskType,
  });
};

const ensureOrderTask = (
  order: SchedulableMasterOrder,
  taskType: ScheduledOrderTaskType,
  executeAtMs: number,
  payload?: Record<string, unknown>,
): void => {
  ensureScheduledOrderTask({
    restaurantId: order.restaurant_id,
    orderInnerNo: order.order_inner_no,
    taskType,
    executeAtMs,
    payload,
  });
};

const getSchedulableMasterOrders = (restaurantId: number): SchedulableMasterOrder[] =>
  getDB()
    .prepare(
      `
        SELECT
          fo.restaurant_id,
          fo.order_inner_no,
          fo.order_channel,
          fo.order_status,
          fo.payment_status,
          fo.create_time,
          fo.update_time,
          (
            SELECT op.transaction_return_time
            FROM order_payment op
            WHERE op.order_inner_no = fo.order_inner_no
              AND op.transaction_status = @paid_status
            ORDER BY op.id DESC
            LIMIT 1
          ) AS paid_at,
          (
            SELECT osc.create_time
            FROM order_status_change osc
            WHERE osc.order_inner_no = fo.order_inner_no
              AND osc.status = @taken_change_status
            ORDER BY osc.id DESC
            LIMIT 1
          ) AS taken_at,
          (
            SELECT osc.create_time
            FROM order_status_change osc
            WHERE osc.order_inner_no = fo.order_inner_no
              AND osc.status = @ready_change_status
            ORDER BY osc.id DESC
            LIMIT 1
          ) AS ready_at
        FROM food_order fo
        WHERE fo.restaurant_id = @restaurant_id
          AND fo.order_type = @master_order_type
          AND fo.order_status NOT IN (@completed_status, @cancel_status)
      `,
    )
    .all({
      restaurant_id: restaurantId,
      master_order_type: ORDER_TYPE.MASTER,
      completed_status: ORDER_STATUS.COMPLETED,
      cancel_status: ORDER_STATUS.CANCEL,
      paid_status: PAYMENT_STATUS.PAY_SUCCESS,
      taken_change_status: ORDER_CHANGE_STATUS.ORDERS,
      ready_change_status: ORDER_CHANGE_STATUS.MEALS_TO_BE_SERVED,
    }) as SchedulableMasterOrder[];

// 根据当前订单状态重建应存在的任务，补偿应用在状态提交后、任务落库前退出的窗口。
const reconcileScheduledOrderTasks = (restaurantId: number): void => {
  const nowMs = Date.now();
  cancelObsoleteScheduledOrderTasks(restaurantId);
  const waitSetting = getRestaurantWaitSettingByRestaurantId(restaurantId);
  const orders = getSchedulableMasterOrders(restaurantId);

  orders.forEach((order) => {
    const isQueueOrder = order.order_channel === ORDER_CHANNEL.QUEUE;
    const isPaid = [PAYMENT_STATUS.PAY_SUCCESS, PAYMENT_STATUS.REFUND_FAILED].includes(Number(order.payment_status));
    const isUnpaid = [PAYMENT_STATUS.UNPAY, PAYMENT_STATUS.FAILED].includes(Number(order.payment_status));

    if (isQueueOrder && isUnpaid && order.order_status === ORDER_STATUS.PROCESSING) {
      const createdAtMs = parseTimeMs(order.create_time, nowMs);
      ensureOrderTask(
        order,
        SCHEDULED_ORDER_TASK_TYPE.QUEUE_UNPAID_CANCEL,
        createdAtMs + QUEUE_UNPAID_CANCEL_DELAY_MS,
        { delay_ms: QUEUE_UNPAID_CANCEL_DELAY_MS, source: "SYSTEM_AUTO" },
      );
    } else {
      cancelOrderTask(order, SCHEDULED_ORDER_TASK_TYPE.QUEUE_UNPAID_CANCEL);
    }

    // Taken 后按 dining_out 配置立即备餐，或按有效时间枚举创建任务。
    const prepareDelayMs = resolveDelayLevelMs(waitSetting?.dining_out_time);
    const shouldPrepare =
      isQueueOrder && isPaid && order.order_status === ORDER_STATUS.RECEIVED && waitSetting?.dining_out === 1;
    if (shouldPrepare && isImmediateDelayLevel(waitSetting?.dining_out_time)) {
      cancelOrderTask(order, SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PREPARE);
      executeImmediateQueueAutomation(order, SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PREPARE);
    } else if (shouldPrepare && prepareDelayMs !== null) {
      const takenAtMs = parseTimeMs(order.taken_at ?? order.update_time, nowMs);
      ensureOrderTask(order, SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PREPARE, takenAtMs + prepareDelayMs, {
        delay_level: waitSetting.dining_out_time,
        delay_ms: prepareDelayMs,
        source: "SYSTEM_AUTO",
      });
    } else {
      cancelOrderTask(order, SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PREPARE);
    }

    // Ready for Take-out 后按 completion 配置立即取餐，或按有效时间枚举创建任务。
    const pickupDelayMs = resolveDelayLevelMs(waitSetting?.completion_time);
    const shouldPickup =
      isQueueOrder && isPaid && order.order_status === ORDER_STATUS.AWAITING_PICKUP && waitSetting?.completion === 1;
    if (shouldPickup && isImmediateDelayLevel(waitSetting?.completion_time)) {
      cancelOrderTask(order, SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PICKUP);
      executeImmediateQueueAutomation(order, SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PICKUP);
    } else if (shouldPickup && pickupDelayMs !== null) {
      const readyAtMs = parseTimeMs(order.ready_at ?? order.update_time, nowMs);
      ensureOrderTask(order, SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PICKUP, readyAtMs + pickupDelayMs, {
        delay_level: waitSetting.completion_time,
        delay_ms: pickupDelayMs,
        source: "SYSTEM_AUTO",
      });
    } else {
      cancelOrderTask(order, SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PICKUP);
    }

    const isTableOrder = order.order_channel === ORDER_CHANNEL.TABLE;
    if (isTableOrder && isPaid) {
      const paidAtMs = parseTimeMs(order.paid_at ?? order.update_time, nowMs);
      ensureOrderTask(
        order,
        SCHEDULED_ORDER_TASK_TYPE.TABLE_ORDER_AUTO_COMPLETE,
        paidAtMs + TABLE_ORDER_AUTO_COMPLETE_DELAY_MS,
        { delay_ms: TABLE_ORDER_AUTO_COMPLETE_DELAY_MS, source: "SYSTEM_AUTO" },
      );
    } else {
      cancelOrderTask(order, SCHEDULED_ORDER_TASK_TYPE.TABLE_ORDER_AUTO_COMPLETE);
    }
  });
};

const executeScheduledOrderTask = (task: ScheduledOrderTaskRecord): ScheduledActionResult => {
  switch (task.task_type) {
    case SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PREPARE:
      return scheduledQueueOrderPrepare({ order_inner_no: task.order_inner_no });
    case SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PICKUP:
      return scheduledQueueOrderPickup({ order_inner_no: task.order_inner_no });
    case SCHEDULED_ORDER_TASK_TYPE.QUEUE_UNPAID_CANCEL:
      return scheduledQueueOrderCancel({ order_inner_no: task.order_inner_no });
    case SCHEDULED_ORDER_TASK_TYPE.TABLE_ORDER_AUTO_COMPLETE:
      return scheduledTableOrderComplete({ order_inner_no: task.order_inner_no });
    // 旧任务也只能执行当前安全语义：Taken -> Ready，或桌码订单三天完成。
    case SCHEDULED_ORDER_TASK_TYPE.LEGACY_QUEUE_AUTO_SERVE:
      return scheduledQueueOrderPrepare({ order_inner_no: task.order_inner_no });
    case SCHEDULED_ORDER_TASK_TYPE.LEGACY_PAID_ORDER_AUTO_COMPLETE:
      return scheduledTableOrderComplete({ order_inner_no: task.order_inner_no });
    default:
      throw new Error(`Unsupported scheduled order task type: ${task.task_type}`);
  }
};

const notifyOrderAutomationExecuted = (context: OrderAutomationContext, result: ScheduledActionResult): void => {
  notifyUncompleteOrderCountChanged();
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.ORDERS.SCHEDULED_TASK_EXECUTED, {
        task_key: context.taskKey,
        task_type: context.taskType,
        order_inner_no: context.orderInnerNo,
        execution_mode: context.executionMode,
        applied: result.applied,
        reason: result.reason,
      });
    }
  });
};

// 0 或 NULL 表示不落定时任务，直接在主进程执行对应的幂等状态流转。
function executeImmediateQueueAutomation(
  order: SchedulableMasterOrder,
  taskType: typeof SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PREPARE | typeof SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PICKUP,
): void {
  const context: OrderAutomationContext = {
    taskKey: null,
    taskType,
    restaurantId: order.restaurant_id,
    orderInnerNo: order.order_inner_no,
    executionMode: "IMMEDIATE",
  };

  try {
    const result =
      taskType === SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PREPARE
        ? scheduledQueueOrderPrepare({ order_inner_no: order.order_inner_no })
        : scheduledQueueOrderPickup({ order_inner_no: order.order_inner_no });

    notifyOrderAutomationExecuted(context, result);
  } catch (error) {
    console.error("Immediate queue order automation failed:", {
      taskType,
      orderInnerNo: order.order_inner_no,
      error,
    });
  }
}

const getRetryDelayMs = (retryCount: number): number =>
  Math.min(5 * 60 * 1000, 30 * 1000 * 2 ** Math.min(Math.max(retryCount, 0), 4));

const drainDueTasks = async (restaurantId: number): Promise<void> => {
  while (activeRestaurantId === restaurantId) {
    const nowMs = Date.now();
    const dueTasks = listDueScheduledOrderTasks(restaurantId, nowMs, MAX_DUE_BATCH_SIZE);
    if (dueTasks.length === 0) return;

    for (const candidate of dueTasks) {
      if (activeRestaurantId !== restaurantId) return;

      const task = claimScheduledOrderTask(candidate.id, Date.now(), Date.now() + TASK_LEASE_MS);
      if (!task) continue;

      try {
        const result = executeScheduledOrderTask(task);
        const context: OrderAutomationContext = {
          taskKey: task.task_key,
          taskType: task.task_type,
          restaurantId: task.restaurant_id,
          orderInnerNo: task.order_inner_no,
          executionMode: "SCHEDULED",
        };

        finishScheduledOrderTask(
          task.id,
          result.applied ? SCHEDULED_ORDER_TASK_STATUS.SUCCEEDED : SCHEDULED_ORDER_TASK_STATUS.SKIPPED,
        );
        notifyOrderAutomationExecuted(context, result);
      } catch (error) {
        retryScheduledOrderTask(task.id, error, Date.now() + getRetryDelayMs(task.retry_count));
        console.error("Scheduled order task execution failed:", {
          taskKey: task.task_key,
          taskType: task.task_type,
          orderInnerNo: task.order_inner_no,
          error,
        });
      }
    }
  }
};

const scheduleNextWake = (restaurantId: number): void => {
  const nextTask = getNearestScheduledOrderTask(restaurantId);
  if (!nextTask) return;

  const version = scheduleVersion;
  const delayMs = Math.max(0, Math.min(nextTask.execute_at_ms - Date.now(), MAX_WAKE_DELAY_MS));
  timer = setTimeout(() => {
    if (version !== scheduleVersion || activeRestaurantId !== restaurantId) return;
    void refreshScheduledOrderTaskSchedule();
  }, delayMs);
};

export const refreshScheduledOrderTaskSchedule = async ({
  reconcile = true,
}: { reconcile?: boolean } = {}): Promise<void> => {
  let restaurantId: number;
  try {
    restaurantId = getCurrentSession().user?.restaurant_id ?? 0;
  } catch {
    stopScheduledOrderTaskManager();
    return;
  }

  if (!restaurantId || activeRestaurantId !== restaurantId) return;

  clearTimer();
  if (isDraining) {
    refreshRequested = true;
    return;
  }

  isDraining = true;
  try {
    do {
      refreshRequested = false;
      if (reconcile) reconcileScheduledOrderTasks(restaurantId);
      await drainDueTasks(restaurantId);
    } while (refreshRequested && activeRestaurantId === restaurantId);
  } finally {
    isDraining = false;
  }

  if (activeRestaurantId === restaurantId) {
    reconcileScheduledOrderTasks(restaurantId);
    scheduleNextWake(restaurantId);
  }
};

export const startScheduledOrderTaskManager = (): void => {
  const restaurantId = getCurrentSession().user?.restaurant_id;
  if (!restaurantId) return;

  const isStartingForRestaurant = activeRestaurantId !== restaurantId;
  if (isStartingForRestaurant) {
    clearTimer();
    activeRestaurantId = restaurantId;
    // 新进程中不存在旧执行器，上一进程遗留的 RUNNING 任务可立即重新领取。
    recoverScheduledOrderTasks(restaurantId);
    void runTerminalTaskCleanup();
  }

  if (!powerMonitorRegistered) {
    powerMonitorRegistered = true;
    powerMonitor.on("resume", () => {
      if (activeRestaurantId) void refreshScheduledOrderTaskSchedule();
    });
  }

  void refreshScheduledOrderTaskSchedule().catch((error) => {
    console.error("Failed to start scheduled order task manager:", error);
  });
};

export const stopScheduledOrderTaskManager = (): void => {
  clearTimer();
  clearCleanupTimer();
  activeRestaurantId = null;
  refreshRequested = false;
};
