import { getDB } from "../index";

export const SCHEDULED_ORDER_TASK_TYPE = {
  /** 排队点餐自动备餐：Taken -> Ready for Take-out。 */
  QUEUE_AUTO_PREPARE: "QUEUE_AUTO_PREPARE",
  /** 排队点餐自动取餐：Ready for Take-out -> Complete。 */
  QUEUE_AUTO_PICKUP: "QUEUE_AUTO_PICKUP",
  /** 排队点餐创建 food order 后超过 15 分钟未支付则自动取消。 */
  QUEUE_UNPAID_CANCEL: "QUEUE_UNPAID_CANCEL",
  /** 桌码订单支付后超过 3 天仍未完成则自动完成。 */
  TABLE_ORDER_AUTO_COMPLETE: "TABLE_ORDER_AUTO_COMPLETE",
  // 旧版本任务类型仅用于升级兼容，调度重建时会取消尚未执行的旧任务。
  LEGACY_QUEUE_AUTO_SERVE: "QUEUE_AUTO_SERVE",
  LEGACY_PAID_ORDER_AUTO_COMPLETE: "PAID_ORDER_AUTO_COMPLETE",
} as const;

export type ScheduledOrderTaskType = (typeof SCHEDULED_ORDER_TASK_TYPE)[keyof typeof SCHEDULED_ORDER_TASK_TYPE];

export const SCHEDULED_ORDER_TASK_STATUS = {
  /** 0：等待执行，可被调度器领取或被手动状态流转取消。 */
  PENDING: 0,
  /** 1：执行器已领取并正在执行。 */
  RUNNING: 1,
  /** 2：任务对应的订单状态变更已经成功提交。 */
  SUCCEEDED: 2,
  /** 3：订单状态已被人工或其他流程改变，本次任务无需再执行。 */
  SKIPPED: 3,
  /** 4：最终执行失败且不再重试；当前普通执行异常会先回到 PENDING 重试。 */
  FAILED: 4,
  /** 5：任务在执行前被支付、人工流转、退款、取消或配置变化明确取消。 */
  CANCELLED: 5,
} as const;

type ScheduledOrderTaskStatus = (typeof SCHEDULED_ORDER_TASK_STATUS)[keyof typeof SCHEDULED_ORDER_TASK_STATUS];

export type ScheduledOrderTaskRecord = {
  /** 本地任务记录主键。 */
  id: number;
  /** 幂等键：restaurant_id:order_inner_no:task_type。 */
  task_key: string;
  /** 任务所属餐厅本地主键。 */
  restaurant_id: number;
  /** 旧任务来源 POS，仅用于读取历史记录。 */
  device_no: string | null;
  /** 被操作整单的 order inner no。 */
  order_inner_no: string;
  /** 订单定时任务类型。 */
  task_type: ScheduledOrderTaskType;
  /** 计划执行时间，Unix Epoch 毫秒。 */
  execute_at_ms: number;
  /** 状态：0待执行、1执行中、2成功、3跳过、4失败、5取消。 */
  status: ScheduledOrderTaskStatus;
  /** 任务配置快照 JSON，例如 delay_level、delay_ms、source。 */
  payload_json: string | null;
  /** 累计重试次数。 */
  retry_count: number;
  /** RUNNING 领取租约截止时间，Unix Epoch 毫秒。 */
  lease_until_ms: number | null;
  /** 最近一次执行错误。 */
  last_error: string | null;
  /** 创建时间，跟 food_order 一致使用系统本地文本时间。 */
  created_at: string;
  /** 最后更新时间，跟 food_order 一致使用系统本地文本时间。 */
  updated_at: string;
  /** 最近一次开始执行的时间。 */
  started_at: string | null;
  /** 进入终态的时间，满七天后允许物理清理。 */
  finished_at: string | null;
};

type EnsureScheduledOrderTaskParams = {
  restaurantId: number;
  orderInnerNo: string;
  taskType: ScheduledOrderTaskType;
  executeAtMs: number;
  payload?: Record<string, unknown> | null;
};

export const buildScheduledOrderTaskKey = ({
  restaurantId,
  orderInnerNo,
  taskType,
}: Omit<EnsureScheduledOrderTaskParams, "executeAtMs" | "payload">): string =>
  `${restaurantId}:${orderInnerNo}:${taskType}`;

