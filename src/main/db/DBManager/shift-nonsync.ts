import { getDB } from "../index";
import { getCurrentSession } from "@main/authManager";
import dayjs from "dayjs";
import type { WaiterRecord } from "@app-types/models/permission";
import type { RestaurantWaiterClockRecord } from "@app-types/models/shift";
import { getCurrentRestaurantSettings } from "./restaurant-settings-nonsync";
import { queryWaiterSettlementReport } from "./reports-nonsync";
import { toOnlineWaiterClockReportJson } from "./report-json-normalizers";

import { WAITER_STATUS, WAITER_TYPE } from "../constants/order";

type StaffClockWaiter = Pick<WaiterRecord, "id" | "name" | "waiter_no">;

type StaffClockRecordResp = Partial<RestaurantWaiterClockRecord> & {
  waiter_name: string | null;
  waiter_no: string | null;
  restaurant_waiter_id: number;
};

type StaffClockStateParams = {
  restaurant_waiter_id: number;
};

type StaffClockStateResp = {
  restaurant_waiter_id: number;
  waiter_status: number | null;
  is_clocked_in: boolean;
  is_working: boolean;
  is_resting: boolean;
  clock_record: RestaurantWaiterClockRecord | null;
};

type ClockInParams = {
  restaurant_waiter_id: number;
  waiter_clock_type?: number;
  clock_in_local_image?: string | null;
  opening_fund?: number | null;
};

type ClockOutParams = {
  restaurant_waiter_id: number;
  waiter_clock_type?: number;
  clock_out_local_image?: string | null;
  cash_on_hand?: number | null;
};

type ClockParams = ClockInParams & ClockOutParams;

type UpdateOpeningFundParams = {
  waiter_no: string;
  opening_fund: number;
};

type AddLessWithdrawalParams = {
  waiter_no: string;
  less_withdrawal: number;
  less_remark: string;
};

type UpdateCashOnHandParams = {
  waiter_no: string;
  cash_on_hand: number;
};

type TakeBreakParams = {
  restaurant_waiter_id: number;
};

type InsertWaiterClockOrderParams = {
  order_inner_no: string;
  clock_record_id?: number;
  record_order_type: number;
};

type EnsureCurrentWaiterClockOrderParams = {
  order_inner_no: string;
  record_order_type: number;
  restaurant_id?: number | null;
  waiter_id?: number | null;
  waiter_no?: string | null;
};

// 当前waiter是否在上班（返回id，用于签退时修改数据）
export const getActiveClockRecord = (
  restaurantId: number,
  restaurantWaiterId: number,
): Pick<RestaurantWaiterClockRecord, "id" | "waiter_status" | "rest_start_time"> | undefined => {
  // 查询员工是否已有未结束的上班/休息打卡记录
  return getDB()
    .prepare(
      `
        SELECT
          id,
          waiter_status,
          rest_start_time
        FROM restaurant_waiter_clock_record
        WHERE restaurant_id = @restaurantId
          AND restaurant_waiter_id = @restaurantWaiterId
          AND waiter_status IN (1, 2)
          AND del_status = 1
        ORDER BY datetime(working_time) DESC, id DESC
        LIMIT 1
      `,
    )
    .get({
      restaurantId,
      restaurantWaiterId,
    }) as Pick<RestaurantWaiterClockRecord, "id" | "waiter_status" | "rest_start_time"> | undefined;
};

const WAITER_CLOCK_TYPE = {
  TIME_CARD: 1,
  CLOCK_OUT_CARD: 2,
} as const;

const getLatestClockRecord = (
  restaurantId: number,
  restaurantWaiterId: number,
): RestaurantWaiterClockRecord | undefined => {
  return getDB()
    .prepare(
      `
        SELECT *
        FROM restaurant_waiter_clock_record
        WHERE restaurant_id = @restaurantId
          AND restaurant_waiter_id = @restaurantWaiterId
          AND del_status = 1
        ORDER BY datetime(working_time) DESC, id DESC
        LIMIT 1
      `,
    )
    .get({
      restaurantId,
      restaurantWaiterId,
    }) as RestaurantWaiterClockRecord | undefined;
};

