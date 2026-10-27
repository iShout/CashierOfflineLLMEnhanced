import { ORDER_CHANGE_STATUS } from '../constants/order'

export const statusChangeRemark = new Map<ORDER_CHANGE_STATUS, string>([
  [ORDER_CHANGE_STATUS.PLACE_ORDER, 'Ordered Successfully'],
  [ORDER_CHANGE_STATUS.ORDERS, 'Merchant has accepted order'],
  [ORDER_CHANGE_STATUS.START_DELIVERY, 'Merchant has prepared the meals'],
  [ORDER_CHANGE_STATUS.DELIVERY_COMPLETED, 'Arrived at Drop Off'],
  [ORDER_CHANGE_STATUS.DELIVERY_FAILED, 'Cancel the order'],
  [ORDER_CHANGE_STATUS.INITIATE_A_REFUND, 'Refund pending'],
  [ORDER_CHANGE_STATUS.REFUND_SUCCESSFUL, 'Refunded'],
  [ORDER_CHANGE_STATUS.REFUND_FAILED, 'Refund failed'],
  [ORDER_CHANGE_STATUS.WAITING_FOR_RIDER, 'Waiting for rider'],
  [ORDER_CHANGE_STATUS.PICK_UP_AN_ORDER, 'Pick up an order'],
  [ORDER_CHANGE_STATUS.MEALS_TO_BE_SERVED, 'Ready for Take-out'],
  [ORDER_CHANGE_STATUS.PAID, 'Paid'],
  [ORDER_CHANGE_STATUS.PAYMENT_FAILED, 'Payment failed'],
  [ORDER_CHANGE_STATUS.COMPLETED, 'Completed'],
])
