import { getDB } from '../index'
import { localPathToAssetUrl } from '@main/protocol/local-assets'
import type {
  DishCategoryRecord,
  DishProductRecord,
  DishProductSkuRecord,
  DishProductSpecRecord,
  DishProductSpecItemRecord,
  ProductOptionItemRecord,
  RestaurantOptionRecord,
  RestaurantOptionItemRecord,
} from '@app-types/models/dishes'

type DishCategoryWithProducts = Array<
  DishCategoryRecord & {
    img_url_asset_url?: string | null
    product_list: Array<
      DishProductRecord & {
        menu_img_url_asset_url?: string | null
        detail_img_url_asset_url?: string | null
      }
    >
  }
>
// 获取菜品列表
const getDishProductList = (restaurantId: number) => {
  const db = getDB()
  const res: DishCategoryWithProducts = []
  const dishCategoryList = db
    .prepare(
      `
    SELECT
      dish_category.*,
      local_asset.local_path AS img_url_local_path
    FROM dish_category
    LEFT JOIN local_asset
      ON local_asset.source_url = dish_category.img_url
      AND local_asset.sync_status = 'ready'
    WHERE dish_category.restaurant_id = ?
      AND dish_category.valid_status = 1
      AND dish_category.del_status = 1
    ORDER BY dish_category.sort ASC, dish_category.id ASC
  `,
    )
    .all(restaurantId) as Array<DishCategoryRecord & { img_url_local_path?: string | null }>

  for (const dishCategory of dishCategoryList) {
    const productList = db
      .prepare(
        `
      SELECT
        dish_product.*,
        menu_asset.local_path AS menu_img_url_local_path,
        detail_asset.local_path AS detail_img_url_local_path
      FROM dish_product
      LEFT JOIN local_asset AS menu_asset
        ON menu_asset.source_url = dish_product.menu_img_url
        AND menu_asset.sync_status = 'ready'
      LEFT JOIN local_asset AS detail_asset
        ON detail_asset.source_url = dish_product.detail_img_url
        AND detail_asset.sync_status = 'ready'
      WHERE dish_product.category_id = ?
        AND dish_product.restaurant_id = ?
        AND dish_product.valid_status = 1
        AND dish_product.del_status = 1
      ORDER BY dish_product.sort ASC, dish_product.id ASC
    `,
      )
      .all(dishCategory.id, restaurantId) as Array<
      DishProductRecord & {
        menu_img_url_local_path?: string | null
        detail_img_url_local_path?: string | null
      }
    >

    // 对齐在线菜单：禁用分类或没有有效菜品的分类不在收银菜单中展示。
    if (!productList.length) {
      continue
    }

    res.push({
      ...dishCategory,
      img_url_asset_url: dishCategory.img_url_local_path ? localPathToAssetUrl(dishCategory.img_url_local_path) : null,
      product_list: productList.map((product) => ({
        ...product,
        menu_img_url_asset_url: product.menu_img_url_local_path
          ? localPathToAssetUrl(product.menu_img_url_local_path)
          : null,
        detail_img_url_asset_url: product.detail_img_url_local_path
          ? localPathToAssetUrl(product.detail_img_url_local_path)
          : null,
      })),
    })
  }
  return res
}

