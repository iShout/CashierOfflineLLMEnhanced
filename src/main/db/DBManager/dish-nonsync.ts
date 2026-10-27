import { getDB } from '../index'
import { getCurrentSession } from '@main/authManager'
import type { DishCategoryRecord } from '@app-types/models/dishes'

// 获取菜品的category列表
export const getCategoryList = (): Pick<
  DishCategoryRecord,
  'id' | 'name' | 'category_no'
>[] => {
  const restaurantId = getCurrentSession().user?.restaurant_id

  if (!restaurantId) {
    throw new Error('Current session user restaurant_id is missing.')
  }

  return getDB()
    .prepare(
      `
        SELECT
          id,
          name,
          category_no
        FROM dish_category
        WHERE restaurant_id = @restaurantId
          AND valid_status = 1
        ORDER BY sort ASC, id ASC
      `,
    )
    .all({
      restaurantId,
    }) as Pick<DishCategoryRecord, 'id' | 'name' | 'category_no'>[]
}