const getWaiterByWaiterNo = (
  restaurantId: number,
  waiterNo: string,
): Pick<WaiterRecord, "id" | "waiter_no" | "restaurant_id"> | undefined => {
  return getDB()
    .prepare(
      `
        SELECT id, waiter_no, restaurant_id
        FROM restaurant_waiter
        WHERE restaurant_id = @restaurantId
          AND waiter_no = @waiterNo
        LIMIT 1
      `,
    )
    .get({
      restaurantId,
      waiterNo,
    }) as Pick<WaiterRecord, "id" | "waiter_no" | "restaurant_id"> | undefined;
};

const getLatestAllowanceByWaiterId = (
  restaurantId: number,
  waiterId: number,
):
  | {
      id: number;
      less_withdrawal: number | null;
      cash_on_hand: number | null;
      end_recording_time: string | null;
    }
  | undefined => {
  return getDB()
    .prepare(
      `
        SELECT id, less_withdrawal, cash_on_hand, end_recording_time
        FROM restaurant_waiter_allowance
        WHERE restaurant_id = @restaurantId
          AND waiter_id = @waiterId
        ORDER BY datetime(create_time) DESC, id DESC
        LIMIT 1
      `,
    )
    .get({
      restaurantId,
      waiterId,
    }) as
    | {
        id: number;
        less_withdrawal: number | null;
        cash_on_hand: number | null;
        end_recording_time: string | null;
      }
    | undefined;
};

// 获取员工打卡记录信息
export const getStaffClockRecordList = (): StaffClockRecordResp[] => {
  // 当前登录用户所属餐厅，作为本次查询范围
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const db = getDB();
  // 先取餐厅下所有服务员，后续逐个补齐打卡记录
  const waiters = db
    .prepare(
      `
        SELECT
          id,
          name,
          waiter_no
        FROM restaurant_waiter
        WHERE restaurant_id = @restaurantId
        ORDER BY id ASC
      `,
    )
    .all({ restaurantId }) as StaffClockWaiter[];

  // 优先返回正在上班或休息中的打卡记录
  const activeClockRecordStmt = db.prepare(
    `
      SELECT *
      FROM restaurant_waiter_clock_record
      WHERE restaurant_id = @restaurantId
        AND restaurant_waiter_id = @restaurantWaiterId
        AND waiter_status IN (1, 2)
        AND del_status = 1
      ORDER BY datetime(working_time) DESC, id DESC
      LIMIT 1
    `,
  );

  // 没有进行中的记录时，回退到该服务员最近一条打卡记录
  const latestClockRecordStmt = db.prepare(
    `
      SELECT *
      FROM restaurant_waiter_clock_record
      WHERE restaurant_id = @restaurantId
        AND restaurant_waiter_id = @restaurantWaiterId
        AND del_status = 1
      ORDER BY datetime(working_time) DESC, id DESC
      LIMIT 1
    `,
  );

  return waiters.map((waiter) => {
    const params = {
      restaurantId,
      restaurantWaiterId: waiter.id,
    };
    const clockRecord = (activeClockRecordStmt.get(params) ?? latestClockRecordStmt.get(params)) as
      | RestaurantWaiterClockRecord
      | undefined;

    // 没有打卡记录时，只保留服务员基础信息
    return {
      ...(clockRecord ?? {}),
      waiter_name: waiter.name,
      waiter_no: waiter.waiter_no,
      restaurant_waiter_id: waiter.id,
    };
  });
};

