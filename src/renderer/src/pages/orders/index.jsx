import Header from "@renderer/components/Header";
import EmptyHolder from "@renderer/components/EmptyHolder";
import OrderTrackModal from "./components/Modals/OrderTrackModal";
import OrderRefundModal from "./components/Modals/OrderRefundModal";
import OrderCancelModal from "./components/Modals/OrderCancelModal";
import { Table, Select, Button, DatePicker, Input, message, Dropdown, Tag, Modal } from "antd";
import RollingNumber from "@renderer/components/RollingNumber";

import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";
import { format } from "@renderer/utils/MoneyUtils";
import { Fragment, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router";
import useStore from "@renderer/store";

import useRefreshOfflineOrders from "@renderer/hooks/useRefreshOfflineOrders";
import useGsapTableAnimation from "@renderer/hooks/useGsapTableAnimation";
import { orderStatusMap, serviceTypeMap } from "@renderer/map";
import CONSTANT from "@renderer/const";
import { ORDER_EDIT_ACTION, getOrderActionFlags, hasAuth } from "@renderer/utils/orderActionRules";

import { getOrderTypeLabel } from "@renderer/pages/table-manage/orderTypeOptions";
const { ORDER_STATUS, PAYMENT_STATUS, PAYMENT_MODE } = CONSTANT;
const ALL = 100;
const REFUND = 99;
const SEARCH_TYPE = {
  DATE_CREATED: 1,
  TABLE: 2,
};
const PAGENATOR_SIZE = 10;
const PWD_DISCOUNT_TYPES = [CONSTANT.DISCOUNT_TYPE.PWD, CONSTANT.DISCOUNT_TYPE.PWD_NUMBER];
const SC_DISCOUNT_TYPES = [CONSTANT.DISCOUNT_TYPE.SC, CONSTANT.DISCOUNT_TYPE.SC_NUMBER];

// 订单详情按在线端展示 PWD/SC、普通折扣和优惠券，需要兼容本地历史字符串格式。
const toAmount = (value) => Number(value ?? 0);

const getAmountWithFallback = (...values) => {
  const value = values.find((item) => item !== null && item !== undefined);
  return toAmount(value);
};

const normalizeOrderSearchRange = (dates, dateStrings) => {
  const [startDate, endDate] = dates ?? [];
  const [startText, endText] = dateStrings ?? [];

  // 线下订单列表按 create_time 精确到秒过滤，日期范围需要覆盖完整起止日。
  return {
    start_time: startDate ? startDate.startOf("day").format("YYYY-MM-DD HH:mm:ss") : startText || undefined,
    end_time: endDate ? endDate.endOf("day").format("YYYY-MM-DD HH:mm:ss") : endText || undefined,
  };
};

const getDiscountNos = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [value];
  } catch {
    return [value];
  }
};

