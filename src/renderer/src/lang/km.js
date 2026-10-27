import order from "./order/km.js";
import components from "./components/km.js";
import inventory from "./inventory/km.js";
import menu from "./menu/km.js";
import map from "./map/km.js";
import menu_manage from "./menu_manage/km.js";
import merchant from "./merchant/km.js";
import system from "./system/km.js";
import data from "./data/km.js";
import setting from "./setting/km.js";
import staff from "./staff/km.js";
import order_list from "./order_list/km.js";
import table_manage from "./table_manage/km.js";
import report from "./report/km.js";
import tips from "./tips/km.js";
import agent from "./agent/km.js";
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
  Pending: "កំពុងរង់ចាំ",
  Taken: "បានទទួលយក",
  Waiting_for_rider: "រងចាំអ្នកបើកបរ",
  To_be_picked_up: "រងចាំត្រូវបញ្ចេញ",
  Delivery: "ការដឹកជញ្ជូន",
  Completed: "បានធ្វើរួចរាល់",
  Cancel: "បោះបង់",
};
