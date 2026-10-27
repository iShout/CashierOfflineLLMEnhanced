import { Button, Modal, message } from "antd";
import StatusTag from "@renderer/components/StatusTag.jsx";
import RollingNumber from "@renderer/components/RollingNumber.jsx";
import AnimatedList from "@renderer/components/AnimatedList";
import OrderTrackModal from "../../../orders/components/Modals/OrderTrackModal.jsx";
import OrderRefundModal from "../../../orders/components/Modals/OrderRefundModal.jsx";

import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import useStore from "@renderer/store";

import { format } from "@renderer/utils/MoneyUtils";
import { serviceTypeMap, orderChannelMap } from "@renderer/map";
import useCancelOrder from "@renderer/hooks/useCancelOrder.jsx";

import { getPendingOrderActions, PENDING_ORDER_ACTION } from "@renderer/utils/orderActionRules";

const QUEUE_ORDER_CHANNEL = 3;

const PendingOrdersModal = ({ open, cancelModal, onOrderCanceled }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cancelOrder, contextHolder: cancelOrderContextHolder } = useCancelOrder();

  const [messageApi, messageContextHolder] = message.useMessage();
  const [pendingOrders, setPendingOrders] = useState([]); // pending orders列表
  const [currentOrderIndex, setCurrentOrderIndex] = useState(0);
  const [orderTrackVisible, setOrderTrackVisible] = useState(false);
  const [orderRefundVisible, setOrderRefundVisible] = useState(false);
  const [orderStatusList, setOrderStatusList] = useState([]);
  const { currency_symbol, mode } = useStore((state) => state.restaurantSetting);

  const handleClose = () => {
    cancelModal();
  };

  const fetchPendingOrders = useCallback(() => {
    return window.api.orders.getUncompleteOrders().then((res) => {
      console.log(res, "Pending Orders");
      setPendingOrders(res);
      setCurrentOrderIndex((lastIndex) => {
        return Math.min(lastIndex, Math.max(res.length - 1, 0));
      });
      return res;
    });
  }, []);

  //当前显示的订单
  const currentOrder = pendingOrders[currentOrderIndex] || null;

  // 打开订单追踪弹窗并查询相关数据
  const showOrderTrack = () => {
    if (!currentOrder?.order_inner_no) {
      return;
    }

    window.api.orders.getOrderHistory(currentOrder.order_inner_no).then((res) => {
      setOrderStatusList(res);
      setOrderTrackVisible(true);
    });
  };

  const resetOrderTrack = useCallback(() => {
    setOrderTrackVisible(false);
    setOrderStatusList([]);
  }, [setOrderStatusList, setOrderTrackVisible]);

  const refreshAfterOrderAction = useCallback(
    (nextPendingOrders) => {
      // 状态按钮会影响 pending 数量和桌台占用，操作后同步刷新父页面。
      const refreshParent = onOrderCanceled?.() ?? Promise.resolve();

      if (nextPendingOrders.length === 0) {
        cancelModal();
      }

      return refreshParent;
    },
    [cancelModal, onOrderCanceled],
  );

  const showCancelOrderModal = useCallback(() => {
    cancelOrder({
      orderInnerNo: currentOrder?.order_inner_no,
      onSuccess: () => {
        resetOrderTrack();
        return fetchPendingOrders().then(refreshAfterOrderAction);
      },
    });
  }, [cancelOrder, currentOrder?.order_inner_no, fetchPendingOrders, refreshAfterOrderAction, resetOrderTrack]);

  const runOrderStatusAction = useCallback(
    (actionPromise, successMessage) => {
      if (!currentOrder?.order_inner_no) {
        return;
      }

      const orderInnerNo = currentOrder.order_inner_no;

      actionPromise({ order_inner_no: orderInnerNo })
        .then(() => {
          resetOrderTrack();
          messageApi.success(successMessage);
          return fetchPendingOrders().then(refreshAfterOrderAction);
        })
        .catch((error) => {
          messageApi.error(error?.message);
        });
    },
    [currentOrder, fetchPendingOrders, messageApi, refreshAfterOrderAction, resetOrderTrack],
  );

  const confirmRefund = (remark) => {
    if (!currentOrder?.order_inner_no) {
      return;
    }

    const orderInnerNo = currentOrder.order_inner_no;
    window.api.orders
      .orderRefund({ refund_remark: remark, order_inner_no: orderInnerNo })
      .then(() => {
        resetOrderTrack();
        setOrderRefundVisible(false);
        messageApi.success(t("tips.refund_successfully"));
        return fetchPendingOrders().then(refreshAfterOrderAction);
      })
      .catch((error) => {
        messageApi.error(error?.message);
      });
  };

  const goBillOut = useCallback(() => {
    if (!currentOrder?.order_inner_no) {
      return;
    }

    navigate("/bill-out", {
      state: {
        orderInnerNo: currentOrder.order_inner_no,
        tableUuid: currentOrder.table_uuid ?? "",
      },
    });
  }, [currentOrder, navigate]);

  // 点击next / prev
  const goNextPrev = (go) => {
    switch (go) {
      case "next":
        if (currentOrderIndex === pendingOrders.length - 1) {
          return;
        }
        resetOrderTrack();
        setCurrentOrderIndex((last) => last + 1);
        break;
      case "prev":
        if (currentOrderIndex === 0) {
          return;
        }
        resetOrderTrack();
        setCurrentOrderIndex((last) => last - 1);
        break;
      default:
        break;
    }
  };

  // 当前显示订单的product list
  const currentProductList = useMemo(() => {
    if (!currentOrder) {
      return [];
    }

    return (currentOrder.order_list || []).flatMap((order) =>
      (order.product_list || []).map((product) => ({
        ...product,
        productKey: product.order_detail_id || `${order.order_no}-${product.sku_no}`,
      })),
    );
  }, [currentOrder]);

  // 是否还有下一个
  const hasNext = useMemo(() => {
    const lastIndex = pendingOrders.length - 1;
    return currentOrderIndex < lastIndex;
  }, [pendingOrders, currentOrderIndex]);
  // 是否还有上一个
  const hasPrev = useMemo(() => {
    return currentOrderIndex !== 0;
  }, [currentOrderIndex]);

  const mainOrder = currentOrder?.order_list?.[0]; // 主订单
  // 排队点餐展示取餐号，桌台点餐继续展示客人数。
  const isQueueOrder = Number(currentOrder?.order_channel) === QUEUE_ORDER_CHANNEL;
  const summaryNumber = isQueueOrder ? currentOrder?.take_food_no : mainOrder?.customer_num;
  const serviceTypeText = currentOrder ? serviceTypeMap.get(currentOrder.customer_dining_style)?.text : null;
  const orderChannelText = currentOrder ? orderChannelMap.get(currentOrder.order_channel)?.text : null;
  const actionOrder = useMemo(
    () =>
      mainOrder
        ? {
            ...mainOrder,
            order_channel: mainOrder.order_channel ?? currentOrder?.order_channel,
          }
        : null,
    [currentOrder, mainOrder],
  );
  const pendingOrderActions = useMemo(() => getPendingOrderActions({ order: actionOrder, mode }), [actionOrder, mode]);

  const getPendingActionText = useCallback(
    (action) => {
      const textMap = {
        [PENDING_ORDER_ACTION.CANCEL]: t("components.cancel"),
        [PENDING_ORDER_ACTION.TAKE]: t("components.take"),
        [PENDING_ORDER_ACTION.BILL_OUT]: t("menu.bill_out"),
        [PENDING_ORDER_ACTION.COMPLETE]: t("components.complete"),
        [PENDING_ORDER_ACTION.SERVE]: t("order.serve"),
        [PENDING_ORDER_ACTION.REFUND]: t("order.refund"),
      };

      return textMap[action] ?? action;
    },
    [t],
  );

  const onClickPendingAction = useCallback(
    (action) => {
      switch (action) {
        case PENDING_ORDER_ACTION.CANCEL:
          showCancelOrderModal();
          break;
        case PENDING_ORDER_ACTION.TAKE:
          runOrderStatusAction(window.api.orders.orderTake, t("tips.take_successfully"));
          break;
        case PENDING_ORDER_ACTION.BILL_OUT:
          goBillOut();
          break;
        case PENDING_ORDER_ACTION.COMPLETE:
          runOrderStatusAction(window.api.orders.orderComplete, t("tips.complete_successfully"));
          break;
        case PENDING_ORDER_ACTION.SERVE:
          runOrderStatusAction(window.api.orders.orderServe, t("tips.serve_successfully"));
          break;
        case PENDING_ORDER_ACTION.REFUND:
          setOrderRefundVisible(true);
          break;
        default:
          break;
      }
    },
    [goBillOut, runOrderStatusAction, showCancelOrderModal, t],
  );

  useEffect(() => {
    if (open === true) {
      fetchPendingOrders();
    }
  }, [open, fetchPendingOrders]);

  return (
    <>
      {messageContextHolder}
      {cancelOrderContextHolder}
      <OrderTrackModal
        open={orderTrackVisible}
        onClose={() => {
          setOrderTrackVisible(false);
          setOrderStatusList([]);
        }}
        historyList={orderStatusList}
      ></OrderTrackModal>
      <OrderRefundModal
        open={orderRefundVisible}
        onConfirm={confirmRefund}
        onCancel={() => {
          setOrderRefundVisible(false);
        }}
      />
      <Modal
        centered
        width={820}
        title={
          <div className="w-full relative min-h-[28px]">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-primary text-[18px]">{t("table_manage.new_order")}</span>
              {mainOrder && (
                <StatusTag paymentStatus={mainOrder.payment_status} orderStatus={mainOrder.order_status}></StatusTag>
              )}
            </div>
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-info-dark">
              <RollingNumber value={currentOrderIndex + 1} />
              {` / ${pendingOrders.length}`}
            </span>
          </div>
        }
        open={open}
        onCancel={handleClose}
        mask={{ blur: true, closable: false }}
        footer={
          <div className="flex justify-center gap-4">
            {pendingOrderActions.map((action) => (
              <Button
                key={action}
                size="large"
                color="primary"
                variant="outlined"
                onClick={() => onClickPendingAction(action)}
              >
                {getPendingActionText(action)}
              </Button>
            ))}
            <Button type="primary" size="large" disabled={!hasPrev} onClick={() => goNextPrev("prev")}>
              {t("components.prev")}
            </Button>
            <Button type="primary" size="large" disabled={!hasNext} onClick={() => goNextPrev("next")}>
              {t("components.next")}
            </Button>
          </div>
        }
      >
        <div className="h-[420px] overflow-y-auto">
          {currentOrder && (
            <div className="flex min-h-full border border-line">
              {/* order summary */}
              <div className="flex-1 p-4 border-r border-line">
                <div className="flex text-[13px] justify-between">
                  <span className="text-primary font-medium">{t("order.order_summary")}</span>
                  <span className="text-danger font-medium">{t("table_manage.edit_order")}</span>
                </div>
                {/* product list */}
                <AnimatedList className="py-3 w-full h-[280px] overflow-y-scroll">
                  {currentProductList.map((product) => (
                    <ProductListItem key={product.productKey} product={product}></ProductListItem>
                  ))}
                </AnimatedList>
                <div className="flex items-center">
                  <span className="flex-1 text-info-dark">{t("order.sub_total")}</span>
                  <RollingNumber
                    className="text-info-dark"
                    value={`${currency_symbol} ${format(currentOrder && currentOrder.sub_total_amount)}`}
                  ></RollingNumber>
                </div>
                <div className="flex items-center">
                  <span className="flex-1 text-info-dark">{t("order.service_fee")}</span>
                  <RollingNumber
                    className="text-info-dark"
                    value={`${currency_symbol} ${format(currentOrder.service_fee)}`}
                  ></RollingNumber>
                </div>
                <div className="flex items-center">
                  <span className="flex-1 text-primary">{`${t("components.total")}${t("order.incl_vat")}`}</span>
                  <RollingNumber
                    className="text-primary"
                    value={`${currency_symbol} ${format(currentOrder && currentOrder.total_amount)}`}
                  ></RollingNumber>
                </div>
              </div>
              {/* track order & remark */}
              <div className="flex-1 p-4">
                {/* order summary */}
                <div className="border border-line rounded-xl mb-2 h-[200px]">
                  <div className="flex w-full p-3 border-b border-line">
                    <span className="flex-1 font-medium text-[#4b5567]">{t("order.order_summary")}</span>
                    <span className="font-medium text-primary underline cursor-pointer" onClick={showOrderTrack}>
                      {t("table_manage.track_order")}
                    </span>
                  </div>
                  <AnimatedList className="p-3 flex flex-col gap-3">
                    {currentOrder.table_name && (
                      <div className="flex w-full">
                        <span className="flex-1 text-info-dark">{t("order.table_number")}:</span>
                        <span className="text-primary font-semibold">{currentOrder.table_name}</span>
                      </div>
                    )}
                    {(isQueueOrder || summaryNumber) && (
                      <div className="flex w-full">
                        <span className="flex-1 text-info-dark">
                          {t(isQueueOrder ? "order.pickup_number" : "table_manage.guest_number")}:
                        </span>
                        <span className="text-primary font-semibold">{summaryNumber || "-"}</span>
                      </div>
                    )}
                    <div className="flex w-full">
                      <span className="flex-1 text-info-dark">{t("order.service_type")}:</span>
                      <span className="text-primary font-semibold">{serviceTypeText ? t(serviceTypeText) : "-"}</span>
                    </div>
                    <div className="flex w-full">
                      <span className="flex-1 text-info-dark">{t("table_manage.process_type")}:</span>
                      <span className="text-primary font-semibold">{orderChannelText ? t(orderChannelText) : "-"}</span>
                    </div>
                  </AnimatedList>
                </div>
                {/* remark */}
                <div className="border border-line rounded-xl">
                  <div className="flex w-full p-3 border-b border-line">
                    <span className="flex-1 font-medium text-[#4b5567]">{t("table_manage.remark")}</span>
                  </div>
                  <div className="p-4">
                    {/* 订单备注为空或仅包含空格时统一显示占位符。 */}
                    <span className="break-words">{currentOrder.remark?.trim() || "-"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

const ProductListItem = ({ product }) => {
  const { currency_symbol } = useStore((state) => state.restaurantSetting);
  const { count, price } = product;
  const productName = product?.product_name ?? product?.name ?? "";
  const skuName = product?.sku_name ?? "";
  const displayName =
    Number(product?.variant) !== 2 && skuName && skuName !== productName ? `${productName}(${skuName})` : productName;
  // 与 Menu 页 Order Summary 保持一致，展示订单快照中已选择的全部加料名称。
  const optionItemNames = (product?.option_list ?? []).flatMap((option) =>
    (option?.option_item_list ?? [])
      .map((optionItem) => optionItem?.option_item_name ?? optionItem?.name)
      .filter(Boolean),
  );
  return (
    <div className="flex w-full my-2 items-center">
      <div className="flex flex-1 items-center">
        <div className="mr-3 flex h-[28px] min-w-[38px] items-center justify-center border border-line">
          <span>{count}</span>
        </div>
        <div className="min-w-0">
          <span className="block text-primary">{displayName}</span>
          {optionItemNames.length > 0 && (
            <span className="block text-[13px] text-[#afafaf]">{optionItemNames.join(",")}</span>
          )}
        </div>
      </div>
      <RollingNumber value={`${currency_symbol} ${format(Number(price ?? 0) * Number(count ?? 0))}`} />
    </div>
  );
};

PendingOrdersModal.propTypes = {
  open: PropTypes.bool,
  cancelModal: PropTypes.func,
  onOrderCanceled: PropTypes.func,
};

ProductListItem.propTypes = {
  product: PropTypes.object,
};

export default PendingOrdersModal;
