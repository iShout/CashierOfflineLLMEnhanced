// 数据库操作的公共方法

import type { CountryRecord } from "@app-types/models/countries";
import type { WaiterRecord } from "@app-types/models/permission";
import { getCurrentSession } from "@main/authManager";
import { getDB } from "../index";
import { getLocalDeviceIdentity } from "./device-identity";

// 查询本机应用设备身份 ID；需要生成时应先走主进程 deviceIdentity service。
const getCurrentLocalDeviceIdentityId = (): string | null => {
  return getLocalDeviceIdentity()?.device_id ?? null;
};

// 根据服务员编号查询本地服务员主键
const getWaiterIdByWaiterNo = (waiterNo?: string | null): number | null => {
  if (!waiterNo) {
    return null;
  }

  const waiter = getDB()
    .prepare(
      `
        SELECT id
        FROM restaurant_waiter
        WHERE waiter_no = @waiterNo
        LIMIT 1
      `,
    )
    .get({
      waiterNo,
    }) as { id: number } | undefined;

  return waiter?.id ?? null;
};

// 根据餐厅编号查询本地餐厅主键
const getRestaurantIdByRestaurantNo = (restaurantNo?: string | null): number | null => {
  if (!restaurantNo) {
    return null;
  }

  const restaurant = getDB()
    .prepare(
      `
        SELECT id
        FROM restaurant
        WHERE restaurant_no = @restaurantNo
        LIMIT 1
      `,
    )
    .get({
      restaurantNo,
    }) as { id: number } | undefined;

  return restaurant?.id ?? null;
};

// 判断当前餐厅编号是否已经同步到本地 restaurant 表。

// 持久化登录态恢复时可能只有 restaurant_id，用本地 restaurant 表兜底判断同步状态。

// 查询当前国家数据
const queryCurrentContry = (): CountryRecord | null => {
  const restaurantId = getCurrentSession().user.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  const restaurant = getDB()
    .prepare(
      `
        SELECT country_name
        FROM restaurant
        WHERE id = @restaurant_id
        LIMIT 1
      `,
    )
    .get({
      restaurant_id: restaurantId,
    }) as { country_name: string } | undefined;

  if (!restaurant?.country_name) {
    return null;
  }

  return (getDB()
    .prepare(
      `
        SELECT *
        FROM country
        WHERE en_name = @en_name
        LIMIT 1
      `,
    )
    .get({
      en_name: restaurant.country_name,
    }) ?? null) as CountryRecord | null;
};

// 查询当前餐厅下的所有服务员
const getStaffList = (): Pick<WaiterRecord, "id" | "waiter_no" | "name">[] => {
  const restaurantId = getCurrentSession().user?.restaurant_id;

  if (!restaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  return getDB()
    .prepare(
      `
        SELECT
          id,
          waiter_no,
          name
        FROM restaurant_waiter
        WHERE restaurant_id = @restaurantId
          AND on_off = 1
        ORDER BY id ASC
      `,
    )
    .all({
      restaurantId,
    }) as Pick<WaiterRecord, "id" | "waiter_no" | "name">[];
};

export {
  getRestaurantIdByRestaurantNo,
  getCurrentLocalDeviceIdentityId,
  getStaffList,
  getWaiterIdByWaiterNo,
  queryCurrentContry,
};