const Orders = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const size = PAGENATOR_SIZE;
  const [messageApi, messageContextHolder] = message.useMessage();

  const productTableColumns = [
    {
      title: t("order.item_name"),
      dataIndex: "product_name",
      key: "product_name",
    },
    {
      title: t("order.option"),
      dataIndex: "option",
      key: "option",
      render: (optionList) => {
        // Addons 标签支持换行展示，并用 gap 保持标签之间的视觉间距。
        const optionTags = (JSON.parse(optionList) ?? []).flatMap((option) =>
          (option?.option_item_list ?? []).map((optionItem) => (
            <Tag
              className="m-0"
              variant="outlined"
              color="#003498"
              key={`${option.option_no ?? option.option_name}-${optionItem.option_item_no ?? optionItem.option_item_name ?? optionItem.name}`}
            >
              {`${option.option_name} - ${optionItem.option_item_name ?? optionItem.name} + ${format(optionItem.price)}`}
            </Tag>
          )),
        );

        return <div className="flex flex-wrap gap-1">{optionTags}</div>;
      },
    },
    {
      title: t("order.quantity"),
      dataIndex: "quantity",
      key: "quantity",
    },
    {
      title: t("order.price"),
      dataIndex: "price",
      key: "price",
      render: (text) => `${currency_symbol}${format(text)}`,
    },
    {
      title: t("order.sub_total"),
      dataIndex: "total_amount",
      key: "total_amount",
      render: (text) => `${currency_symbol}${format(text)}`,
    },
  ];
  const [orderListPage, setOrderListPage] = useState(1); // 分页查询orderlist的当前页码
  const [orderList, setOrderList] = useState([]); // orderlist列表
  const [orderListHasMore, setOrderListHasMore] = useState(false);
  const orderListLoadingRef = useRef(false); //列表正在更新的标志
  const [pendingFilterOrderListOptions, setPendingFilterOrderListOptions] = useState({
    search_type: SEARCH_TYPE.DATE_CREATED,
  }); // 待应用的过滤条件
  const [filterOrderListOptions, setFilterOrderListOptions] = useState({
    search_type: SEARCH_TYPE.DATE_CREATED,
  }); // 查询订单列表的过滤条件
  const [orderDetail, setOrderDetail] = useState({});
  const [orderTrackVisible, setOrderTrackVisible] = useState(false); // 展示order track弹窗
  const [orderStatusList, setOrderStatusList] = useState([]); // 订单状态数据。
  const [orderRefundVisible, setOrderRefundVisible] = useState(false); // 展示订单退款弹窗
  const [orderCancelVisible, setOrderCancelVisible] = useState(false); // 展示订单取消弹窗
  // View Digital Copy 弹窗状态，图片由主进程生成后直接展示。
  const [digitalCopyVisible, setDigitalCopyVisible] = useState(false);
  const [digitalCopyLoading, setDigitalCopyLoading] = useState(false);
  const [digitalCopyImage, setDigitalCopyImage] = useState("");
  // 对齐后端 preview_type：5 payment，4 refund。
  const [digitalCopyPreviewType, setDigitalCopyPreviewType] = useState(5);
  const productTableWrapperRef = useRef(null);
  const restaurantSetting = useStore((state) => state.restaurantSetting);
  const authList = useStore((state) => state.authList);
  const { currency_symbol, currency_unit } = restaurantSetting;
  const isBeforeMeal = restaurantSetting?.mode === PAYMENT_MODE.PAYMENT_BEFORE;
  const isPhilippines = !restaurantSetting?.country_name || restaurantSetting.country_name === "Philippines";
  const hasRefundAuth = hasAuth(authList, CONSTANT.AUTH_CODE.AUTH_CASHIER_REFUND);
  const selectedOrderInnerNo = orderDetail?.order_inner_no;
  const orderDetailItems = useMemo(() => orderDetail.items ?? [], [orderDetail.items]);
  const productTableAnimationKey = useMemo(() => {
    return orderDetailItems
      .map((item, index) => item.order_detail_id ?? item.sku_no ?? `${item.product_name}-${index}`)
      .join("|");
  }, [orderDetailItems]);

  // 订单详情菜品表格数据变化时，平滑过渡表格高度和行位置。
  useGsapTableAnimation(productTableWrapperRef, [selectedOrderInnerNo, productTableAnimationKey]);

  // 支付信息
  const paymentDetail = useMemo(() => {
    const { payment_info_list } = orderDetail;
    if (Array.isArray(payment_info_list)) {
      return payment_info_list.find((item) => item.transaction_status === 2) ?? {}; // 2是支付成功
    }
    return {};
  }, [orderDetail]);
  // 服务费为 0 时不展示整行，避免 React 将条件表达式里的 0 渲染成文本。
  const hasVisibleServiceFee = Number(orderDetail?.service_fee) > 0;
  const visibleDiscountAmount = toAmount(orderDetail?.discount_amount ?? paymentDetail?.discount_amount);
  const visibleCouponAmount = toAmount(orderDetail?.coupon_amount ?? paymentDetail?.coupon_amount);
  const visibleLessVat = toAmount(orderDetail?.tax_info?.less_vat);
  const visibleSurcharge = Number(paymentDetail?.surcharge ?? 0);
  // cashier/order/detail 的 amount 是页面应展示的最终金额，0 元支付也必须保留。
  const detailDisplayAmount = getAmountWithFallback(
    orderDetail?.amount,
    paymentDetail?.real_amount,
    orderDetail?.total_amount,
  );
  const detailSubTotalAmount = getAmountWithFallback(
    orderDetail?.sub_total_amount,
    paymentDetail?.amount,
    orderDetail?.total_amount,
  );

  // 按在线端 Offline Orders 的规则统一控制右下角按钮显隐。
  const orderButtonState = useMemo(() => {
    const { order_channel, order_app, payable = true } = orderDetail;

    const flags = getOrderActionFlags({
      order: {
        ...orderDetail,
        order_channel,
        order_app,
        payable,
      },
      isBeforeMeal,
      isPhilippines,
      hasRefundAuth,
    });

    return {
      ...flags,
    };
  }, [hasRefundAuth, isBeforeMeal, isPhilippines, orderDetail]);

  const editOrderItems = useMemo(() => {
    const items = [];
    if (orderButtonState.showTakeBtn) {
      items.push({
        key: ORDER_EDIT_ACTION.TAKE,
        label: <div className="h-[40px] leading-[40px] text-center">{t("components.take")}</div>,
      });
    }
    if (orderButtonState.showCancelBtn) {
      items.push({
        key: ORDER_EDIT_ACTION.CANCEL,
        label: <div className="h-[40px] leading-[40px] text-center">{t("components.cancel")}</div>,
      });
    }
    if (orderButtonState.showServeBtn) {
      items.push({
        key: ORDER_EDIT_ACTION.SERVE,
        label: <div className="h-[40px] leading-[40px] text-center">{t("order.serve")}</div>,
      });
    }
    if (orderButtonState.showCompleteBtn) {
      items.push({
        key: ORDER_EDIT_ACTION.COMPLETE,
        label: <div className="h-[40px] leading-[40px] text-center">{t("order.complete_order")}</div>,
      });
    }
    if (orderButtonState.showBillBtn) {
      items.push({
        key: ORDER_EDIT_ACTION.BILL_OUT,
        label: <div className="h-[40px] leading-[40px] text-center">{t("menu.bill_out")}</div>,
      });
    }

    return items;
  }, [
    orderButtonState.showBillBtn,
    orderButtonState.showCancelBtn,
    orderButtonState.showCompleteBtn,
    orderButtonState.showServeBtn,
    orderButtonState.showTakeBtn,
    t,
  ]);

  const buildOrderListParams = useCallback(
    (page) => {
      const { status, start_time, end_time, table_name } = filterOrderListOptions;
      const isRefundFilter = status === REFUND;
      return {
        page,
        size,
        // 退款是支付状态，不属于普通订单状态筛选。
        status: isRefundFilter ? undefined : status,
        refund_status: isRefundFilter || undefined,
        start_time,
        end_time,
        table_name,
      };
    },
    [filterOrderListOptions, size],
  );

  const handleOrderListRefreshed = useCallback(
    (nextOrderList) => {
      if (!selectedOrderInnerNo) {
        return;
      }

      const selectedOrderStillVisible = nextOrderList.some((order) => order.order_inner_no === selectedOrderInnerNo);
      if (!selectedOrderStillVisible) {
        // 刷新后当前订单不再属于可见筛选结果时，清空右侧详情，避免继续操作旧订单。
        setOrderDetail({});
      }
    },
    [selectedOrderInnerNo, setOrderDetail],
  );

  const refreshOrderList = useRefreshOfflineOrders({
    buildOrderListParams,
    onRefreshed: handleOrderListRefreshed,
    pageSize: size,
    setOrderList,
    setOrderListHasMore,
    setOrderListPage,
  });

  const updatePendingFilterOrderListOptions = useCallback(
    (updater) => {
      setPendingFilterOrderListOptions((prevOptions) => {
        const nextOptions = typeof updater === "function" ? updater(prevOptions) : updater;
        return nextOptions;
      });
    },
    [setPendingFilterOrderListOptions],
  );

  const applyFilterOrderListOptions = useCallback(() => {
    setFilterOrderListOptions(pendingFilterOrderListOptions);
    setOrderListPage(1);
  }, [pendingFilterOrderListOptions, setFilterOrderListOptions, setOrderListPage]);

  const onSelectOrderStatus = useCallback(
    (status) => {
      updatePendingFilterOrderListOptions((prevOptions) => ({
        ...prevOptions,
        status: status === ALL ? undefined : status,
      }));
    },
    [updatePendingFilterOrderListOptions],
  );

  const onSearchOrderList = useCallback(
    (searchOptions) => {
      // 右上角筛选控件没有独立搜索按钮，变更后直接应用到订单列表查询。
      const nextOptions = {
        ...pendingFilterOrderListOptions,
        ...searchOptions,
      };
      setPendingFilterOrderListOptions(nextOptions);
      setFilterOrderListOptions(nextOptions);
      setOrderListPage(1);
    },
    [pendingFilterOrderListOptions, setFilterOrderListOptions, setOrderListPage, setPendingFilterOrderListOptions],
  );

  const getOrderList = useCallback(() => {
    const params = buildOrderListParams(orderListPage);
    return window.api.orders.getOrderList(params);
  }, [buildOrderListParams, orderListPage]);

  //更新当前订单列表

  useEffect(() => {
    orderListLoadingRef.current = true;

    getOrderList()
      .then(({ list, hasMore }) => {
        console.log(list, "Order List");
        setOrderList((prevList) => (orderListPage === 1 ? list : [...prevList, ...list]));
        setOrderListHasMore(hasMore);
      })
      .finally(() => {
        orderListLoadingRef.current = false;
      });
  }, [getOrderList, orderListPage]);

  const onOrderListScroll = (event) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const isScrollBottom = scrollTop + clientHeight >= scrollHeight - 4;

    if (isScrollBottom && orderListHasMore && !orderListLoadingRef.current) {
      setOrderListPage((prevPage) => prevPage + 1);
    }
  };
  // 通过order inner no获取订单详情
  const fetchOrderDetailByInnerNo = useCallback(
    (order_inner_no) => {
      return window.api.orders.getOrderDetailByInnerNo(order_inner_no).then((res) => {
        console.log(res, "Order Detail");
        setOrderDetail(res);
        return res;
      });
    },
    [setOrderDetail],
  );

  const refreshChangedOrder = useCallback(
    async (orderInnerNo) => {
      const nextOrderList = await refreshOrderList();
      const selectedOrderStillVisible = nextOrderList.some((order) => order.order_inner_no === orderInnerNo);

      if (selectedOrderStillVisible) {
        await fetchOrderDetailByInnerNo(orderInnerNo);
      }
    },
    [fetchOrderDetailByInnerNo, refreshOrderList],
  );

  // 打开订单追踪弹窗并查询相关数据
  const showOrderTrack = (orderDetail) => {
    const { order_inner_no } = orderDetail;
    window.api.orders.getOrderHistory(order_inner_no).then((res) => {
      console.log(res, "order status list");
      setOrderStatusList(res);
      setOrderTrackVisible(true);
    });
  };

  // 请求主进程生成 Digital Copy 图片，并打开预览弹窗。
  const showDigitalCopy = (previewType = 5) => {
    if (!orderDetail?.order_inner_no) {
      return;
    }

    setDigitalCopyLoading(true);
    setDigitalCopyPreviewType(previewType);
    // View Digital Copy 对应后端 /order-print/preview 的支付小票预览类型。
    window.api.orders
      .viewDigitalCopy({
        order_inner_no: orderDetail.order_inner_no,
        preview_type: previewType,
        is_download: false,
      })
      .then((imageData) => {
        setDigitalCopyImage(imageData);
        setDigitalCopyVisible(true);
      })
      .catch((error) => {
        messageApi.error(error?.message ?? "Failed to preview receipt.");
      })
      .finally(() => {
        setDigitalCopyLoading(false);
      });
  };
  // 退款弹窗的确认退款
  const confirmRefund = (remark) => {
    const { order_inner_no } = orderDetail;
    window.api.orders
      .orderRefund({ refund_remark: remark, order_inner_no })
      .then(() => {
        messageApi.success(t("tips.refund_successfully"));
        setOrderRefundVisible(false);
        return refreshChangedOrder(order_inner_no);
      })
      .catch((error) => {
        messageApi.error(error?.message);
      });
  };

  // 取消弹窗确认取消
  const confirmCancelOrder = (remark) => {
    const { order_inner_no } = orderDetail;
    window.api.orders
      .orderCancel({ cancel_remark: remark, order_inner_no })
      .then(() => {
        messageApi.success(t("tips.cancel_order_successfully"));
        setOrderCancelVisible(false);
        return refreshChangedOrder(order_inner_no);
      })
      .catch((error) => {
        messageApi.error(error?.message);
      });
  };

  const runLocalOrderAction = useCallback(
    (actionPromise, successMessage) => {
      const orderInnerNo = selectedOrderInnerNo;
      if (!orderInnerNo) {
        return;
      }

      actionPromise({ order_inner_no: orderInnerNo })
        .then(() => {
          messageApi.success(successMessage);
          return refreshChangedOrder(orderInnerNo);
        })
        .catch((error) => {
          messageApi.error(error?.message);
        });
    },
    [messageApi, refreshChangedOrder, selectedOrderInnerNo],
  );

  const onClickEditOrder = ({ key }) => {
    switch (key) {
      case ORDER_EDIT_ACTION.TAKE:
        runLocalOrderAction(window.api.orders.orderTake, t("tips.take_successfully"));
        break;
      case ORDER_EDIT_ACTION.CANCEL:
        setOrderCancelVisible(true);
        break;
      case ORDER_EDIT_ACTION.SERVE:
        runLocalOrderAction(window.api.orders.orderServe, t("tips.serve_successfully"));
        break;
      case ORDER_EDIT_ACTION.COMPLETE:
        runLocalOrderAction(window.api.orders.orderComplete, t("tips.complete_successfully"));
        break;
      case ORDER_EDIT_ACTION.BILL_OUT:
        navigate("/bill-out", {
          state: {
            orderInnerNo: orderDetail?.order_inner_no ?? "",
          },
        });
        break;
      default:
        break;
    }
  };

  return (
    <div>
      {messageContextHolder}
      {/* Modals */}
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
        onConfirm={(remark) => {
          confirmRefund(remark);
        }}
        onCancel={() => {
          setOrderRefundVisible(false);
        }}
      ></OrderRefundModal>
      <OrderCancelModal
        open={orderCancelVisible}
        onConfirm={(remark) => {
          confirmCancelOrder(remark);
        }}
        onCancel={() => {
          setOrderCancelVisible(false);
        }}
      ></OrderCancelModal>
      <Modal
        title={t("order.payment_receipt")}
        open={digitalCopyVisible}
        footer={null}
        width={420}
        centered
        destroyOnHidden
        onCancel={() => {
          setDigitalCopyVisible(false);
          setDigitalCopyImage("");
        }}
      >
        {orderDetail?.payment_status === PAYMENT_STATUS.REFUNDED && (
          <>
            {/* 退款订单和在线 Web 一样支持切换支付小票/退款小票预览。 */}
            <Select
              className="mb-3 w-full"
              value={digitalCopyPreviewType}
              loading={digitalCopyLoading}
              options={[
                { label: t("order.payment_receipt"), value: 5 },
                { label: t("order.refund"), value: 4 },
              ]}
              onChange={(value) => showDigitalCopy(value)}
            />
          </>
        )}
        {digitalCopyImage && <img src={digitalCopyImage} alt={t("order.payment_receipt")} className="w-full" />}
      </Modal>
      <Header
        currentTitle={t("menu.offline_orders")}
        leftSlot={
          <OrderStatusSelector onSelectCallback={onSelectOrderStatus} onRefreshCallback={applyFilterOrderListOptions} />
        }
        rightSlot={<OrderSearch onSearchCallback={onSearchOrderList} />}
      ></Header>
      <div className="flex h-[calc(100vh-64px)]">
        {/* 订单列表 */}
        <div className="w-[358px] h-full min-h-0 overflow-y-auto border-r border-line" onScroll={onOrderListScroll}>
          {orderList.map((order) => (
            <div key={order.order_inner_no}>
              <OrderPreviewItem
                order={order}
                onClick={() => {
                  fetchOrderDetailByInnerNo(order.order_inner_no);
                }}
              />
            </div>
          ))}
        </div>
        {/* 订单详情 */}
        <div className="flex-1 h-full min-h-0 overflow-y-auto p-3">
          {JSON.stringify(orderDetail) !== "{}" ? (
            <div>
              {/* 总计& 交易费 & VAT */}
              <div className="flex mt-3">
                <div className="pr-[20px] mr-[20px] border-r border-line">
                  <p className="text-[12px] text-normal m-0!">{t("order.total_amount")}</p>
                  <span className="text-primary text-[24px] font-semibold">
                    {currency_unit}{" "}
                    <RollingNumber
                      className="text-primary text-[24px] font-semibold"
                      value={`${format(detailDisplayAmount)}`}
                    ></RollingNumber>
                  </span>
                </div>
                <div className="pr-[20px] mr-[20px] border-r border-line">
                  <p className="text-[12px] text-normal m-0!">{t("order.transaction_fee")}</p>
                  <span className="text-primary text-[24px] font-semibold">
                    {currency_unit}{" "}
                    <RollingNumber
                      className="text-primary text-[24px] font-semibold"
                      value={`${format(orderDetail?.fee)}`}
                    ></RollingNumber>
                  </span>
                </div>
                <div className="pr-[20px] mr-[20px] border-r border-line">
                  <p className="text-[12px] text-normal m-0!">{t("order.vat")}</p>
                  <span className="text-primary text-[24px] font-semibold">
                    {currency_unit}{" "}
                    <RollingNumber
                      className="text-primary text-[24px] font-semibold"
                      value={`${format(orderDetail?.tax_info?.tax_amount ?? 0)}`}
                    ></RollingNumber>
                  </span>
                </div>
              </div>

              {/* 商品表格 */}
              <div ref={productTableWrapperRef} className="mt-6">
                <Table
                  className="custom-table-header"
                  columns={productTableColumns}
                  dataSource={orderDetailItems}
                  pagination={false}
                  rowKey={(row, index) => row.order_detail_id ?? row.sku_no ?? `${row.product_name}-${index}`}
                ></Table>
              </div>

              {/* total amount & other info  */}
              <div className="w-full py-4 border-b border-line">
                {/* sub total */}
                <div className="flex text-primary text-[17px] mb-[10px]">
                  <span className="flex-1 font-semibold">{t("order.sub_total")}</span>
                  <span className="font-semibold">
                    {currency_unit}{" "}
                    <RollingNumber className="font-semibold" value={`${format(detailSubTotalAmount)}`}></RollingNumber>
                  </span>
                </div>
                {/* service fee */}
                {hasVisibleServiceFee && (
                  <div className="flex text-normal text-[17px] mb-[10px]">
                    <span className="flex-1 font-semibold">{t("order.service_fee")}</span>
                    <span className="font-semibold">
                      {currency_unit}{" "}
                      <RollingNumber
                        className="font-semibold"
                        value={`${format(orderDetail?.service_fee)}`}
                      ></RollingNumber>
                    </span>
                  </div>
                )}
                {visibleDiscountAmount > 0 && !orderDetail?.coupon_code && (
                  <div className="flex text-danger text-[17px] mb-[10px]">
                    <span className="flex-1 font-semibold">{t("order.discount_amount")}</span>
                    <span className="font-semibold">
                      {currency_unit} -
                      <RollingNumber className="font-semibold" value={`${format(visibleDiscountAmount)}`} />
                    </span>
                  </div>
                )}
                {visibleCouponAmount > 0 && (
                  <div className="flex text-danger text-[17px] mb-[10px]">
                    <span className="flex-1 font-semibold">{t("order.voucher")}</span>
                    <span className="font-semibold">
                      {currency_unit} -
                      <RollingNumber className="font-semibold" value={`${format(visibleCouponAmount)}`} />
                    </span>
                  </div>
                )}
                {visibleLessVat > 0 && (
                  <div className="flex text-danger text-[17px] mb-[10px]">
                    <span className="flex-1 font-semibold">{t("order.less_vat")}</span>
                    <span className="font-semibold">
                      {currency_unit} -<RollingNumber className="font-semibold" value={`${format(visibleLessVat)}`} />
                    </span>
                  </div>
                )}
                {visibleSurcharge > 0 && (
                  <div className="flex text-normal text-[17px] mb-[10px]">
                    <span className="flex-1 font-semibold">{t("table_manage.surcharge")}</span>
                    <span className="font-semibold">
                      {currency_unit} <RollingNumber className="font-semibold" value={`${format(visibleSurcharge)}`} />
                    </span>
                  </div>
                )}
                {/* total amount */}
                <div className="flex text-normal text-[17px]">
                  <span className="flex-1 font-semibold">{t("order.total_amount")}</span>
                  <span className="font-semibold">
                    {currency_unit}{" "}
                    <RollingNumber className="font-semibold" value={`${format(detailDisplayAmount)}`}></RollingNumber>
                  </span>
                </div>
              </div>
              <div className="w-full">
                <p className="my-3! text-normal text-[16px] font-semibold">{t("order.other_info")}</p>
                <OrderDetailOtherInfo
                  orderDetail={orderDetail}
                  isPhilippines={isPhilippines}
                  showOrderTrack={() => showOrderTrack(orderDetail)}
                  className="mb-10"
                />
              </div>
            </div>
          ) : (
            <EmptyHolder></EmptyHolder>
          )}
        </div>
      </div>
      {JSON.stringify(orderDetail) !== "{}" && (
        <div className="fixed right-6 bottom-6 z-20 flex flex-col gap-2">
          {orderButtonState.showEditBtn && editOrderItems.length > 0 && (
            <Dropdown
              trigger={["click"]}
              placement="top"
              menu={{
                items: editOrderItems,
                onClick: onClickEditOrder,
              }}
            >
              <Button
                variant="outlined"
                color="primary"
                className="w-[160px] h-[52px]! rounded-lg border border-primary bg-white text-primary text-[12px] cursor-pointer"
              >
                <span className="font-semibold">{t("table_manage.edit_order")}</span>
              </Button>
            </Dropdown>
          )}
          {orderButtonState.showEjournalBtn && (
            <Button
              variant="outlined"
              color="primary"
              loading={digitalCopyLoading}
              onClick={() => showDigitalCopy()}
              className="w-[160px] h-[52px]! rounded-lg border border-primary bg-white text-primary text-[12px] cursor-pointer"
            >
              <span className="font-semibold">{t("order.view_digital_copy")}</span>
            </Button>
          )}
          {orderButtonState.showRefundBtn && (
            <Button
              variant="outlined"
              color="primary"
              className="w-[160px] h-[52px]! rounded-lg border border-primary bg-white text-primary text-[12px] cursor-pointer"
              onClick={() => {
                setOrderRefundVisible(true);
              }}
              onCancel={() => {
                setOrderRefundVisible(false);
              }}
            >
              <span className="font-semibold">{t("order.refund")}</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// header 左边的 订单状态选择组件
const OrderStatusSelector = ({ onSelectCallback, onRefreshCallback }) => {
  const { t } = useTranslation();
  const orderTypes = [
    {
      label: t("components.all"),
      value: ALL,
    },
    {
      label: t("order.pending"),
      value: ORDER_STATUS.PENDING,
    },
    {
      label: t("order.taken"),
      value: ORDER_STATUS.TAKEN,
    },
    {
      label: t("order.ready_takeout"),
      value: ORDER_STATUS.WAITING_PICK_UP,
    },
    {
      label: t("order.complete"),
      value: ORDER_STATUS.COMPLETE,
    },
    {
      label: t("order.cancel"),
      value: ORDER_STATUS.CANCEL,
    },
    {
      label: t("order.refund"),
      value: REFUND,
    },
  ];
  return (
    <>
      <Select
        style={{ width: 200 }}
        defaultValue={ALL}
        options={orderTypes}
        onChange={onSelectCallback}
        className="mr-2!"
      ></Select>
      <Button type="primary" size="medium" onClick={onRefreshCallback}>
        {t("components.refresh")}
      </Button>
    </>
  );
};

//header 右边的 时间选择或按桌号搜索组件
const OrderSearch = ({ onSearchCallback }) => {
  const { RangePicker } = DatePicker;
  const { t } = useTranslation();
  const [searchType, setSearchType] = useState(SEARCH_TYPE.DATE_CREATED);
  const searchTypeOpt = [
    {
      label: t("order.date_create"),
      value: SEARCH_TYPE.DATE_CREATED,
    },
    {
      label: t("order.table"),
      value: SEARCH_TYPE.TABLE,
    },
  ];
  return (
    <>
      <Select
        style={{ width: 160 }}
        options={searchTypeOpt}
        className="mr-2! text-left"
        defaultValue={searchType}
        onChange={(value) => {
          setSearchType(value);
          if (value === SEARCH_TYPE.DATE_CREATED) {
            onSearchCallback?.({
              search_type: value,
              start_time: undefined,
              end_time: undefined,
              table_name: undefined,
            });
            return;
          }

          onSearchCallback?.({
            search_type: value,
            start_time: undefined,
            end_time: undefined,
            table_name: undefined,
          });
        }}
      ></Select>
      {searchType === SEARCH_TYPE.DATE_CREATED ? (
        <RangePicker
          style={{ width: "280px" }}
          placeholder={[t("components.start_date"), t("components.end_date")]}
          onChange={(dates, dateStrings) => {
            const { start_time, end_time } = normalizeOrderSearchRange(dates, dateStrings);
            onSearchCallback?.({
              search_type: searchType,
              start_time,
              end_time,
              table_name: undefined,
            });
          }}
        />
      ) : (
        <Input
          style={{ width: "280px" }}
          placeholder={t("tips.enter_table_name")}
          onChange={(event) => {
            const tableName = event.target.value.trim();
            onSearchCallback?.({
              search_type: searchType,
              table_name: tableName || undefined,
              start_time: undefined,
              end_time: undefined,
            });
          }}
        />
      )}
    </>
  );
};

const OrderPreviewItem = ({ order, onClick }) => {
  const {
    table_name,
    table_id,
    order_inner_no,
    create_time,
    amount,
    total_amount,
    order_no,
    order_channel,
    take_food_no,
    order_app,
  } = order;
  const { t } = useTranslation();
  const { currency_symbol } = useStore((state) => state.restaurantSetting);
  // 左侧卡片标题按点餐渠道展示：排队点餐看取餐号，桌码点餐看桌名。
  // 手工录单用订单来源特征展示，避免依赖 table_id=0 这类本地占位值。

  const isManualOrder = order_app === CONSTANT.ORDER_APP.MANUAL_ORDER;
  const isWaitOrder = order_channel === CONSTANT.ORDER_CHANNEL.WAIT;
  const isTableOrder = order_channel === CONSTANT.ORDER_CHANNEL.TABLE;
  const titleLabel = isManualOrder
    ? t("table_manage.manual_order")
    : isWaitOrder
      ? t("order.order_no")
      : isTableOrder
        ? t("order.table")
        : t("order.order_no");
  const titleValue = (() => {
    if (isManualOrder) {
      return null;
    }
    if (isWaitOrder) {
      return take_food_no || "-";
    }
    if (isTableOrder) {
      return table_name || table_id || "-";
    }
    return order_no;
  })();
  // 卡片金额与右侧 Total Amount 同口径，优先使用最终成功支付单的实付金额。
  const displayAmount = getAmountWithFallback(amount, total_amount);

  // 订单卡片状态 tag 默认只展示订单履约状态，仅已退款展示 Refunded。
  const getStatusTag = (order) => {
    if (order.payment_status === PAYMENT_STATUS.REFUNDED) {
      return orderStatusMap.get(`P${PAYMENT_STATUS.REFUNDED}`);
    }

    return orderStatusMap.get(`O${order.order_status}`) || orderStatusMap.get(`O${CONSTANT.ORDER_STATUS.PENDING}`);
  };
  const orderStatusTag = getStatusTag(order);
  return (
    <div className="w-full h-[172px] border-b border-line cursor-pointer" onClick={onClick}>
      <div className="py-2 px-4 flex justify-between items-center border-b border-line">
        <span className="text-normal text-[13px] font-semibold">
          {titleLabel}
          {titleValue ? <span className="text-primary font-semibold"> {titleValue}</span> : null}
        </span>

        <div className="h-6 px-2.5 rounded-2xl" style={{ backgroundColor: orderStatusTag.themeColor }}>
          <span className="text-[10px] font-medium" style={{ color: orderStatusTag.textColor }}>
            {t(`${orderStatusTag.text}`)}
          </span>
        </div>
      </div>

      <div className="flex flex-col w-full h-[calc(100%-49px)] p-4">
        <div className="flex-1 text-[13px]">
          <p className="m-0! font-medium text-normal">{order_inner_no}</p>
          <p className="m-0! font-medium text-[#afafaf]">{create_time}</p>
        </div>
        <div className="text-right">
          <span className="text-primary text-[17px] font-semibold">{`${currency_symbol}${format(displayAmount)}`}</span>
        </div>
      </div>
    </div>
  );
};

const OrderDetailOtherInfo = ({ isPhilippines, orderDetail, showOrderTrack }) => {
  const { t } = useTranslation();
  const {
    order_channel,
    order_status,
    payment_status,
    create_time,
    complete_time,
    order_inner_no,
    order_serial_number,
    payment_info_list,
    table_name,
    table_id,
    take_food_no,
    customer_dining_style,
    customer_num,
    device_no,
    coupon_snapshot_list,
    coupon_name,
    coupon_batch_no,
    coupon_code,
    discount_nos,
    discount_number,
    discount_type,
    discount_validity_period,
    discounter_name,
    discounter_serial_no,
    real_amount,
    user_email,
    user_name,
    user_no,
    user_phone,
    cancel_remark,
    remark,
    refund_serial_no,
    refund_transaction_id,
    refund_time,
    refund_remark,
  } = orderDetail;
  const paymentInfo = Array.isArray(payment_info_list)
    ? payment_info_list.find(
        (item) => item.transaction_status === 2, // 2是支付完成
      )
    : null;
  // 已退款订单从独立退款支付行展示退款流水，普通订单不显示退款字段。
  const refundPayment = Array.isArray(payment_info_list)
    ? payment_info_list.find((item) => item.transaction_status === PAYMENT_STATUS.REFUNDED)
    : null;
  const isRefunded = payment_status === PAYMENT_STATUS.REFUNDED || Boolean(refundPayment);
  // 主进程已将 system_transaction_no 规范化为数组，按每个系统交易号单独展示。
  const transactionIds = Array.isArray(paymentInfo?.transaction_id) ? paymentInfo.transaction_id : [];
  // 对齐在线端订单详情：折扣类型从顶层详情字段展示，缺失时兼容支付单字段。
  const activeDiscountType = discount_type ?? paymentInfo?.discount_type;
  const activeDiscountNumber = discount_number ?? paymentInfo?.discount_number;
  const discountNos = getDiscountNos(discount_nos ?? paymentInfo?.discount_no);
  // 支付渠道名称由主进程按 payment_channel 表映射，失败时保留 code 便于排查数据问题。
  const paymentChannelText = paymentInfo?.payment_channel_name || paymentInfo?.channel_code || "-";
  const refundChannelText = refundPayment?.payment_channel_name || refundPayment?.channel_code || "-";
  const refundInfoItems = [
    { label: `${t("order.refund")} #`, value: refundPayment?.refund_serial_no || refund_serial_no || "-" },
    {
      label: t("order.refund_transaction_id"),
      value: refundPayment?.channel_transaction_id || refund_transaction_id || "-",
    },
    { label: t("order.refund_channel"), value: refundChannelText },
    { label: t("order.refund_time"), value: refundPayment?.transaction_return_time || refund_time || "-" },
  ];
  const firstDiscountNo = discountNos[0] || "-";
  const isPwdDiscount = PWD_DISCOUNT_TYPES.includes(activeDiscountType);
  const isScDiscount = SC_DISCOUNT_TYPES.includes(activeDiscountType);
  const discountNumberText =
    activeDiscountNumber &&
    [CONSTANT.DISCOUNT_TYPE.PWD_NUMBER, CONSTANT.DISCOUNT_TYPE.SC_NUMBER].includes(activeDiscountType)
      ? `(${activeDiscountNumber})`
      : "";

  const getDiscountTypeText = () => {
    if (isPwdDiscount) return t("order.pwd");
    if (isScDiscount) return t("order.sc");
    if (activeDiscountType === CONSTANT.DISCOUNT_TYPE.CUSTOM) return t("order.custom");
    return "-";
  };
  const customerName = user_name || user_phone || user_email;
  const couponSnapshotList = Array.isArray(coupon_snapshot_list) ? coupon_snapshot_list : [];
  const voucherInfoList =
    couponSnapshotList.length > 0
      ? couponSnapshotList
      : coupon_name || coupon_batch_no || coupon_code
        ? [
            {
              coupon_name,
              coupon_batch_no,
              coupon_code,
              user_no,
              user_name: customerName,
            },
          ]
        : [];
  const snapshotCustomer = voucherInfoList.find((item) => item?.user_no || item?.user_name);
  // 顾客信息只属于优惠券详情，避免把排队点餐用于接口身份的收银员 user_no 展示成 Customer ID。
  const displayCustomerNo = voucherInfoList.length > 0 ? snapshotCustomer?.user_no || user_no : "";
  const displayCustomerName = voucherInfoList.length > 0 ? snapshotCustomer?.user_name || customerName : "";
  // 在线 Web 订单详情统一通过 orderTypeMap 展示 order_channel，手工录单也走同一数据源。
  const orderChannelText = getOrderTypeLabel(order_channel, t);
  const isQueueOrder = order_channel === CONSTANT.ORDER_CHANNEL.WAIT;
  const serviceTypeKey = serviceTypeMap.get(customer_dining_style)?.text;
  const serviceTypeText = serviceTypeKey ? t(serviceTypeKey) : "-";

  return (
    <div className={`pb-16`}>
      {/* 订单渠道 */}
      <div className={`text-[11px] mb-2`}>
        <span className="inline-block text-primary font-semibold w-[180px]">{t("order.order_type")}</span>
        <span className="text-normal font-semibold">{orderChannelText}</span>
      </div>
      {/* 创建时间 */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("order.create_time")}</span>
        <span className="text-normal font-semibold">{create_time}</span>
      </div>
      {/* 完成时间 */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("order.complete_time")}</span>
        <span className="text-normal font-semibold">{complete_time || "-"}</span>
      </div>
      {/* 商户订单id */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("order.merchant_order_id")}</span>
        <span className="text-normal font-semibold">{order_inner_no || "-"}</span>
      </div>
      {/* 序列号 */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("order.order_number")}</span>
        <span className="text-normal font-semibold">{order_serial_number || "-"}</span>
      </div>
      {/* POS# */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("order.pos_number")}</span>
        <span className="text-normal font-semibold">{device_no || "-"}</span>
      </div>
      {/* SI */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("order.si_number")}</span>
        <span className="text-normal font-semibold">{paymentInfo?.receipt_no || "-"}</span>
      </div>
      {/* Transaction ID */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("order.transaction_id")}</span>
        {transactionIds.length > 0 ? (
          <span className="inline-flex flex-col align-top text-normal font-semibold">
            {transactionIds.map((transactionId, index) => (
              <span className="font-semibold" key={`${transactionId}-${index}`}>
                {transactionId}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-normal font-semibold">-</span>
        )}
      </div>
      {/* Payment Channel */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("order.payment_channel")}</span>
        <span className="text-normal font-semibold">{paymentChannelText}</span>
      </div>
      {/* Payment time */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("order.payment_time")}</span>
        <span className="text-normal font-semibold">{paymentInfo?.transaction_return_time || "-"}</span>
      </div>
      {isRefunded &&
        refundInfoItems.map((item) => (
          <div className="text-[11px] mb-2" key={item.label}>
            <span className="inline-block text-primary font-semibold w-[180px]">{item.label}</span>
            <span className="text-normal font-semibold">{item.value}</span>
          </div>
        ))}
      {/* Discount Type */}
      {isPhilippines && (
        <>
          <div className="text-[11px] mb-2">
            <span className="inline-block text-primary font-semibold w-[180px]">{t("order.discount_type")}</span>
            <span className="text-normal font-semibold">
              {getDiscountTypeText()}
              {discountNumberText}
            </span>
          </div>
          {isPwdDiscount && (
            <>
              <div className="text-[11px] mb-2">
                <span className="inline-block text-primary font-semibold w-[180px]">{t("order.pwd_name")}</span>
                <span className="text-normal font-semibold">
                  {discounter_name || paymentInfo?.discounter_name || "-"}
                </span>
              </div>
              <div className="text-[11px] mb-2">
                <span className="inline-block text-primary font-semibold w-[180px]">{t("order.valid_date")}</span>
                <span className="text-normal font-semibold">
                  {discount_validity_period || paymentInfo?.discount_validity_period || "-"}
                </span>
              </div>
              <div className="text-[11px] mb-2">
                <span className="inline-block text-primary font-semibold w-[180px]">{t("order.pwd_id")}</span>
                <span className="text-normal font-semibold">{firstDiscountNo}</span>
              </div>
              <div className="text-[11px] mb-2">
                <span className="inline-block text-primary font-semibold w-[180px]">{t("order.pwd_order_id")}</span>
                <span className="text-normal font-semibold">
                  {discounter_serial_no || paymentInfo?.discount_serial_no || "-"}
                </span>
              </div>
            </>
          )}
          {isScDiscount && (
            <>
              <div className="text-[11px] mb-2">
                <span className="inline-block text-primary font-semibold w-[180px]">{t("order.sc_name")}</span>
                <span className="text-normal font-semibold">
                  {discounter_name || paymentInfo?.discounter_name || "-"}
                </span>
              </div>
              <div className="text-[11px] mb-2">
                <span className="inline-block text-primary font-semibold w-[180px]">{t("order.sc_id")}</span>
                <span className="text-normal font-semibold">{firstDiscountNo}</span>
              </div>
              <div className="text-[11px] mb-2">
                <span className="inline-block text-primary font-semibold w-[180px]">{t("order.sc_order_id")}</span>
                <span className="text-normal font-semibold">
                  {discounter_serial_no || paymentInfo?.discount_serial_no || "-"}
                </span>
              </div>
            </>
          )}
        </>
      )}
      {/* 排队点餐没有桌台，改为展示就餐方式和支付后生成的取餐号。 */}
      {isQueueOrder ? (
        <>
          <div className="text-[11px] mb-2">
            <span className="inline-block text-primary font-semibold w-[180px]">{t("order.service_type")}</span>
            <span className="text-normal font-semibold">{serviceTypeText}</span>
          </div>
          <div className="text-[11px] mb-2">
            <span className="inline-block text-primary font-semibold w-[180px]">{t("order.order_no")}</span>
            <span className="text-normal font-semibold">{take_food_no || "-"}</span>
          </div>
        </>
      ) : (
        <div className="text-[11px] mb-2">
          <span className="inline-block text-primary font-semibold w-[180px]">{t("order.table_name")}</span>
          <span className="text-normal font-semibold">{table_name || table_id || "-"}</span>
        </div>
      )}
      {/* 顾客数量 */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("table_manage.guest_number")}</span>
        <span className="text-normal font-semibold">{customer_num || "-"}</span>
      </div>
      {/* 已取消订单展示取消时填写的备注。 */}
      {order_status === ORDER_STATUS.CANCEL && (
        <div className="text-[11px] mb-2">
          <span className="inline-block text-primary font-semibold w-[180px]">{t("order.cancel_order_note")}</span>
          <span className="text-normal font-semibold">{cancel_remark || "-"}</span>
        </div>
      )}
      {/* 支付金额 */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("order.payment_amount")}</span>
        <span className="text-normal font-semibold">
          {real_amount != null || paymentInfo?.real_amount != null
            ? format(real_amount ?? paymentInfo.real_amount)
            : "-"}
        </span>
      </div>
      {/* 订单记录 */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("components.operator")}</span>
        <span className="text-primary font-semibold underline cursor-pointer" onClick={() => showOrderTrack()}>
          {t("table_manage.track_order")}
        </span>
      </div>
      {/* 点餐备注固定展示在 Operator 下方，无备注时使用占位符。 */}
      <div className="text-[11px] mb-2">
        <span className="inline-block text-primary font-semibold w-[180px]">{t("order.special_instructions")}</span>
        <span className="text-normal font-semibold break-words">{remark?.trim() || "-"}</span>
      </div>
      {/* 优惠券快照来自支付成功后的服务端详情，展示位置对齐在线 Web 订单详情。 */}
      {voucherInfoList.map((couponInfo, index) => (
        <Fragment key={`${couponInfo?.coupon_code || couponInfo?.coupon_batch_no || "voucher"}-${index}`}>
          {couponInfo?.coupon_name && (
            <div className="text-[11px] mb-2">
              <span className="inline-block text-primary font-semibold w-[180px]">{t("order.voucher_name")}</span>
              <span className="text-normal font-semibold">{couponInfo.coupon_name}</span>
            </div>
          )}
          {couponInfo?.coupon_batch_no && (
            <div className="text-[11px] mb-2">
              <span className="inline-block text-primary font-semibold w-[180px]">{t("order.voucher_id")}</span>
              <span className="text-normal font-semibold">{couponInfo.coupon_batch_no}</span>
            </div>
          )}
          {couponInfo?.coupon_code && (
            <div className="text-[11px] mb-2">
              <span className="inline-block text-primary font-semibold w-[180px]">{t("order.voucher_ticket_no")}</span>
              <span className="text-normal font-semibold">{couponInfo.coupon_code}</span>
            </div>
          )}
        </Fragment>
      ))}
      {displayCustomerNo && (
        <div className="text-[11px] mb-2">
          <span className="inline-block text-primary font-semibold w-[180px]">{t("order.customer_id")}</span>
          <span className="text-normal font-semibold">{displayCustomerNo}</span>
        </div>
      )}
      {displayCustomerName && (
        <div className="text-[11px] mb-2">
          <span className="inline-block text-primary font-semibold w-[180px]">{t("order.customer_name")}</span>
          <span className="text-normal font-semibold">{displayCustomerName}</span>
        </div>
      )}
      {isRefunded && (
        <div className="text-[11px] mb-2">
          <span className="inline-block text-primary font-semibold w-[180px]">{t("order.refund_remark")}</span>
          <span className="text-normal font-semibold">{refundPayment?.refund_remark || refund_remark || "-"}</span>
        </div>
      )}
    </div>
  );
};

OrderPreviewItem.propTypes = {
  order: PropTypes.object,
  onClick: PropTypes.func,
};
OrderDetailOtherInfo.propTypes = {
  isPhilippines: PropTypes.bool,
  orderDetail: PropTypes.object,
  showOrderTrack: PropTypes.func,
};
OrderStatusSelector.propTypes = {
  onSelectCallback: PropTypes.func,
  onRefreshCallback: PropTypes.func,
};
OrderSearch.propTypes = {
  onSearchCallback: PropTypes.func,
};

export default Orders;