// 获取指定员工当前本地打卡状态，统一封装“是否已打卡/是否上班中”的判断。
export const getStaffClockState = (params: StaffClockStateParams): StaffClockStateResp => {
  const restaurantWaiterId = params?.restaurant_waiter_id;

  if (!restaurantWaiterId) {
    throw new Error("restaurant_waiter_id is required.");
  }

  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const clockRecord = getDB()
    .prepare(
      `
        SELECT *
        FROM restaurant_waiter_clock_record
        WHERE restaurant_id = @restaurantId
          AND restaurant_waiter_id = @restaurantWaiterId
          AND del_status = 1
        ORDER BY
          CASE WHEN waiter_status IN (1, 2) THEN 0 ELSE 1 END,
          datetime(working_time) DESC,
          id DESC
        LIMIT 1
      `,
    )
    .get({
      restaurantId,
      restaurantWaiterId,
    }) as RestaurantWaiterClockRecord | undefined;

  const waiterStatus = clockRecord?.waiter_status ?? null;
  const isWorking = waiterStatus === WAITER_STATUS.WORKING;
  const isResting = waiterStatus === WAITER_STATUS.RESTING;

  return {
    restaurant_waiter_id: restaurantWaiterId,
    waiter_status: waiterStatus,
    is_clocked_in: isWorking || isResting,
    is_working: isWorking,
    is_resting: isResting,
    clock_record: clockRecord ?? null,
  };
};

// 员工上班打卡
export const clockIn = (params: ClockInParams) => {
  const restaurantWaiterId = params?.restaurant_waiter_id;

  if (!restaurantWaiterId) {
    throw new Error("restaurant_waiter_id is required.");
  }

  const user = getCurrentSession().user;
  const restaurantId = user?.restaurant_id;
  const waiterClockId = user?.id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  if (!waiterClockId) {
    throw new Error("Current session user id is missing.");
  }

  const db = getDB();
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const activeClockRecord = getActiveClockRecord(restaurantId, restaurantWaiterId);

  if (activeClockRecord) {
    return {
      clock_id: activeClockRecord.id,
      restaurant_waiter_id: restaurantWaiterId,
      skipped: true,
    };
  }

  const clockInTransaction = db.transaction(() => {
    const clockRecordResult = db
      .prepare(
        `
          INSERT INTO restaurant_waiter_clock_record (
            restaurant_id,
            restaurant_waiter_id,
            working_time,
            working_url,
            clock_in_local_image,
            off_time,
            off_url,
            clock_out_local_image,
            rest_start_time,
            waiter_status,
            waiter_clock_id,
            create_time,
            update_time,
            report_json
          ) VALUES (
            @restaurantId,
            @restaurantWaiterId,
            @now,
            NULL,
            @clockInLocalImage,
            NULL,
            NULL,
            NULL,
            NULL,
            1,
            @waiterClockId,
            @now,
            NULL,
            NULL
          )
        `,
      )
      .run({
        restaurantId,
        restaurantWaiterId,
        clockInLocalImage: params.clock_in_local_image ?? null,
        waiterClockId,
        now,
      });

    const clockId = Number(clockRecordResult.lastInsertRowid);

    db.prepare(
      `
        INSERT INTO restaurant_waiter_allowance (
          restaurant_id,
          clock_id,
          opening_fund,
          cash_on_hand,
          less_withdrawal,
          waiter_id,
          opening_time,
          end_recording_time,
          create_time,
          update_time
        ) VALUES (
          @restaurantId,
          @clockId,
          @openingFund,
          0,
          0,
          @restaurantWaiterId,
          NULL,
          NULL,
          @now,
          NULL
        )
      `,
    ).run({
      restaurantId,
      clockId,
      openingFund: params.opening_fund ?? 0,
      restaurantWaiterId,
      now,
    });

    return {
      clock_id: clockId,
      restaurant_waiter_id: restaurantWaiterId,
    };
  });

  return clockInTransaction();
};

export const clock = (params: ClockParams) => {
  const restaurantWaiterId = params?.restaurant_waiter_id ?? getCurrentSession().user?.id;
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantWaiterId) {
    throw new Error("restaurant_waiter_id is required.");
  }

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const latestClockRecord = getLatestClockRecord(restaurantId, restaurantWaiterId);

  // 后端 /restaurant/cashier/clock：没有历史有效打卡时只允许上班卡。
  if (!latestClockRecord || latestClockRecord.waiter_status === WAITER_STATUS.OFF) {
    if (params.waiter_clock_type === WAITER_CLOCK_TYPE.CLOCK_OUT_CARD) {
      throw new Error("Already clocked in somewhere else");
    }

    return clockIn({
      ...params,
      restaurant_waiter_id: restaurantWaiterId,
      opening_fund: params.opening_fund ?? 0,
    });
  }

  if (params.waiter_clock_type === WAITER_CLOCK_TYPE.TIME_CARD) {
    throw new Error("Already clocked out somewhere else");
  }

  return clockOut({
    ...params,
    restaurant_waiter_id: restaurantWaiterId,
  });
};

