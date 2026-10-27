import { getDB } from "../index";
import { ORDER_STATUS, PAYMENT_STATUS } from "../constants/order";

let selectCreateOrderContextStmt: any = null;
let selectProcessingMasterOrderStmt: any = null;
let selectSkuIdBySkuNoStmt: any = null;
let createOrderStmt: any = null;
let createOrderDetailStmt: any = null;
let createOrderDetailSnapStmt: any = null;
let createOrderPaymentStmt: any = null;
let createOrderPaymentTaxStmt: any = null;
let createOrderStatusChangeStmt: any = null;
let selectOrderListByOrderInnerNoStmt: any = null;
let selectOrderDetailByOrderIdStmt: any = null;
let selectOrderDetailSnapByOrderIdStmt: any = null;
let selectSuccessfulOrderPaymentByOrderInnerNoStmt: any = null;
let selectOrderPaymentTaxByOrderPaymentIdStmt: any = null;
let updateOrderPaymentFinishStmt: any = null;
let updateFoodOrderPaymentStatusStmt: any = null;
let updateFoodOrderRefundStatusStmt: any = null;
/**
 * 根据 restaurant_no + table_uuid 获取创建订单所需上下文
 */
const getSelectCreateOrderContextStmt = () => {
  if (!selectCreateOrderContextStmt) {
    selectCreateOrderContextStmt = getDB().prepare(`
      SELECT
        r.id AS restaurant_id,
        r.restaurant_type AS restaurant_type,
        t.id AS table_id
      FROM restaurant r
      JOIN restaurant_table t
        ON t.restaurant_id = r.id
       AND t.table_uuid = @table_uuid
      WHERE r.restaurant_no = @restaurant_no
      LIMIT 1
    `);
  }

  return selectCreateOrderContextStmt;
};

/**
 * 按餐厅和桌台查询未完成主订单
 */
const getSelectProcessingMasterOrderStmt = () => {
  if (!selectProcessingMasterOrderStmt) {
    selectProcessingMasterOrderStmt = getDB().prepare(`
      SELECT *
      FROM food_order
      WHERE restaurant_id = @restaurant_id
        AND table_id = @table_id
        AND order_status IN (${ORDER_STATUS.PROCESSING}, ${ORDER_STATUS.RECEIVED})
        AND payment_status IN (${PAYMENT_STATUS.UNPAY}, ${PAYMENT_STATUS.FAILED})
        AND order_type = @order_type
      ORDER BY id DESC
      LIMIT 1
    `);
  }

  return selectProcessingMasterOrderStmt;
};

const getSelectSkuIdBySkuNoStmt = () => {
  if (!selectSkuIdBySkuNoStmt) {
    selectSkuIdBySkuNoStmt = getDB().prepare(`
      SELECT id
      FROM dish_product_sku
      WHERE sku_no = @sku_no
      LIMIT 1
    `);
  }

  return selectSkuIdBySkuNoStmt;
};

/**
 * 插入 food_order 订单主表
 * 注意：该语句用于创建新订单，不包含 UPSERT 逻辑
 */
const getCreateOrderStmt = () => {
  if (!createOrderStmt) {
    createOrderStmt = getDB().prepare(`
      INSERT INTO food_order (
        restaurant_id,
        table_id,
        waiter_no,
        user_no,
        order_inner_no,
        order_no,
        order_payment_id,
        total_amount,
        total_count,
        service_fee,
        customer_num,
        restaurant_type,
        payment_way,
        order_status,
        payment_status,
        order_type,
        order_app,
        complete_time,
        remark,
        cancel_remark,
        order_print_status,
        payment_print_status,
        bill_print_status,
        create_time,
        update_time,
        edit_remark,
        region_office_rest_id,
        headquarter_rest_id,
        tax_type,
        tax_amount,
        review_status,
        order_channel,
        package_fee,
        take_food_no,
        customer_dining_style,
        refund_payment_id,
        refund_time,
        order_serial_number,
        coupon_code,
        coupon_amount,
        refund_waiter_no
      ) VALUES (
        @restaurant_id,
        @table_id,
        @waiter_no,
        @user_no,
        @order_inner_no,
        @order_no,
        @order_payment_id,
        @total_amount,
        @total_count,
        @service_fee,
        @customer_num,
        @restaurant_type,
        @payment_way,
        @order_status,
        @payment_status,
        @order_type,
        @order_app,
        @complete_time,
        @remark,
        @cancel_remark,
        @order_print_status,
        @payment_print_status,
        @bill_print_status,
        @create_time,
        @update_time,
        @edit_remark,
        @region_office_rest_id,
        @headquarter_rest_id,
        @tax_type,
        @tax_amount,
        @review_status,
        @order_channel,
        @package_fee,
        @take_food_no,
        @customer_dining_style,
        @refund_payment_id,
        @refund_time,
        @order_serial_number,
        @coupon_code,
        @coupon_amount,
        @refund_waiter_no
      )
    `);
  }

  return createOrderStmt;
};

