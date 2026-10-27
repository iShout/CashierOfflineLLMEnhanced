import StatusTag from "@renderer/components/StatusTag";
import PropTypes from "prop-types";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import dayjs from "dayjs";
import CONSTANT from "@renderer/const";

const { ORDER_STATUS, PAYMENT_STATUS } = CONSTANT;

const tableStatusClassMap = {
  pending: "border-primary bg-[#EDF3FF]",
  complete: "border-danger bg-[#ffebea]",
  default: "border-line bg-white",
};

const getRelativeCreateTime = (createTime) => {
  if (!createTime) {
    return "";
  }

  const diffMinutes = dayjs().diff(createTime, "minute");
  if (diffMinutes >= 1440) {
    return `${Math.floor(diffMinutes / 1440)} days ago`;
  }
  if (diffMinutes >= 60) {
    return `${Math.floor(diffMinutes / 60)} hours ago`;
  }
  return `${Math.max(diffMinutes, 0)} minutes ago`;
};

const getTableStatus = (orderList) => {
  let status = "default";
  let hasNonClearableOrder = false;

  for (const order of orderList) {
    if (order.order_status === ORDER_STATUS.PENDING) {
      return "pending";
    }

    if (order.order_status === ORDER_STATUS.TAKEN && order.payment_status === PAYMENT_STATUS.PAY_SUCCESS) {
      status = "complete";
    } else {
      hasNonClearableOrder = true;
    }
  }

  return hasNonClearableOrder ? "default" : status;
};

const getStatusList = (orderList) => {
  const statusList = [];

  for (const order of orderList) {
    if (order.order_status === ORDER_STATUS.PENDING) {
      statusList.unshift(order);
      if (statusList.length > 2) {
        statusList.pop();
      }
      continue;
    }

    if (statusList.length < 2) {
      statusList.push(order);
    }
  }

  return statusList;
};

const TablePreview = ({ tableDetail, className }) => {
  const { name, create_time, order_list = [] } = tableDetail;
  const navigate = useNavigate();
  const { t } = useTranslation();
  // 桌台卡片状态对齐在线端：pending 优先，最多展示两个订单状态。
  const tableStatus = useMemo(() => getTableStatus(order_list), [order_list]);
  const statusList = useMemo(() => getStatusList(order_list), [order_list]);
  const computedTime = useMemo(() => getRelativeCreateTime(create_time), [create_time]);
  const onClickTable = () => {
    navigate(`/table-menu/${tableDetail.id}`, {
      state: {
        // 菜单页展示桌名，路由里的 id 继续用于订单和桌台查询。
        tableName: tableDetail.name ?? "",
        tableUuid: tableDetail.table_uuid ?? "",
      },
    });
  };
  return (
    <div
      className={`${className} ${tableStatusClassMap[tableStatus]} w-[252px] h-[114px] p-4 rounded-lg flex border cursor-pointer`}
      onClick={onClickTable}
    >
      {/* 桌名&时间 */}
      <div className="flex-auto">
        <span className="text-[16px] block font-bold">{name}</span>
        <span className="text-[13px] font-medium text-[#afafaf]">{computedTime}</span>
      </div>
      {/* 订单状态 */}
      <div className="flex-none basis-[96px] text-right">
        {statusList.map((order) => (
          <StatusTag
            key={order.order_no}
            className="ml-auto mb-2"
            paymentStatus={order.payment_status}
            paymentWay={order.payment_way}
            orderStatus={order.order_status}
          />
        ))}
        {order_list.length > 2 && (
          <span className="inline-block px-2.5 text-[13px] font-medium text-[#afafaf]">{t("components.see_more")}</span>
        )}
      </div>
    </div>
  );
};

TablePreview.propTypes = {
  tableDetail: PropTypes.object,
  className: PropTypes.string,
};

export default TablePreview;