// 员工开始/结束休息
export const takeBreak = (params: TakeBreakParams) => {
  const restaurantWaiterId = params?.restaurant_waiter_id;

  if (!restaurantWaiterId) {
    throw new Error("restaurant_waiter_id is required.");
  }

  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const activeClockRecord = getActiveClockRecord(restaurantId, restaurantWaiterId);

  if (!activeClockRecord) {
    throw new Error("No active clock record found.");
  }

  const db = getDB();
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

  if (activeClockRecord.waiter_status === WAITER_STATUS.WORKING) {
    db.prepare(
      `
        UPDATE restaurant_waiter_clock_record
        SET
          rest_start_time = @now,
          waiter_status = 2,
          update_time = @now
        WHERE id = @clockId
      `,
    ).run({
      clockId: activeClockRecord.id,
      now,
    });

    return {
      clock_id: activeClockRecord.id,
      restaurant_waiter_id: restaurantWaiterId,
      waiter_status: 2,
    };
  }

  if (activeClockRecord.waiter_status === WAITER_STATUS.RESTING) {
    if (!activeClockRecord.rest_start_time) {
      throw new Error("Current active clock record rest_start_time is missing.");
    }

    const restDuration = Math.max(0, dayjs(now).diff(dayjs(activeClockRecord.rest_start_time), "second"));

    db.prepare(
      `
        UPDATE restaurant_waiter_clock_record
        SET
          rest_duration = @restDuration,
          waiter_status = 1,
          update_time = @now
        WHERE id = @clockId
      `,
    ).run({
      clockId: activeClockRecord.id,
      restDuration,
      now,
    });

    return {
      clock_id: activeClockRecord.id,
      restaurant_waiter_id: restaurantWaiterId,
      waiter_status: 1,
      rest_duration: restDuration,
    };
  }

  throw new Error("Current active clock record status is invalid.");
};