// 订单详情插入语句
const getCreateOrderDetailStmt = () => {
  if (!createOrderDetailStmt) {
    createOrderDetailStmt = getDB().prepare(`
      INSERT INTO order_detail (
        order_id,
        sku_id,
        count,
        sku_amount,
        option_amount,
        detail_type,
        detail_snapshot,
        create_time,
        update_time,
        parent_id
      ) VALUES (
        @order_id,
        @sku_id,
        @count,
        @sku_amount,
        @option_amount,
        @detail_type,
        @detail_snapshot,
        @create_time,
        @update_time,
        @parent_id
      )
    `);
  }

  return createOrderDetailStmt;
};

// 订单详情快照插入语句
const getCreateOrderDetailSnapStmt = () => {
  if (!createOrderDetailSnapStmt) {
    createOrderDetailSnapStmt = getDB().prepare(`
      INSERT INTO order_detail_snap (
        food_order_id,
        order_detail_id,
        product_name,
        menu_img_url,
        product_count,
        sku_name,
        sku_price,
        variant,
        option_item_json,
        sku_version,
        create_time,
        update_time
      ) VALUES (
        @food_order_id,
        @order_detail_id,
        @product_name,
        @menu_img_url,
        @product_count,
        @sku_name,
        @sku_price,
        @variant,
        @option_item_json,
        @sku_version,
        @create_time,
        @update_time
      )
    `);
  }

  return createOrderDetailSnapStmt;
};

const getCreateOrderPaymentStmt = () => {
  if (!createOrderPaymentStmt) {
    createOrderPaymentStmt = getDB().prepare(`
      INSERT INTO order_payment (
        restaurant_id,
        restaurant_user_id,
        user_no,
        order_inner_no,
        mch_order_id,
        transaction_id,
        amount,
        transaction_status,
        pay_product_type,
        channel_code,
        payment_platform,
        final_payment_status,
        transaction_create_time,
        transaction_return_time,
        create_time,
        update_time,
        real_amount,
        discount_number,
        discount_no,
        discount_type,
        real_tax_amount,
        real_service_fee,
        system_transaction_no,
        refund_serial_no,
        coupon_amount,
        cash_receipt_amount,
        refund_remark,
        discounter_name,
        discount_validity_period,
        discount_serial_no,
        discount_amount,
        receipt_no,
        waiter_id,
        real_customer_num,
        surcharge,
        promo_discount_type
      ) VALUES (
        @restaurant_id,
        @restaurant_user_id,
        @user_no,
        @order_inner_no,
        @mch_order_id,
        @transaction_id,
        @amount,
        @transaction_status,
        @pay_product_type,
        @channel_code,
        @payment_platform,
        @final_payment_status,
        @transaction_create_time,
        @transaction_return_time,
        @create_time,
        @update_time,
        @real_amount,
        @discount_number,
        @discount_no,
        @discount_type,
        @real_tax_amount,
        @real_service_fee,
        @system_transaction_no,
        @refund_serial_no,
        @coupon_amount,
        @cash_receipt_amount,
        @refund_remark,
        @discounter_name,
        @discount_validity_period,
        @discount_serial_no,
        @discount_amount,
        @receipt_no,
        @waiter_id,
        @real_customer_num,
        @surcharge,
        @promo_discount_type
      )
    `);
  }

  return createOrderPaymentStmt;
};

const getCreateOrderPaymentTaxStmt = () => {
  if (!createOrderPaymentTaxStmt) {
    createOrderPaymentTaxStmt = getDB().prepare(`
      INSERT INTO order_payment_tax (
        order_payment_id,
        vatable_sales,
        tax_amount,
        vat_exempt_sales,
        vat_exemption,
        zero_rated_sales,
        create_time,
        update_time,
        pwd_discount,
        less_vat,
        promo_discount,
        vat_register_status
      ) VALUES (
        @order_payment_id,
        @vatable_sales,
        @tax_amount,
        @vat_exempt_sales,
        @vat_exemption,
        @zero_rated_sales,
        @create_time,
        @update_time,
        @pwd_discount,
        @less_vat,
        @promo_discount,
        @vat_register_status
      )
    `);
  }

  return createOrderPaymentTaxStmt;
};

const getCreateOrderStatusChangeStmt = () => {
  if (!createOrderStatusChangeStmt) {
    createOrderStatusChangeStmt = getDB().prepare(`
      INSERT INTO order_status_change (
        order_inner_no,
        status_type,
        status,
        display_type,
        operator_id,
        remark,
        create_time,
        order_no,
        operator_name
      ) VALUES (
        @order_inner_no,
        @status_type,
        @status,
        @display_type,
        @operator_id,
        @remark,
        @create_time,
        @order_no,
        @operator_name
      )
    `);
  }

  return createOrderStatusChangeStmt;
};

// 通过order inner no 获取订单列表
const getSelectOrderListByOrderInnerNoStmt = () => {
  if (!selectOrderListByOrderInnerNoStmt) {
    selectOrderListByOrderInnerNoStmt = getDB().prepare(`
      SELECT * FROM food_order WHERE order_inner_no = @order_inner_no
    `);
  }
  return selectOrderListByOrderInnerNoStmt;
};

