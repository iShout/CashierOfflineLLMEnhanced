const ORDER_TYPE_OPTIONS = [
  {
    value: 0,
    labelKey: "map.order_type_0",
    type: "success",
    countries: [],
  },
  {
    value: 1,
    labelKey: "map.order_type_1",
    type: "warning",
    countries: ["PH", "TH", "MY", "KH", "ID"],
  },
  {
    value: 2,
    labelKey: "map.order_type_2",
    type: "warning",
    countries: ["PH", "TH", "MY", "KH", "ID"],
  },
  {
    value: 3,
    labelKey: "map.order_type_3",
    type: "warning",
    countries: ["PH", "TH", "MY", "KH", "ID"],
  },
  {
    value: 4,
    label: "Grab",
    type: "success",
    countries: ["PH", "TH", "MY", "KH", "ID"],
  },
  {
    value: 5,
    label: "Foodpanda",
    type: "success",
    countries: ["PH", "TH", "MY", "KH"],
  },
  {
    value: 6,
    label: "ShopeeFood",
    type: "success",
    countries: ["TH", "MY", "ID"],
  },
  {
    value: 7,
    label: "GoFood",
    type: "success",
    countries: ["ID"],
  },
  {
    value: 99,
    labelKey: "map.order_type_4",
    type: "success",
    countries: ["PH", "TH", "MY", "KH", "ID"],
  },
];

const COUNTRY_CODE_BY_NAME = new Map([
  ["philippines", "PH"],
  ["thailand", "TH"],
  ["malaysia", "MY"],
  ["cambodia", "KH"],
  ["indonesia", "ID"],
]);

export const getRestaurantCountryCode = (restaurantSetting) => {
  const rawCode = restaurantSetting?.country || restaurantSetting?.country_code || restaurantSetting?.countryCode;

  if (rawCode) {
    return String(rawCode).toUpperCase();
  }

  const rawName = restaurantSetting?.country_name || restaurantSetting?.countryName;
  const normalizedName = rawName ? String(rawName).trim().toLowerCase() : "";

  return COUNTRY_CODE_BY_NAME.get(normalizedName) || "PH";
};

export const getManualOrderTypeOptions = (restaurantSetting, t) => {
  const countryCode = getRestaurantCountryCode(restaurantSetting);

  // 手工录单弹窗沿用在线 Web 的国家过滤规则，渲染时再注入当前语言文案。
  return ORDER_TYPE_OPTIONS.filter((item) => item.countries.includes(countryCode)).map((item) => ({
    label: item.labelKey ? t(item.labelKey) : item.label,
    value: item.value,
    type: item.type,
  }));
};

export const getOrderTypeLabel = (value, t) => {
  const normalizedValue = Number(value);
  const option = ORDER_TYPE_OPTIONS.find((item) => item.value === normalizedValue);

  return option ? option.labelKey ? t(option.labelKey) : option.label : "-";
};