// 员工下班打卡，后续补充业务逻辑
export const clockOut = (params: ClockOutParams) => {
  const restaurantWaiterId = params?.restaurant_waiter_id;

  if (!restaurantWaiterId) {
    throw new Error("restaurant_waiter_id is required.");
  }

  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const db = getDB();
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const activeClockRecord = getActiveClockRecord(restaurantId, restaurantWaiterId);

  if (!activeClockRecord) {
    throw new Error("No active clock record found.");
  }

  const clockOutTransaction = db.transaction(() => {
    let restDuration = 0;

    if (activeClockRecord.waiter_status === WAITER_STATUS.RESTING) {
      if (!activeClockRecord.rest_start_time) {
        throw new Error("Current active clock record rest_start_time is missing.");
      }

      restDuration = Math.max(0, dayjs(now).diff(dayjs(activeClockRecord.rest_start_time), "second"));
    }

    const previousRestDuration = Number(
      (
        db
          .prepare(
            `
              SELECT rest_duration
              FROM restaurant_waiter_clock_record
              WHERE id = @clockId
            `,
          )
          .get({ clockId: activeClockRecord.id }) as { rest_duration?: number } | undefined
      )?.rest_duration ?? 0,
    );
    const nextRestDuration = previousRestDuration + restDuration;
    const workingTime = (
      db
        .prepare(
          `
            SELECT working_time
            FROM restaurant_waiter_clock_record
            WHERE id = @clockId
          `,
        )
        .get({ clockId: activeClockRecord.id }) as { working_time?: string } | undefined
    )?.working_time;
    const workingDuration = workingTime
      ? Math.max(0, dayjs(now).diff(dayjs(workingTime), "second") - nextRestDuration)
      : 0;

    db.prepare(
      `
          UPDATE restaurant_waiter_clock_record
          SET
            off_time = @now,
            off_url = NULL,
            waiter_status = 3,
            clock_out_local_image = @clockOutLocalImage,
            working_duration = @workingDuration,
            rest_duration = @restDuration,
            update_time = @now
          WHERE id = @clockId
        `,
    ).run({
      clockId: activeClockRecord.id,
      clockOutLocalImage: params.clock_out_local_image ?? null,
      workingDuration,
      restDuration: nextRestDuration,
      now,
    });

    // 交接班输入的手头现金写入资金表，供班次报表计算盈亏。
    if (params.cash_on_hand !== undefined && params.cash_on_hand !== null) {
      const allowanceUpdate = db
        .prepare(
          `
          UPDATE restaurant_waiter_allowance
          SET
            cash_on_hand = @cashOnHand,
            end_recording_time = @now,
            update_time = @now
          WHERE clock_id = @clockId
        `,
        )
        .run({
          clockId: activeClockRecord.id,
          cashOnHand: params.cash_on_hand,
          now,
        });

      if (allowanceUpdate.changes === 0) {
        db.prepare(
          `
            INSERT INTO restaurant_waiter_allowance (
              restaurant_id,
              clock_id,
              opening_fund,
              cash_on_hand,
              less_withdrawal,
              waiter_id,
              opening_time,
              end_recording_time,
              create_time,
              update_time
            ) VALUES (
              @restaurantId,
              @clockId,
              0,
              @cashOnHand,
              0,
              @restaurantWaiterId,
              NULL,
              @now,
              @now,
              NULL
            )
          `,
        ).run({
          restaurantId,
          clockId: activeClockRecord.id,
          cashOnHand: params.cash_on_hand,
          restaurantWaiterId,
          now,
        });
      }
    }

    return {
      clock_id: activeClockRecord.id,
      restaurant_waiter_id: restaurantWaiterId,
      working_time: workingTime,
      off_time: now,
    };
  });

  return clockOutTransaction();
};

export const updateOpeningFund = (params: UpdateOpeningFundParams): boolean => {
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  if (!params?.waiter_no) {
    throw new Error("waiter can not be empty");
  }

  if (params.opening_fund === undefined || params.opening_fund === null) {
    throw new Error("opening fund can not be empty");
  }

  const waiter = getWaiterByWaiterNo(restaurantId, params.waiter_no);

  if (!waiter) {
    throw new Error("waiter not found.");
  }

  const latestClockRecord = getLatestClockRecord(restaurantId, waiter.id);

  if (!latestClockRecord) {
    return true;
  }

  const db = getDB();
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const latestAllowance = getLatestAllowanceByWaiterId(restaurantId, waiter.id);

  if (!latestAllowance) {
    db.prepare(
      `
        INSERT INTO restaurant_waiter_allowance (
          restaurant_id,
          clock_id,
          opening_fund,
          cash_on_hand,
          less_withdrawal,
          waiter_id,
          opening_time,
          end_recording_time,
          create_time,
          update_time
        ) VALUES (
          @restaurantId,
          @clockId,
          @openingFund,
          0,
          0,
          @waiterId,
          @now,
          NULL,
          @now,
          NULL
        )
      `,
    ).run({
      restaurantId,
      clockId: latestClockRecord.id,
      openingFund: params.opening_fund,
      waiterId: waiter.id,
      now,
    });

    return true;
  }

  // 对齐后端 openingFund/update：更新当前服务员最新资金记录并绑定最新打卡记录。
  db.prepare(
    `
      UPDATE restaurant_waiter_allowance
      SET
        clock_id = @clockId,
        opening_fund = @openingFund,
        opening_time = @now,
        update_time = @now
      WHERE id = @allowanceId
    `,
  ).run({
    allowanceId: latestAllowance.id,
    clockId: latestClockRecord.id,
    openingFund: params.opening_fund,
    now,
  });

  return true;
};

