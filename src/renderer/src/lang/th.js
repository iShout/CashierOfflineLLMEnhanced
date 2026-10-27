import order from "./order/th.js";
import components from "./components/th.js";
import inventory from "./inventory/th.js";
import menu from "./menu/th.js";
import map from "./map/th.js";
import menu_manage from "./menu_manage/th.js";
import merchant from "./merchant/th.js";
import system from "./system/th.js";
import data from "./data/th.js";
import setting from "./setting/th.js";
import staff from "./staff/th.js";
import order_list from "./order_list/th.js";
import table_manage from "./table_manage/th.js";
import report from "./report/th.js";
import tips from "./tips/th.js";
import agent from "./agent/th.js";
export default {
  agent,
  report,
  table_manage,
  order,
  components,
  inventory,
  menu,
  map,
  menu_manage,
  merchant,
  system,
  data,
  setting,
  staff,
  order_list,
  tips,
  Pending: "รอดำเนินการ",
  Taken: "ได้รับแล้ว",
  Waiting_for_rider: "รอผู้ส่ง",
  To_be_picked_up: "รอการรับสินค้า",
  Delivery: "กำลังจัดส่ง",
  Completed: "เสร็จสิ้นแล้ว",
  Cancel: "ยกเลิก",
};
