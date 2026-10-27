import Header from "@renderer/components/Header";
import { Button, DatePicker, Table, Tag, Dropdown, message } from "antd";
import EmptyHolder from "@renderer/components/EmptyHolder.jsx";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import useStore from "@renderer/store";
import { format } from "@renderer/utils/MoneyUtils";
import ChangeTableModal from "./components/Modals/ChangeTableModal";
import useCancelOrder from "@renderer/hooks/useCancelOrder.jsx";

import PropTypes from "prop-types";

const { RangePicker } = DatePicker;

const OrderList = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const tableId = searchParams.get("table_id") ?? "";
  const { currency_symbol } = useStore((state) => state.restaurantSetting);
  const { cancelOrder, contextHolder: cancelOrderContextHolder } = useCancelOrder();

  const [messageApi, messageContextHolder] = message.useMessage();
  const [showChangeTableModal, setShowChangeTableModal] = useState(false);

  const [orderListDetail, setOrderListDetail] = useState({}); // 订单详情
  const [orderList, setOrderList] = useState([]); // 订单列表
  const [orderCreateDateRange, setOrderCreateDateRange] = useState([
    dayjs().subtract(3, "day").format("YYYY-MM-DD"),
    dayjs().format("YYYY-MM-DD"),
  ]);

  const backPath = tableId ? `/table-menu/${tableId}` : "/";

  const orderTotal = useMemo(() => orderListDetail.total ?? orderListDetail.amount ?? 0, [orderListDetail]);

  const orderSubTotal = useMemo(() => orderListDetail.sub_total ?? orderTotal, [orderListDetail, orderTotal]);

  const orderCreateDateRangeValue = useMemo(
    () => orderCreateDateRange.map((date) => (date ? dayjs(date) : null)),
    [orderCreateDateRange],
  );

  const columns = [
    {
      width: 300,
      title: <span className="text-[13px] font-semibold text-primary">{t("order_list.item")}</span>,
      align: "center",
      render: ({ product_name, sku_name }) =>
        product_name === sku_name ? `${product_name}` : `${product_name}(${sku_name})`,
    },
    {
      width: 400,
      title: t("order.option"),
      dataIndex: "option_list",
      align: "center",
      render: (option_list) =>
        option_list.length === 0
          ? "-"
          : option_list.map((opt) =>
              opt.option_item_list.map((optItem) => (
                <Tag
                  color="geekblue"
                  variant="outlined"
                  key={optItem.option_item_no}
                >{`${opt.option_name}(${optItem.option_item_name})`}</Tag>
              )),
            ),
    },
    {
      title: t("order.quantity"),
      dataIndex: "count",
      align: "center",
    },
    {
      title: t("order.price"),
      dataIndex: "price",
      align: "center",
      render: (price) => `${currency_symbol} ${format(price)}`,
    },
  ];

  // 订单操作dropdown

  // 编辑订单dropdown
  const editOrderOperations = [
    {
      key: "CANCEL_ORDER",
      label: <div className="px-3 py-1.5">{t("order_list.cancel_order")}</div>,
    },
    {
      key: "CHANGE_TABLE",
      label: <div className="px-3 py-1.5">{t("order_list.change_table")}</div>,
    },
  ];

  const fetchCancellableOrders = useCallback(() => {
    const [order_create_time_start, order_create_time_end] = orderCreateDateRange;
    const params = {
      table_id: tableId,
      order_create_time_end: `${order_create_time_end} 23:59:59`,
      order_create_time_start: `${order_create_time_start} 00:00:00`,
    };
    return window.api.orders.getCancellableOrdersByTable(params).then((res) => {
      const { list } = res;
      setOrderList(list);
    });
  }, [tableId, orderCreateDateRange]);

  useEffect(() => {
    fetchCancellableOrders();
  }, [fetchCancellableOrders]);

  const handleSelectOrder = (order) => {
    window.api.orders.getCancellableOrderDetail(order.order_inner_no).then((detail) => {
      // 保留列表查询带回的桌台上下文，后续跳转 BillOut 需要用它恢复清台提示。
      setOrderListDetail({
        ...order,
        ...detail,
        table_uuid: order.table_uuid ?? detail.table_uuid,
        order_channel: order.order_channel ?? detail.order_channel,
      });
    });
  };

  const handleBillOut = () => {
    const orderInnerNo = orderListDetail.order_inner_no;

    if (!orderInnerNo) {
      messageApi.warning(t("tips.select_order_first"));
      return;
    }

    // 从桌台订单列表进入结账页时，必须携带选中订单的内部号和桌台 UUID。
    navigate("/bill-out", {
      state: {
        orderInnerNo,
        tableUuid: orderListDetail.table_uuid ?? "",
      },
    });
  };

  const onClickEditOrder = (event) => {
    const { key } = event;
    switch (key) {
      case "CANCEL_ORDER":
        cancelOrder({
          orderInnerNo: orderListDetail.order_inner_no,
          onSuccess: () => {
            setOrderListDetail({});
            return fetchCancellableOrders();
          },
        });
        break;
      case "CHANGE_TABLE":
        setShowChangeTableModal(true);
        break;
    }
  };

  const handleChangeTableConfirm = async ({ table }) => {
    if (!orderListDetail.order_inner_no) {
      messageApi.warning(t("tips.select_order_first"));
      return;
    }

    try {
      await window.api.orders.changeTable({
        order_inner_no: orderListDetail.order_inner_no,
        table_id: table,
      });

      messageApi.success(t("tips.change_table_successfully"));
      setShowChangeTableModal(false);
      setOrderListDetail({});
      await fetchCancellableOrders();
    } catch (error) {
      messageApi.error(error?.message || String(error));
      throw error;
    }
  };

  return (
    <div data-table-id={tableId}>
      {cancelOrderContextHolder}
      {messageContextHolder}
      <ChangeTableModal
        open={showChangeTableModal}
        onCancel={() => setShowChangeTableModal(false)}
        onConfirm={handleChangeTableConfirm}
      />
      <Header currentTitle={t("menu.order_list")} onTopPage={false} backPath={backPath} />

      <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white">
        <aside className="w-[437px] flex-none border-r border-line px-4 py-4">
          <h2 className="mb-5 pl-4 text-[18px] font-semibold text-primary">{t("menu.order_list")}</h2>

          <RangePicker
            className="mb-6 h-[40px] w-full"
            value={orderCreateDateRangeValue}
            onChange={(_days, dateStrings) => {
              setOrderCreateDateRange(dateStrings);
            }}
            allowClear={false}
            format="YYYY-MM-DD"
          />
          {orderList.length === 0 ? (
            <EmptyHolder />
          ) : (
            orderList.map((order) => (
              <OrderListItem key={order.order_inner_no} orderItem={order} onClick={() => handleSelectOrder(order)} />
            ))
          )}
        </aside>
        {JSON.stringify(orderListDetail) === "{}" ? (
          <EmptyHolder />
        ) : (
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <h2 className="mb-5 text-[18px] font-semibold text-primary">{t("menu.order_summary")}</h2>
              {orderListDetail.order_list.map((order, index) => (
                <div key={order.order_no} className="mb-10">
                  <h3 className="mb-2 text-[16px] font-semibold text-danger">
                    {index === 0 ? t("table_manage.original_order") : t("table_manage.additional_order")}
                  </h3>
                  <Table
                    columns={columns}
                    dataSource={order.product_list}
                    pagination={false}
                    rowKey="key"
                    size="middle"
                  />
                </div>
              ))}

              <div className="mt-8 flex items-center justify-between text-[15px]">
                <span className="text-primary">{t("order.sub_total")}</span>
                <span className="pr-8 font-medium text-normal">
                  {currency_symbol} {format(orderSubTotal)}
                </span>
              </div>
            </div>

            <div className="border-t border-line bg-white">
              <div className="flex items-center px-4 py-2.5">
                <div className="flex-1 text-[18px] font-bold text-normal">
                  {t("components.total")}{" "}
                  <span className="text-[13px] font-semibold text-danger">{t("order.incl_vat")}</span>
                </div>
                <div className="mr-5 text-[18px] font-bold text-normal">
                  {currency_symbol} {format(orderTotal)}
                </div>
              </div>

              <div className="flex gap-3 border-t border-line px-4 py-4">
                <Dropdown
                  menu={{
                    items: editOrderOperations,
                    onClick: onClickEditOrder,
                  }}
                  trigger="click"
                >
                  <Button
                    variant="outlined"
                    color="primary"
                    className="h-[52px] flex-1 border-primary font-semibold text-primary"
                    size="large"
                  >
                    {t("table_manage.edit_order")}
                  </Button>
                </Dropdown>
                <Button type="primary" className="h-[52px] flex-1 font-semibold" size="large" onClick={handleBillOut}>
                  {t("menu.bill_out")}
                </Button>
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
};

const OrderListItem = ({ orderItem, onClick }) => {
  const { t } = useTranslation();
  const { currency_symbol } = useStore((state) => state.restaurantSetting);
  const { order_list } = orderItem;
  const totalItemCount = useMemo(() => {
    let total = 0;
    let count = 0;
    order_list.forEach((order) => {
      count = count + order.total_count;
      total = total + order.total_amount;
    });
    return { count, total };
  }, [order_list]);

  return (
    <div
      className="rounded-[4px] border hover:border-primary border-info bg-white my-3 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center justify-between border-b border-[#f1f1f1] px-4 py-3 text-[#6b768a]">
        <span>{orderItem.create_time}</span>
      </div>

      <div className="flex h-[137px] items-center px-4">
        <div className="flex-1 text-[16px] leading-6">
          {/* 只遍历主订单的菜品 */}
          {orderItem.order_list[0].product_list.map((item) => (
            <div key={item.key}>
              <span className="text-info">{item.max_count}x </span>
              <span className="text-normal">{item.product_name}</span>
            </div>
          ))}
        </div>
        <div className="text-right">
          <div className="text-[18px] font-bold text-normal">
            {currency_symbol} {format(totalItemCount.total)}
          </div>
          <div className="text-[13px] text-[#afafaf]">{t("order.items_in_total", { count: totalItemCount.count })}</div>
        </div>
      </div>
    </div>
  );
};

OrderListItem.propTypes = {
  orderItem: PropTypes.object,
  onClick: PropTypes.func,
};
export default OrderList;