export const addLessWithdrawal = (params: AddLessWithdrawalParams): boolean => {
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  if (!params?.waiter_no) {
    throw new Error("waiter can not be empty");
  }

  if (!params.less_remark?.trim()) {
    throw new Error("remark can not be empty");
  }

  if (params.less_withdrawal === undefined || params.less_withdrawal === null) {
    throw new Error("less withdrawal can not be empty");
  }

  const waiter = getWaiterByWaiterNo(restaurantId, params.waiter_no);

  if (!waiter) {
    throw new Error("waiter not found.");
  }

  const latestClockRecord = getLatestClockRecord(restaurantId, waiter.id);

  if (!latestClockRecord) {
    return true;
  }

  const db = getDB();
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const latestAllowance = getLatestAllowanceByWaiterId(restaurantId, waiter.id);

  const addWithdrawalTransaction = db.transaction(() => {
    let allowanceId = latestAllowance?.id;

    if (!latestAllowance) {
      const allowanceResult = db
        .prepare(
          `
            INSERT INTO restaurant_waiter_allowance (
              restaurant_id,
              clock_id,
              opening_fund,
              cash_on_hand,
              less_withdrawal,
              waiter_id,
              opening_time,
              end_recording_time,
              create_time,
              update_time
            ) VALUES (
              @restaurantId,
              @clockId,
              0,
              0,
              @lessWithdrawal,
              @waiterId,
              NULL,
              NULL,
              @now,
              NULL
            )
          `,
        )
        .run({
          restaurantId,
          clockId: latestClockRecord.id,
          lessWithdrawal: params.less_withdrawal,
          waiterId: waiter.id,
          now,
        });

      allowanceId = Number(allowanceResult.lastInsertRowid);
    } else {
      const nextLessWithdrawal = Number(latestAllowance.less_withdrawal ?? 0) + params.less_withdrawal;
      const shouldAdjustCashOnHand =
        latestAllowance.cash_on_hand !== null &&
        latestAllowance.cash_on_hand !== undefined &&
        latestAllowance.end_recording_time &&
        dayjs(latestAllowance.end_recording_time).isBefore(dayjs(now));

      // 对齐后端 less-withdrawal/add：累计提现，并在已录入手头现金时扣减本次提现。
      db.prepare(
        `
          UPDATE restaurant_waiter_allowance
          SET
            clock_id = @clockId,
            less_withdrawal = @lessWithdrawal,
            cash_on_hand = CASE
              WHEN @shouldAdjustCashOnHand = 1 THEN @cashOnHand
              ELSE cash_on_hand
            END,
            end_recording_time = CASE
              WHEN @shouldAdjustCashOnHand = 1 THEN @now
              ELSE end_recording_time
            END,
            update_time = @now
          WHERE id = @allowanceId
        `,
      ).run({
        allowanceId: latestAllowance.id,
        clockId: latestClockRecord.id,
        lessWithdrawal: nextLessWithdrawal,
        shouldAdjustCashOnHand: shouldAdjustCashOnHand ? 1 : 0,
        cashOnHand: Number(latestAllowance.cash_on_hand ?? 0) - params.less_withdrawal,
        now,
      });
    }

    if (!allowanceId) {
      throw new Error("allowance id is missing.");
    }

    // 保存单次提现明细，报表中的 Less Withdrawal 从该明细汇总。
    db.prepare(
      `
        INSERT INTO withdrawal_record (
          restaurant_id,
          clock_id,
          restaurant_waiter_allowance_id,
          once_less_withdrawal,
          remark,
          waiter_id,
          create_time,
          update_time
        ) VALUES (
          @restaurantId,
          @clockId,
          @allowanceId,
          @onceLessWithdrawal,
          @remark,
          @waiterId,
          @now,
          NULL
        )
      `,
    ).run({
      restaurantId,
      clockId: latestClockRecord.id,
      allowanceId,
      onceLessWithdrawal: params.less_withdrawal,
      remark: params.less_remark.trim(),
      waiterId: waiter.id,
      now,
    });

    return true;
  });

  return addWithdrawalTransaction();
};