const getTaskByKey = (taskKey: string): ScheduledOrderTaskRecord | undefined =>
  getDB().prepare("SELECT * FROM scheduled_order_task WHERE task_key = ?").get(taskKey) as
    | ScheduledOrderTaskRecord
    | undefined;

// 相同订单和类型只保留一个任务；已取消或失败的任务允许被业务状态重新激活。
export const ensureScheduledOrderTask = (params: EnsureScheduledOrderTaskParams): ScheduledOrderTaskRecord => {
  const taskKey = buildScheduledOrderTaskKey(params);
  const executeAtMs = Math.max(0, Math.trunc(Number(params.executeAtMs)));

  getDB()
    .prepare(
      `
        INSERT INTO scheduled_order_task (
          task_key,
          restaurant_id,
          order_inner_no,
          task_type,
          execute_at_ms,
          status,
          payload_json,
          created_at,
          updated_at
        ) VALUES (
          @task_key,
          @restaurant_id,
          @order_inner_no,
          @task_type,
          @execute_at_ms,
          @status,
          @payload_json,
          datetime('now', 'localtime'),
          datetime('now', 'localtime')
        )
        ON CONFLICT(task_key) DO UPDATE SET
          execute_at_ms = CASE
            WHEN scheduled_order_task.status IN (@cancelled_status, @failed_status)
              THEN excluded.execute_at_ms
            ELSE scheduled_order_task.execute_at_ms
          END,
          payload_json = CASE
            WHEN scheduled_order_task.status IN (@cancelled_status, @failed_status)
              THEN excluded.payload_json
            ELSE scheduled_order_task.payload_json
          END,
          status = CASE
            WHEN scheduled_order_task.status IN (@cancelled_status, @failed_status)
              THEN @pending_status
            ELSE scheduled_order_task.status
          END,
          lease_until_ms = CASE
            WHEN scheduled_order_task.status IN (@cancelled_status, @failed_status)
              THEN NULL
            ELSE scheduled_order_task.lease_until_ms
          END,
          last_error = CASE
            WHEN scheduled_order_task.status IN (@cancelled_status, @failed_status)
              THEN NULL
            ELSE scheduled_order_task.last_error
          END,
          finished_at = CASE
            WHEN scheduled_order_task.status IN (@cancelled_status, @failed_status)
              THEN NULL
            ELSE scheduled_order_task.finished_at
          END,
          updated_at = datetime('now', 'localtime')
      `,
    )
    .run({
      task_key: taskKey,
      restaurant_id: params.restaurantId,
      order_inner_no: params.orderInnerNo,
      task_type: params.taskType,
      execute_at_ms: executeAtMs,
      status: SCHEDULED_ORDER_TASK_STATUS.PENDING,
      payload_json: params.payload ? JSON.stringify(params.payload) : null,
      pending_status: SCHEDULED_ORDER_TASK_STATUS.PENDING,
      cancelled_status: SCHEDULED_ORDER_TASK_STATUS.CANCELLED,
      failed_status: SCHEDULED_ORDER_TASK_STATUS.FAILED,
    });

  const task = getTaskByKey(taskKey);
  if (!task) {
    throw new Error(`Scheduled order task was not saved: ${taskKey}`);
  }

  return task;
};

export const cancelScheduledOrderTask = (params: {
  restaurantId: number;
  orderInnerNo: string;
  taskType: ScheduledOrderTaskType;
}): boolean => {
  const taskKey = buildScheduledOrderTaskKey(params);
  const result = getDB()
    .prepare(
      `
        UPDATE scheduled_order_task
        SET status = @cancelled_status,
            lease_until_ms = NULL,
            finished_at = datetime('now', 'localtime'),
            updated_at = datetime('now', 'localtime')
        WHERE task_key = @task_key
          AND status = @pending_status
      `,
    )
    .run({
      task_key: taskKey,
      pending_status: SCHEDULED_ORDER_TASK_STATUS.PENDING,
      cancelled_status: SCHEDULED_ORDER_TASK_STATUS.CANCELLED,
    });

  return result.changes > 0;
};

