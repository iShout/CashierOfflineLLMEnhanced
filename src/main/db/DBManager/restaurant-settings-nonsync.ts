import { getDB } from "../index";
import dayjs from "dayjs";
import type {
  RestaurantOperationConfigRecord,
  RestaurantRecord,
  RestaurantSettingRecord,
  RestaurantWaitSettingRecord,
} from "@app-types/models/settings";
import type { CountryRecord } from "@app-types/models/countries";
import { getCurrentSession } from "@main/authManager";
import { selectFolder as openSelectFolderDialog } from "@db/utils/file";
import {
  appendSmOrderCsvRecord,
  DEFAULT_MEGAWORLD_DIRECTORY,
  DEFAULT_SM_DIRECTORY,
  generateMegaworldFiles,
  generateParqalFile,
  generateSmCsvFiles,
  getApprovedBirConfig,
  initializeSmCsvFiles,
  MALL_TYPE,
  mergeGenerateResults,
  normalizeMallCertificationSettings,
  readMallCertificationSettings,
  writeMallCertificationSettings,
  type MallCertificationGenerateResult,
  type MallCertificationSettings,
} from "@main/services/mallCertification";

type CountrySettingsFields = Pick<
  CountryRecord,
  "code" | "phone_code" | "time_zone_code" | "name_abbreviation" | "currency_unit" | "currency_symbol"
>;

type RestaurantSettingsByIdResp = RestaurantSettingRecord &
  Partial<RestaurantRecord> &
  Partial<CountrySettingsFields> & {
    wait_order_status: RestaurantWaitSettingRecord["status"] | null;
  };
type BirInfoResp = Omit<RestaurantOperationConfigRecord, "id" | "restaurant_id" | "operator_id">;

// 商场认证补生成入参，日期使用 YYYY-MM-DD。
type MallCertificationRegenerateReq = {
  start_date?: string;
  end_date?: string;
};