export const updateCashOnHand = (params: UpdateCashOnHandParams): boolean => {
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  if (!params?.waiter_no) {
    throw new Error("waiter can not be empty");
  }

  if (params.cash_on_hand === undefined || params.cash_on_hand === null) {
    throw new Error("cash on hand can not be empty");
  }

  const waiter = getWaiterByWaiterNo(restaurantId, params.waiter_no);

  if (!waiter) {
    throw new Error("waiter not found.");
  }

  const latestClockRecord = getLatestClockRecord(restaurantId, waiter.id);

  if (!latestClockRecord) {
    return true;
  }

  const db = getDB();
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const latestAllowance = getLatestAllowanceByWaiterId(restaurantId, waiter.id);

  if (!latestAllowance) {
    // 对齐后端 cash-on-hand/add：无资金记录时为最新班次创建一条资金记录。
    db.prepare(
      `
        INSERT INTO restaurant_waiter_allowance (
          restaurant_id,
          clock_id,
          opening_fund,
          cash_on_hand,
          less_withdrawal,
          waiter_id,
          opening_time,
          end_recording_time,
          create_time,
          update_time
        ) VALUES (
          @restaurantId,
          @clockId,
          0,
          @cashOnHand,
          0,
          @waiterId,
          NULL,
          @now,
          @now,
          NULL
        )
      `,
    ).run({
      restaurantId,
      clockId: latestClockRecord.id,
      cashOnHand: params.cash_on_hand,
      waiterId: waiter.id,
      now,
    });

    return true;
  }

  // 当前班次现金在手更新不做签退，只刷新资金表供报表计算。
  db.prepare(
    `
      UPDATE restaurant_waiter_allowance
      SET
        clock_id = @clockId,
        cash_on_hand = @cashOnHand,
        end_recording_time = @now,
        update_time = @now
      WHERE id = @allowanceId
    `,
  ).run({
    allowanceId: latestAllowance.id,
    clockId: latestClockRecord.id,
    cashOnHand: params.cash_on_hand,
    now,
  });

  return true;
};

export const clockReportData = async (params: ClockOutParams) => {
  const result = clock({
    ...params,
    waiter_clock_type: WAITER_CLOCK_TYPE.CLOCK_OUT_CARD,
  }) as {
    clock_id: number;
    restaurant_waiter_id: number;
    working_time?: string;
    off_time?: string;
  };
  const restaurantId = getCurrentSession().user?.restaurant_id;
  const waiterNo = getCurrentSession().user?.waiter_no;
  const restaurantSettings = getCurrentRestaurantSettings();

  if (!restaurantId || !waiterNo || !result.working_time || !result.off_time) {
    throw new Error("Clock report params missing.");
  }

  const report = await queryWaiterSettlementReport({
    restaurantId,
    waiterNo,
    startTime: new Date(result.working_time),
    endTime: new Date(result.off_time),
    isCashierReport: true,
    restaurantName: restaurantSettings.name ?? "",
  });

  const reportJson = JSON.stringify(toOnlineWaiterClockReportJson(report));

  // 打卡报表返回完整打印数据，落库时仅保存线上 report_json 的精简快照结构。
  if (reportJson.length < 65535) {
    getDB()
      .prepare(
        `
          UPDATE restaurant_waiter_clock_record
          SET report_json = @reportJson,
              update_time = @now
          WHERE id = @clockId
        `,
      )
      .run({
        clockId: result.clock_id,
        reportJson,
        now: dayjs().format("YYYY-MM-DD HH:mm:ss"),
      });
  }

  return report;
};

// 插入服务员打卡订单记录
export const insertWaiterClockOrder = (params: InsertWaiterClockOrderParams) => {
  if (!params?.order_inner_no) {
    throw new Error("order_inner_no is required.");
  }

  if (!params?.record_order_type) {
    throw new Error("record_order_type is required.");
  }

  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const db = getDB();
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const clockRecordId = params.clock_record_id ?? 0;

  const result = db
    .prepare(
      `
        INSERT INTO waiter_clock_order (
          restaurant_id,
          order_inner_no,
          restaurant_waiter_clock_record_id,
          record_the_order_type,
          waiter_type,
          new_old_report_status,
          create_time,
          update_time
        ) VALUES (
          @restaurantId,
          @orderInnerNo,
          @clockRecordId,
          @recordOrderType,
          @waiterType,
          2,
          @now,
          @now
        )
      `,
    )
    .run({
      restaurantId,
      orderInnerNo: params.order_inner_no,
      clockRecordId,
      recordOrderType: params.record_order_type,
      // 有打卡记录是服务员订单，否则是自助服务订单
      waiterType: params.clock_record_id ? WAITER_TYPE.REAL_WAITER : WAITER_TYPE.SELF_SERVICE,
      now,
    });

  return {
    id: Number(result.lastInsertRowid),
    order_inner_no: params.order_inner_no,
  };
};