// 手动流转成功后按订单批量取消未领取任务；已进入 RUNNING 的竞态任务交给状态幂等检查兜底。
export const cancelPendingScheduledOrderTasksByOrder = (params: {
  restaurantId: number;
  orderInnerNo: string;
  taskTypes?: ScheduledOrderTaskType[];
}): number => {
  const orderInnerNo = String(params.orderInnerNo ?? "").trim();
  const taskTypes = [...new Set(params.taskTypes ?? [])];
  if (!params.restaurantId || !orderInnerNo) return 0;

  const taskTypeFilter = taskTypes.length > 0 ? `AND task_type IN (${taskTypes.map(() => "?").join(",")})` : "";
  const result = getDB()
    .prepare(
      `
        UPDATE scheduled_order_task
        SET status = ?,
            lease_until_ms = NULL,
            finished_at = datetime('now', 'localtime'),
            updated_at = datetime('now', 'localtime')
        WHERE restaurant_id = ?
          AND order_inner_no = ?
          AND status = ?
          ${taskTypeFilter}
      `,
    )
    .run(
      SCHEDULED_ORDER_TASK_STATUS.CANCELLED,
      params.restaurantId,
      orderInnerNo,
      SCHEDULED_ORDER_TASK_STATUS.PENDING,
      ...taskTypes,
    );

  return result.changes;
};

// 取消旧版本任务：旧 QUEUE_AUTO_PREPARE 表示 Pending -> Taken，不能沿用到新备餐语义。
export const cancelObsoleteScheduledOrderTasks = (restaurantId: number): number => {
  const result = getDB()
    .prepare(
      `
        UPDATE scheduled_order_task
        SET status = @cancelled_status,
            lease_until_ms = NULL,
            finished_at = datetime('now', 'localtime'),
            updated_at = datetime('now', 'localtime')
        WHERE restaurant_id = @restaurant_id
          AND status = @pending_status
          AND (
            task_type IN (@legacy_serve_type, @legacy_complete_type)
            OR (
              task_type = @prepare_type
              AND (payload_json IS NULL OR payload_json NOT LIKE '%"delay_level"%')
            )
          )
      `,
    )
    .run({
      restaurant_id: restaurantId,
      pending_status: SCHEDULED_ORDER_TASK_STATUS.PENDING,
      cancelled_status: SCHEDULED_ORDER_TASK_STATUS.CANCELLED,
      prepare_type: SCHEDULED_ORDER_TASK_TYPE.QUEUE_AUTO_PREPARE,
      legacy_serve_type: SCHEDULED_ORDER_TASK_TYPE.LEGACY_QUEUE_AUTO_SERVE,
      legacy_complete_type: SCHEDULED_ORDER_TASK_TYPE.LEGACY_PAID_ORDER_AUTO_COMPLETE,
    });

  return result.changes;
};

// 分批物理删除超过保留期的终态任务，避免长期运行后任务审计表无限增长。
export const deleteExpiredTerminalScheduledOrderTasks = (params: {
  finishedBefore: string;
  limit?: number;
}): number => {
  const limit = Math.max(1, Math.min(Math.trunc(params.limit ?? 1000), 1000));
  const result = getDB()
    .prepare(
      `
        DELETE FROM scheduled_order_task
        WHERE id IN (
          SELECT id
          FROM scheduled_order_task
          WHERE status IN (
              @succeeded_status,
              @skipped_status,
              @failed_status,
              @cancelled_status
            )
            AND finished_at IS NOT NULL
            AND finished_at < @finished_before
          ORDER BY finished_at ASC, id ASC
          LIMIT @limit
        )
      `,
    )
    .run({
      succeeded_status: SCHEDULED_ORDER_TASK_STATUS.SUCCEEDED,
      skipped_status: SCHEDULED_ORDER_TASK_STATUS.SKIPPED,
      failed_status: SCHEDULED_ORDER_TASK_STATUS.FAILED,
      cancelled_status: SCHEDULED_ORDER_TASK_STATUS.CANCELLED,
      finished_before: params.finishedBefore,
      limit,
    });

  return result.changes;
};