// 通过餐厅ID获取餐厅设置信息
const getRestaurantSettingsById = (restaurantId: number): RestaurantSettingsByIdResp => {
  const db = getDB();

  const restaurantSetting = db
    .prepare(
      `
        SELECT *
        FROM restaurant_setting
        WHERE restaurant_id = ?
        LIMIT 1
      `,
    )
    .get(restaurantId) as RestaurantSettingRecord | undefined;

  if (!restaurantSetting) {
    throw new Error(`未找到 restaurant_id=${restaurantId} 对应的餐厅设置`);
  }

  const restaurant = db
    .prepare(
      `
        SELECT *
        FROM restaurant
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(restaurantId) as RestaurantRecord | undefined;

  const country = restaurant?.country_name
    ? (db
        .prepare(
          `
            SELECT
              code,
              phone_code,
              time_zone_code,
              name_abbreviation,
              currency_unit,
              currency_symbol
            FROM country
            WHERE en_name = ?
            LIMIT 1
          `,
        )
        .get(restaurant.country_name) as CountrySettingsFields | undefined)
    : undefined;

  // Zustand 餐厅设置额外携带排队点餐开关，不改变 restaurant_setting 原始数据。
  const waitOrderSetting = db
    .prepare(
      `
        SELECT status AS wait_order_status
        FROM restaurant_wait_setting
        WHERE restaurant_id = ?
        LIMIT 1
      `,
    )
    .get(restaurantId) as Pick<RestaurantSettingsByIdResp, "wait_order_status"> | undefined;

  return {
    ...restaurantSetting,
    ...(restaurant ?? {}),
    ...(country ?? {}),
    wait_order_status: waitOrderSetting?.wait_order_status ?? null,
    restaurant_id: restaurantSetting.restaurant_id,
    id: restaurantSetting.id,
  };
};

// 获取当前登录餐厅设置，供主进程业务落库时复用。
const getCurrentRestaurantSettings = (): RestaurantSettingsByIdResp => {
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  return getRestaurantSettingsById(restaurantId);
};

// 按餐厅读取排队点餐自动化配置，供订单状态流转和定时任务统一复用。
const getRestaurantWaitSettingByRestaurantId = (restaurantId: number): RestaurantWaitSettingRecord | null => {
  const normalizedRestaurantId = Math.trunc(Number(restaurantId));
  if (normalizedRestaurantId <= 0) {
    throw new Error("restaurant_id must be a positive number.");
  }

  return (
    (getDB()
      .prepare(
        `
          SELECT *
          FROM restaurant_wait_setting
          WHERE restaurant_id = ?
          LIMIT 1
        `,
      )
      .get(normalizedRestaurantId) as RestaurantWaitSettingRecord | undefined) ?? null
  );
};

// 获取当前登录餐厅 id，商场认证主进程方法统一从 session 派生餐厅身份。
const getCurrentRestaurantId = (): number => {
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  return restaurantId;
};

// 返回给渲染进程前去除 id / *_id 字段，避免持久化保存本地或后端主键。
const stripIdFields = <T extends Record<string, unknown>>(record: T): Partial<T> => {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== "id" && !key.endsWith("_id")),
  ) as Partial<T>;
};

// 获取当前登录餐厅最新的已审核 BIR 信息，不再按 POS 区分配置。
const getBirInfo = (): Partial<BirInfoResp> | null => {
  const db = getDB();
  const restaurantId = getCurrentRestaurantId();

  const record = db
    .prepare(
      `
        SELECT *
        FROM restaurant_operation_config
        WHERE restaurant_id = @restaurant_id
        ORDER BY
          CASE WHEN audit_status = 3 THEN 0 ELSE 1 END,
          update_time DESC,
          id DESC
        LIMIT 1
      `,
    )
    .get({ restaurant_id: restaurantId }) as RestaurantOperationConfigRecord | undefined;

  return record ? stripIdFields(record) : null;
};

// 获取当前餐厅商场认证设置。
const getMallCertificationSettings = (): MallCertificationSettings => {
  const db = getDB();
  const restaurantId = getCurrentRestaurantId();

  return readMallCertificationSettings(db, restaurantId);
};

// 保存当前餐厅商场认证设置。
const saveMallCertificationSettings = (settings: MallCertificationSettings): MallCertificationSettings => {
  const db = getDB();
  const restaurantId = getCurrentRestaurantId();
  const normalized = normalizeMallCertificationSettings(settings);

  // Parqal 保存前需要先确认 BIR 已审核通过，保持后端 saveOrUpdateDownloadFileSetting 行为一致。
  if (normalized.mall_type === MALL_TYPE.PARQAL && !getApprovedBirConfig(db, restaurantId)) {
    throw new Error(
      "To enable mall certification, you must enable BIR first. Please go to Merchant Dashboard - Settings - System Setting” to submit your BIR info.",
    );
  }

  return writeMallCertificationSettings(db, restaurantId, normalized);
};

// SETTINGS 模块下的目录选择入口，供商场认证页面使用。
const selectMallCertificationFolder = async (): Promise<string | null> => {
  return openSelectFolderDialog();
};

// 生成包含起止日期的日期列表。
const buildDateRange = (startDate: string, endDate: string): string[] => {
  const dates: string[] = [];
  let current = dayjs(startDate).startOf("day");
  const end = dayjs(endDate).startOf("day");

  while (current.isBefore(end) || current.isSame(end)) {
    dates.push(current.format("YYYY-MM-DD"));
    current = current.add(1, "day");
  }

  return dates;
};

// 按日期范围补生成当前商场认证文件。
const regenerateMallCertificationFiles = (req: MallCertificationRegenerateReq): MallCertificationGenerateResult => {
  const db = getDB();
  const restaurantId = getCurrentRestaurantId();
  const settings = getMallCertificationSettings();
  const startDate = req.start_date;
  const endDate = req.end_date;

  if (!startDate || !endDate) {
    throw new Error("start_date and end_date are required.");
  }

  const dates = buildDateRange(startDate, endDate);
  const today = dayjs().startOf("day");
  const startDay = dayjs(startDate).startOf("day");
  const endDay = dayjs(endDate).startOf("day");

  // 补生成遵循商场认证文档：结束日期不能超过今天，单次最多覆盖 7 天。
  if (!startDay.isValid() || !endDay.isValid() || startDay.isAfter(endDay)) {
    throw new Error("Invalid date range.");
  }

  if (endDay.isAfter(today)) {
    throw new Error("End date cannot be later than today.");
  }

  if (dates.length > 7) {
    throw new Error("Date range cannot exceed 7 days.");
  }

  if (settings.mall_type === MALL_TYPE.SM) {
    return generateSmCsvFiles(
      db,
      restaurantId,
      settings.file_download_url || DEFAULT_SM_DIRECTORY,
      `${startDate} 00:00:00`,
      `${endDate} 23:59:59`,
    );
  }

  const results = dates.map((date, index) => {
    if (settings.mall_type === MALL_TYPE.PARQAL) {
      return generateParqalFile(db, restaurantId, settings, date);
    }

    return generateMegaworldFiles(
      db,
      restaurantId,
      {
        ...settings,
        file_download_url: settings.file_download_url || DEFAULT_MEGAWORLD_DIRECTORY,
      },
      date,
      (index % 9) + 1,
    );
  });

  return mergeGenerateResults(results);
};

// 初始化 SM CSV 文件：登录/启动后可确保最近 30 天基础文件存在。
const initializeMallCertificationFiles = (): MallCertificationGenerateResult => {
  const db = getDB();
  const restaurantId = getCurrentRestaurantId();
  const settings = getMallCertificationSettings();

  if (settings.mall_type !== MALL_TYPE.SM) {
    return { files: [], missing_tables: [], warnings: [] };
  }

  return initializeSmCsvFiles(db, restaurantId, settings.file_download_url || DEFAULT_SM_DIRECTORY);
};

// 订单支付/退款成功后追加 SM 单笔记录；非 SM 设置时不做任何文件写入。
const appendMallCertificationOrderRecord = (
  orderInnerNo: string,
  options: { refund_status?: boolean } = {},
): MallCertificationGenerateResult => {
  const db = getDB();
  const restaurantId = getCurrentRestaurantId();
  const settings = getMallCertificationSettings();

  if (settings.mall_type !== MALL_TYPE.SM) {
    return { files: [], missing_tables: [], warnings: [] };
  }

  return appendSmOrderCsvRecord(
    db,
    restaurantId,
    settings.file_download_url || DEFAULT_SM_DIRECTORY,
    orderInnerNo,
    Boolean(options.refund_status),
  );
};

export {
  appendMallCertificationOrderRecord,
  getBirInfo,
  getCurrentRestaurantSettings,
  getMallCertificationSettings,
  getRestaurantSettingsById,
  getRestaurantWaitSettingByRestaurantId,
  initializeMallCertificationFiles,
  regenerateMallCertificationFiles,
  saveMallCertificationSettings,
  selectMallCertificationFolder,
};