export const ensureCurrentWaiterClockOrder = (params: EnsureCurrentWaiterClockOrderParams) => {
  if (!params?.order_inner_no) {
    throw new Error("order_inner_no is required.");
  }

  if (!params?.record_order_type) {
    throw new Error("record_order_type is required.");
  }

  const { user } = getCurrentSession();
  const restaurantId = params.restaurant_id ?? user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const waiterNo = params.waiter_no ?? user?.waiter_no;
  const localWaiter = waiterNo ? getWaiterByWaiterNo(restaurantId, waiterNo) : undefined;
  // 报表按本地打卡记录归属统计，优先用 waiter_no 解析本地 waiter id，避免线上 session id 写偏。
  const restaurantWaiterId = localWaiter?.id ?? params.waiter_id ?? user?.id;
  const activeClockRecord = restaurantWaiterId ? getActiveClockRecord(restaurantId, restaurantWaiterId) : undefined;
  const clockRecordId = activeClockRecord?.id ?? 0;

  const existing = getDB()
    .prepare(
      `
        SELECT id, order_inner_no
        FROM waiter_clock_order
        WHERE restaurant_id = @restaurantId
          AND order_inner_no = @orderInnerNo
          AND restaurant_waiter_clock_record_id = @clockRecordId
          AND record_the_order_type = @recordOrderType
        LIMIT 1
      `,
    )
    .get({
      restaurantId,
      orderInnerNo: params.order_inner_no,
      clockRecordId,
      recordOrderType: params.record_order_type,
    }) as { id: number; order_inner_no: string } | undefined;

  if (existing) {
    return existing;
  }

  return insertWaiterClockOrder({
    order_inner_no: params.order_inner_no,
    clock_record_id: activeClockRecord?.id,
    record_order_type: params.record_order_type,
  });
};

export const getClockRecordByWaiterNo = (waiterNo: string) => {};

type QueryClockRecordParams = {
  waiter_id: number;
  start_time: string;
  end_time: string;
};

type WaiterClockRecordTimeRangeResp = {
  record_id: number;
  working_time: string | null;
  off_time: string | null;
};
// 获取服务员的所有打卡数据
export const getClockRecordByWaiterID = (params: QueryClockRecordParams): WaiterClockRecordTimeRangeResp[] => {
  if (params?.waiter_id === undefined || params?.waiter_id === null) {
    throw new Error("waiter_id is required.");
  }

  if (!params?.start_time) {
    throw new Error("start_time is required.");
  }

  if (!params?.end_time) {
    throw new Error("end_time is required.");
  }

  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  return getDB()
    .prepare(
      `
        SELECT
          id AS record_id,
          working_time,
          off_time
        FROM restaurant_waiter_clock_record
        WHERE restaurant_id = @restaurantId
          AND restaurant_waiter_id = @waiterId
          AND del_status = 1
          AND (
            datetime(working_time) BETWEEN datetime(@startTime) AND datetime(@endTime)
            OR datetime(off_time) BETWEEN datetime(@startTime) AND datetime(@endTime)
            OR (off_time IS NULL AND datetime(working_time) <= datetime(@endTime))
          )
        ORDER BY datetime(working_time) DESC, id DESC
      `,
    )
    .all({
      restaurantId,
      waiterId: params.waiter_id,
      startTime: params.start_time,
      endTime: params.end_time,
    }) as WaiterClockRecordTimeRangeResp[];
};