export const recoverScheduledOrderTasks = (restaurantId: number): number => {
  const result = getDB()
    .prepare(
      `
        UPDATE scheduled_order_task
        SET status = @pending_status,
            lease_until_ms = NULL,
            updated_at = datetime('now', 'localtime')
        WHERE restaurant_id = @restaurant_id
          AND status = @running_status
      `,
    )
    .run({
      restaurant_id: restaurantId,
      pending_status: SCHEDULED_ORDER_TASK_STATUS.PENDING,
      running_status: SCHEDULED_ORDER_TASK_STATUS.RUNNING,
    });

  return result.changes;
};

export const listDueScheduledOrderTasks = (
  restaurantId: number,
  nowMs: number,
  limit = 50,
): ScheduledOrderTaskRecord[] =>
  getDB()
    .prepare(
      `
        SELECT *
        FROM scheduled_order_task
        WHERE restaurant_id = @restaurant_id
          AND status = @pending_status
          AND execute_at_ms <= @now_ms
        ORDER BY execute_at_ms ASC, id ASC
        LIMIT @limit
      `,
    )
    .all({
      restaurant_id: restaurantId,
      pending_status: SCHEDULED_ORDER_TASK_STATUS.PENDING,
      now_ms: nowMs,
      limit: Math.max(1, Math.min(Math.trunc(limit), 100)),
    }) as ScheduledOrderTaskRecord[];

export const getNearestScheduledOrderTask = (restaurantId: number): ScheduledOrderTaskRecord | undefined =>
  getDB()
    .prepare(
      `
        SELECT *
        FROM scheduled_order_task
        WHERE restaurant_id = @restaurant_id
          AND status = @pending_status
        ORDER BY execute_at_ms ASC, id ASC
        LIMIT 1
      `,
    )
    .get({
      restaurant_id: restaurantId,
      pending_status: SCHEDULED_ORDER_TASK_STATUS.PENDING,
    }) as ScheduledOrderTaskRecord | undefined;

export const claimScheduledOrderTask = (
  taskId: number,
  nowMs: number,
  leaseUntilMs: number,
): ScheduledOrderTaskRecord | null => {
  const result = getDB()
    .prepare(
      `
        UPDATE scheduled_order_task
        SET status = @running_status,
            lease_until_ms = @lease_until_ms,
            started_at = datetime('now', 'localtime'),
            updated_at = datetime('now', 'localtime')
        WHERE id = @id
          AND status = @pending_status
          AND execute_at_ms <= @now_ms
      `,
    )
    .run({
      id: taskId,
      now_ms: nowMs,
      lease_until_ms: leaseUntilMs,
      pending_status: SCHEDULED_ORDER_TASK_STATUS.PENDING,
      running_status: SCHEDULED_ORDER_TASK_STATUS.RUNNING,
    });

  if (result.changes === 0) return null;

  return getDB().prepare("SELECT * FROM scheduled_order_task WHERE id = ?").get(taskId) as ScheduledOrderTaskRecord;
};

export const finishScheduledOrderTask = (
  taskId: number,
  status: typeof SCHEDULED_ORDER_TASK_STATUS.SUCCEEDED | typeof SCHEDULED_ORDER_TASK_STATUS.SKIPPED,
): void => {
  getDB()
    .prepare(
      `
        UPDATE scheduled_order_task
        SET status = @status,
            lease_until_ms = NULL,
            last_error = NULL,
            finished_at = datetime('now', 'localtime'),
            updated_at = datetime('now', 'localtime')
        WHERE id = @id
          AND status = @running_status
      `,
    )
    .run({
      id: taskId,
      status,
      running_status: SCHEDULED_ORDER_TASK_STATUS.RUNNING,
    });
};

export const retryScheduledOrderTask = (taskId: number, error: unknown, executeAtMs: number): void => {
  getDB()
    .prepare(
      `
        UPDATE scheduled_order_task
        SET status = @pending_status,
            execute_at_ms = @execute_at_ms,
            retry_count = retry_count + 1,
            lease_until_ms = NULL,
            last_error = @last_error,
            updated_at = datetime('now', 'localtime')
        WHERE id = @id
          AND status = @running_status
      `,
    )
    .run({
      id: taskId,
      pending_status: SCHEDULED_ORDER_TASK_STATUS.PENDING,
      running_status: SCHEDULED_ORDER_TASK_STATUS.RUNNING,
      execute_at_ms: executeAtMs,
      last_error: error instanceof Error ? error.message : String(error),
    });
};