// 通过order的id获取订单详情
const getSelectOrderDetailByOrderIdStmt = () => {
  if (!selectOrderDetailByOrderIdStmt) {
    selectOrderDetailByOrderIdStmt = getDB().prepare(`
      SELECT * FROM order_detail WHERE order_id = @id
    `);
  }
  return selectOrderDetailByOrderIdStmt;
};

// 通过order的id获取订单详情快照
const getSelectOrderDetailSnapByOrderIdStmt = () => {
  if (!selectOrderDetailSnapByOrderIdStmt) {
    selectOrderDetailSnapByOrderIdStmt = getDB().prepare(`
      SELECT * FROM order_detail_snap WHERE food_order_id = @id
    `);
  }
  return selectOrderDetailSnapByOrderIdStmt;
};

const getSelectSuccessfulOrderPaymentByOrderInnerNoStmt = () => {
  if (!selectSuccessfulOrderPaymentByOrderInnerNoStmt) {
    selectSuccessfulOrderPaymentByOrderInnerNoStmt = getDB().prepare(`
      SELECT *
      FROM order_payment
      WHERE order_inner_no = @order_inner_no
        AND final_payment_status = 1
        AND transaction_status = ${PAYMENT_STATUS.PAY_SUCCESS}
      ORDER BY id DESC
      LIMIT 1
    `);
  }

  return selectSuccessfulOrderPaymentByOrderInnerNoStmt;
};

const getSelectOrderPaymentTaxByOrderPaymentIdStmt = () => {
  if (!selectOrderPaymentTaxByOrderPaymentIdStmt) {
    selectOrderPaymentTaxByOrderPaymentIdStmt = getDB().prepare(`
      SELECT *
      FROM order_payment_tax
      WHERE order_payment_id = @order_payment_id
      ORDER BY id DESC
      LIMIT 1
    `);
  }

  return selectOrderPaymentTaxByOrderPaymentIdStmt;
};

// 将payment order的数据更新为支付成功
const getUpdateOrderPaymentFinishStmt = () => {
  if (!updateOrderPaymentFinishStmt) {
    updateOrderPaymentFinishStmt = getDB().prepare(`
      UPDATE order_payment
      SET
        transaction_status = @transaction_status,
        final_payment_status = @final_payment_status,
        receipt_no = @receipt_no,
        transaction_return_time = @transaction_return_time,
        update_time = @update_time
      WHERE mch_order_id = @mch_order_id
    `);
  }

  return updateOrderPaymentFinishStmt;
};

// 将同一 order_inner_no 下的订单更新为支付成功，并完成订单
const getUpdateFoodOrderPaymentStatusStmt = () => {
  if (!updateFoodOrderPaymentStatusStmt) {
    updateFoodOrderPaymentStatusStmt = getDB().prepare(`
      UPDATE food_order
      SET
        order_payment_id = @order_payment_id,
        order_status = @order_status,
        payment_status = @payment_status,
        service_fee = @service_fee,
        customer_num = @customer_num,
        payment_way = @payment_way,
        tax_amount = @tax_amount,
        complete_time = @complete_time,
        update_time = @update_time
      WHERE order_inner_no = @order_inner_no
    `);
  }

  return updateFoodOrderPaymentStatusStmt;
};

const getUpdateFoodOrderRefundStatusStmt = () => {
  if (!updateFoodOrderRefundStatusStmt) {
    updateFoodOrderRefundStatusStmt = getDB().prepare(`
      UPDATE food_order
      SET
        order_status = CASE
          WHEN order_status != @complete_status THEN @complete_status
          ELSE order_status
        END,
        payment_status = @payment_status,
        complete_time = CASE
          WHEN order_status != @complete_status THEN @refund_time
          ELSE complete_time
        END,
        refund_time = @refund_time,
        refund_payment_id = @refund_payment_id,
        refund_waiter_no = @refund_waiter_no,
        update_time = @update_time
      WHERE order_inner_no = @order_inner_no
    `);
  }

  return updateFoodOrderRefundStatusStmt;
};

export {
  getSelectCreateOrderContextStmt,
  getSelectProcessingMasterOrderStmt,
  getSelectSkuIdBySkuNoStmt,
  getCreateOrderStmt,
  getCreateOrderDetailStmt,
  getCreateOrderDetailSnapStmt,
  getCreateOrderPaymentStmt,
  getCreateOrderPaymentTaxStmt,
  getCreateOrderStatusChangeStmt,
  getSelectOrderListByOrderInnerNoStmt,
  getSelectOrderDetailByOrderIdStmt,
  getSelectOrderDetailSnapByOrderIdStmt,
  getSelectSuccessfulOrderPaymentByOrderInnerNoStmt,
  getSelectOrderPaymentTaxByOrderPaymentIdStmt,
  getUpdateOrderPaymentFinishStmt,
  getUpdateFoodOrderPaymentStatusStmt,
  getUpdateFoodOrderRefundStatusStmt,
};