type ProductDetail = DishProductRecord & {
  spec_list: Array<
    Pick<DishProductSpecRecord, 'name' | 'spec_no' | 'sort'> & {
      dish_product_spec_item_list: Array<{
        id: DishProductSpecItemRecord['id']
        spec_item_no: DishProductSpecItemRecord['spec_item_no']
        name: DishProductSpecItemRecord['name']
        price: DishProductSpecItemRecord['price']
        sort: DishProductSpecItemRecord['sort']
        sku_no: DishProductSkuRecord['sku_no'] | null
        sku_version: DishProductSkuRecord['version'] | null
        sku_name: DishProductSkuRecord['name'] | null
        sold_out: DishProductSkuRecord['sold_out'] | null
      }>
    }
  >
} & {
  option_list: Array<
    Omit<
      RestaurantOptionRecord,
      'id' | 'restaurant_id' | 'del_status' | 'operator_id' | 'create_time' | 'update_time'
    > & {
      option_item_list: Array<
        Omit<
          RestaurantOptionItemRecord,
          'id' | 'option_id' | 'del_status' | 'operator_id' | 'create_time' | 'update_time'
        > &
          Pick<ProductOptionItemRecord, 'product_option_item_no' | 'recommended_status' | 'sort'>
      >
    }
  >
}
// 获取商品详情
const getProductDetailByProductNo = (productNo: string): Promise<ProductDetail> => {
  const db = getDB()
  const product: DishProductRecord = db
    .prepare(`SELECT * FROM dish_product WHERE product_no = ?`)
    .get(productNo) as DishProductRecord
  let res: ProductDetail = product as ProductDetail

  const specListResult: Array<
    Pick<DishProductSpecRecord, 'name' | 'spec_no' | 'sort'> & {
      dish_product_spec_item_list: Array<{
        id: DishProductSpecItemRecord['id']
        spec_item_no: DishProductSpecItemRecord['spec_item_no']
        name: DishProductSpecItemRecord['name']
        price: DishProductSpecItemRecord['price']
        sort: DishProductSpecItemRecord['sort']
        sku_no: DishProductSkuRecord['sku_no'] | null
        sku_version: DishProductSkuRecord['version'] | null
        sku_name: DishProductSkuRecord['name'] | null
        sold_out: DishProductSkuRecord['sold_out'] | null
      }>
    }
  > = []
  // 查询菜品规格列表
  const specList: Array<DishProductSpecRecord> = db
    .prepare(`SELECT * FROM dish_product_spec WHERE product_id = ?`)
    .all(product.id) as Array<DishProductSpecRecord>
  // 查询每个规格下的规格明细列表
  for (const spec of specList) {
    const dishProductSpecItemList: Array<DishProductSpecItemRecord> = db
      .prepare(`SELECT * FROM dish_product_spec_item WHERE spec_id = ?`)
      .all(spec.id) as Array<DishProductSpecItemRecord>

    const mergedSpecItemList = dishProductSpecItemList.map((specItem) => {
      const skuRecord = db
        .prepare(
          `
          SELECT sku_no, version, name, sold_out
          FROM dish_product_sku
          WHERE product_id = ?
            AND spec_permutation = ?
          ORDER BY id ASC
          LIMIT 1
        `,
        )
        .get(product.id, String(specItem.id)) as
        | Pick<DishProductSkuRecord, 'sku_no' | 'version' | 'name' | 'sold_out'>
        | undefined

      return {
        id: specItem.id,
        spec_item_no: specItem.spec_item_no,
        name: specItem.name,
        price: specItem.price,
        sort: specItem.sort,
        sku_no: skuRecord?.sku_no ?? null,
        sku_version: skuRecord?.version ?? null,
        sku_name: skuRecord?.name ?? null,
        sold_out: skuRecord?.sold_out ?? null,
      }
    })

    const { name, spec_no, sort } = spec
    specListResult.push({
      name,
      spec_no,
      sort,
      dish_product_spec_item_list: mergedSpecItemList,
    })
  }
  // product_option_item 作为关联表，一个商品可对应多个 option 与 option_item
  const productOptionRelations: Array<ProductOptionItemRecord> = db
    .prepare(
      `
      SELECT *
      FROM product_option_item
      WHERE product_id = ?
      ORDER BY option_id ASC, sort ASC, id ASC
    `,
    )
    .all(product.id) as Array<ProductOptionItemRecord>

  let optionListResult: ProductDetail['option_list'] = []
  if (productOptionRelations.length > 0) {
    const optionResultMap = new Map<number, ProductDetail['option_list'][number]>()
    const optionIdOrder: Array<number> = []

    for (const relation of productOptionRelations) {
      let optionDetail = optionResultMap.get(relation.option_id)
      if (!optionDetail) {
        const optionRecord = db
          .prepare(
            `
              SELECT choice_type, name, option_no, remark, required_type
              FROM restaurant_option
              WHERE id = ?
              LIMIT 1
            `,
          )
          .get(relation.option_id) as
          | Pick<RestaurantOptionRecord, 'choice_type' | 'name' | 'option_no' | 'remark' | 'required_type'>
          | undefined

        if (!optionRecord) {
          continue
        }

        optionDetail = {
          ...optionRecord,
          option_item_list: [],
        }
        optionResultMap.set(relation.option_id, optionDetail)
        optionIdOrder.push(relation.option_id)
      }

      const optionItemRecord = db
        .prepare(
          `
            SELECT name, option_item_no, price, sort
            FROM restaurant_option_item
            WHERE id = ?
            LIMIT 1
          `,
        )
        .get(relation.option_item_id) as
        | Pick<RestaurantOptionItemRecord, 'name' | 'option_item_no' | 'price' | 'sort'>
        | undefined

      if (!optionItemRecord) {
        continue
      }

      optionDetail.option_item_list.push({
        ...optionItemRecord,
        product_option_item_no: relation.product_option_item_no,
        recommended_status: relation.recommended_status,
        sort: optionItemRecord.sort,
      })
    }

    optionListResult = optionIdOrder
      .map((optionId) => optionResultMap.get(optionId))
      .filter(Boolean) as ProductDetail['option_list']
  }

  res = {
    ...product,
    spec_list: specListResult,
    option_list: optionListResult,
  }
  return Promise.resolve(res)
}

export { getDishProductList, getProductDetailByProductNo }
