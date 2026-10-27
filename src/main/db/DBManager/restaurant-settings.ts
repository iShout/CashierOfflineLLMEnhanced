import { getDB } from "../index";

import { ORDER_STATUS, ORDER_TYPE, PRODUCT_STATUS } from "../constants/order";
import type { RestaurantAreaRecord, RestaurantRecord, RestaurantTableRecord } from "@app-types/models/settings";
import type { CountryRecord } from "@app-types/models/countries";
import type { FoodOrderRecord } from "@app-types/models/orders";
import { getCurrentSession } from "@main/authManager";

type WaiterTableOrderInfo = FoodOrderRecord;

export interface OrderWaiterTablesResp {
  id: number;
  name: string;
  seat: number | null;
  table_uuid: string | null;
  create_time: string | null;
  country_time_zone_code: string | null;
  order_list: Array<WaiterTableOrderInfo>;
  order_count: number;
  pending_order_count: number;
}

export interface OrderWaiterAreaResp {
  id: number;
  area_name: string | null;
  area_uuid: string | null;
  order_number: number;
  table_info_list: Array<OrderWaiterTablesResp>;
}

/**
 * 根据餐厅ID获取餐厅信息
 * @param restaurantId 餐厅ID
 * @returns
 */
const resolveRestaurantById = (restaurantId?: number | null): RestaurantRecord | undefined => {
  const db = getDB();
  const resolvedRestaurantId = restaurantId ?? getCurrentSession().user?.restaurant_id;

  if (!resolvedRestaurantId) {
    throw new Error("Current session user restaurant_id is missing.");
  }

  return db.prepare("SELECT * FROM restaurant WHERE id = ? LIMIT 1").get(resolvedRestaurantId) as
    | RestaurantRecord
    | undefined;
};

const getOrderWaiterAreaRespList = (
  areaList: Array<RestaurantAreaRecord>,
  tableList: Array<RestaurantTableRecord>,
  waiterTableOrderInfoList: Array<WaiterTableOrderInfo>,
  country: CountryRecord | undefined,
): Array<OrderWaiterAreaResp> => {
  const orderWaiterAreaRespList: Array<OrderWaiterAreaResp> = [];

  for (const areaItem of areaList) {
    let orderNumber = 0;
    const areaTableList = tableList.filter((table) => table.area_id === areaItem.id);

    const tableInfoList: Array<OrderWaiterTablesResp> = areaTableList.map((tableItem) => {
      const orderInfoRespList = waiterTableOrderInfoList
        .filter((order) => order.table_id === tableItem.id)
        .sort((a, b) => {
          if (!a.create_time || !b.create_time) {
            return 0;
          }
          return a.create_time.localeCompare(b.create_time);
        });

      const firstCreateTime =
        orderInfoRespList.length > 0
          ? orderInfoRespList.reduce(
              (min, current) => {
                if (!current.create_time) {
                  return min;
                }
                if (!min || current.create_time < min) {
                  return current.create_time;
                }
                return min;
              },
              null as string | null,
            )
          : null;

      const processingCount = orderInfoRespList.filter(
        (order) => order.order_status === ORDER_STATUS.PROCESSING,
      ).length;
      orderNumber += processingCount;

      return {
        id: tableItem.id,
        name: tableItem.name,
        seat: tableItem.seat,
        table_uuid: tableItem.table_uuid,
        create_time: firstCreateTime,
        country_time_zone_code: country?.time_zone_code ?? null,
        order_list: orderInfoRespList,
        order_count: orderInfoRespList.length,
        // 与 Java 逻辑保持一致：当前前端展示使用总数
        pending_order_count: orderInfoRespList.length,
      };
    });

    orderWaiterAreaRespList.push({
      id: areaItem.id,
      area_name: areaItem.name,
      area_uuid: areaItem.area_uuid,
      order_number: orderNumber,
      table_info_list: tableInfoList,
    });
  }

  return orderWaiterAreaRespList;
};
/**
 * 根据餐厅ID获取餐厅区域列表
 * @param restaurantId 餐厅ID
 * @returns 餐厅区域列表
 */
const getTableAreaList = (restaurantId?: number | null): Array<OrderWaiterAreaResp> => {
  const db = getDB();
  const restaurant = resolveRestaurantById(restaurantId);

  if (!restaurant) {
    return [];
  }

  const country = db.prepare("SELECT * FROM country WHERE en_name = ? LIMIT 1").get(restaurant.country_name) as
    | CountryRecord
    | undefined;

  const areaList = db
    .prepare(
      `
      SELECT *
      FROM restaurant_area
      WHERE restaurant_id = ?
        AND del_status = ?
      ORDER BY id ASC
    `,
    )
    .all(restaurant.id, PRODUCT_STATUS.VALID) as Array<RestaurantAreaRecord>;

  const tableList = db
    .prepare(
      `
      SELECT *
      FROM restaurant_table
      WHERE restaurant_id = ?
        AND del_status = ?
      ORDER BY id ASC
    `,
    )
    .all(restaurant.id, PRODUCT_STATUS.VALID) as Array<RestaurantTableRecord>;

  // 桌面卡片需要展示所有未完成桌台订单，已支付未完成订单也要出现在状态标签里。
  const foodOrders = db
    .prepare(
      `
      SELECT *
      FROM food_order
      WHERE restaurant_id = ?
        AND order_status IN (?, ?)
      ORDER BY datetime(create_time) DESC
    `,
    )
    .all(restaurant.id, ORDER_STATUS.PROCESSING, ORDER_STATUS.RECEIVED) as Array<FoodOrderRecord>;

  const allMasterOrderInnerNoSet = new Set(
    foodOrders
      .filter((order) => order.order_type === ORDER_TYPE.MASTER)
      .map((order) => order.order_inner_no)
      .filter(Boolean),
  );

  const filteredOrders = foodOrders
    .filter((order) => !(order.order_type === ORDER_TYPE.SLAVE && order.order_status !== ORDER_STATUS.PROCESSING))
    .filter((order) => allMasterOrderInnerNoSet.has(order.order_inner_no));

  return getOrderWaiterAreaRespList(areaList, tableList, filteredOrders, country);
};

export { getTableAreaList };
