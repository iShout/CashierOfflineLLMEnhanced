export interface DishCategoryRecord {
  id: number;
  /** 餐厅主键ID */
  restaurant_id: number;
  /** 商户自定义分类名称 */
  mch_category_id: string | null;
  name: string;
  /** 分类编号 */
  category_no: string;
  /** 启用状态: 1.可用 2.不可用 */
  valid_status: number;
  /** 排序顺序 */
  sort: number;
  /** 最新操作人 */
  operator_id: number;
  /** 类目图片地址 */
  img_url: string | null;
  /** 逻辑删除 1.未删除 2.已删除 */
  del_status: number;
  /** 备注 */
  remark: string | null;
  create_time: string | null;
  update_time: string | null;
}

export interface DishProductRecord {
  id: number;
  /** 菜单分类主键ID */
  category_id: number;
  /** 餐厅主键ID */
  restaurant_id: number;
  /** 菜品编号 */
  product_no: string;
  /** 菜品名称 */
  name: string;
  /** 菜品概述 */
  brief: string | null;
  /** 菜品描述 */
  description: string | null;
  /** 排序顺序 */
  sort: number;
  /** 菜单图片url */
  menu_img_url: string | null;
  /** 详情图片url */
  detail_img_url: string | null;
  /** 是否多规格 1.是 2.否 */
  variant: number;
  /** 是否销售 1.是 2.否 */
  sold_out: number;
  /** 是否启用 1.是 2.否 */
  valid_status: number;
  /** 逻辑删除 1.未删除 2.已删除 */
  del_status: number;
  /** 备注 */
  remark: string | null;
  /** 最新操作人 */
  operator_id: number;
  create_time: string;
  update_time: string | null;
}

export interface DishProductSkuRecord {
  id: number;
  /** 餐厅主键ID */
  restaurant_id: number;
  /** 菜品主键ID */
  product_id: number;
  /** sku编码 */
  sku_no: string;
  /** sku名称 */
  name: string;
  /** 规格排列（以规格item的ID顺序正序排序） */
  spec_permutation: string | null;
  /** 价格 */
  price: number;
  /** 是否销售 1.是 2.否 */
  sold_out: number;
  /** 是否启用 1.是 2.否 */
  valid_status: number;
  /** 逻辑删除 1.未删除 2.已删除 */
  del_status: number;
  /** 备注 */
  remark: string | null;
  /** 版本号，当更新sku时版本+1 */
  version: number;
  /** 最新操作人 */
  operator_id: number;
  create_time: string | null;
  update_time: string | null;
}

export interface DishProductSpecRecord {
  id: number;
  /** 菜品主键ID */
  product_id: number;
  /** 菜品规格编号 */
  spec_no: string | null;
  /** 菜品规格名称 */
  name: string;
  /** 排序顺序 */
  sort: number;
  /** 逻辑删除 1.未删除 2.已删除 */
  del_status: number;
  /** 最新操作人 */
  operator_id: number;
  create_time: string | null;
  update_time: string | null;
}

export interface DishProductSpecItemRecord {
  id: number;
  /** 菜品规格主键ID */
  spec_id: number;
  /** 菜品规格明细编号 */
  spec_item_no: string | null;
  name: string;
  /** 价格 */
  price: number;
  /** 排序顺序 */
  sort: number;
  /** 逻辑删除 1.未删除 2.已删除 */
  del_status: number;
  /** 最新操作人 */
  operator_id: number;
  create_time: string | null;
  update_time: string | null;
}

export interface ProductOptionItemRecord {
  id: number;
  /** 菜品option关联NO */
  product_option_item_no: string | null;
  /** 菜品主键ID */
  product_id: number;
  /** 附加元素主键ID */
  option_id: number;
  /** 附加属性明细主键ID */
  option_item_id: number;
  /** 排序顺序 */
  sort: number;
  /** 是否推荐: 1.默认 2.是 */
  recommended_status: number;
  create_time: string | null;
  update_time: string | null;
}

export interface RestaurantOptionRecord {
  /** 主键id */
  id: number;
  /** option no */
  option_no: string | null;
  /** 餐厅主键ID */
  restaurant_id: number;
  /** 名称 */
  name: string;
  /** 是否必选 1.必选 2.可选 */
  required_type: number;
  /** 选项类型 1.单选 2.复选 */
  choice_type: number;
  /** 删除状态 1：删除 2：不删 */
  del_status: number;
  /** 备注 */
  remark: string | null;
  /** 最新操作人 */
  operator_id: number;
  create_time: string | null;
  update_time: string | null;
}

export interface RestaurantOptionItemRecord {
  id: number;
  /** 附加属性主键ID */
  option_id: number;
  /** option item id */
  option_item_no: string | null;
  name: string;
  /** 价格 */
  price: number;
  /** 排序顺序 */
  sort: number;
  /** 删除状态 1：删除 2：不删 */
  del_status: number;
  /** 最新操作人 */
  operator_id: number;
  create_time: string | null;
  update_time: string | null;
}
