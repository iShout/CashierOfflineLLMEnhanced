import CONSTANTS from "@renderer/const";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const { ORDER_STATUS, PAYMENT_STATUS } = CONSTANTS;

const { PENDING, TAKEN, COMPLETE, CANCEL, WAITING_PICK_UP } = ORDER_STATUS;
const { REFUNDED } = PAYMENT_STATUS;
const DEFAULT_TAG = {
  color: "#ECECEC",
  textColor: "#666666",
  textKey: "order.pending",
};
const tagMap = new Map([
  ["pending", { color: "#FBEB95", textColor: "#AD9200", textKey: "order.pending" }],
  ["taken", { color: "#FEE9D1", textColor: "#FF6B00", textKey: "order.taken" }],
  ["waiting_pick_up", { color: "#E6EEFF", textColor: "#003498", textKey: "order.waiting_pick_up" }],
  ["complete", { color: "#ECECEC", textColor: "#666666", textKey: "order.complete" }],
  ["cancelled", { color: "#ECECEC", textColor: "#666666", textKey: "order.cancelled" }],
  ["refunded", { color: "#ECECEC", textColor: "#666666", textKey: "order.refunded" }],
]);

const getStatusKey = ({ orderStatus, paymentStatus }) => {
  // 已退款是唯一允许由支付状态覆盖订单状态的 tag 文案。
  if (paymentStatus === REFUNDED) return "refunded";

  // 其他状态 tag 只表达订单履约状态，不再被支付状态覆盖成 Paid 等文案。
  if (orderStatus === PENDING) return "pending";
  if (orderStatus === TAKEN) return "taken";
  if (orderStatus === WAITING_PICK_UP) return "waiting_pick_up";
  if (orderStatus === COMPLETE) return "complete";
  if (orderStatus === CANCEL) return "cancelled";

  return "";
};

/**
 * tableManage的桌面组件的状态显示
 * @param {*} Props 组件传参：默认由 orderStatus 决定内容，仅已退款由 paymentStatus 覆盖
 * @returns
 */
const StatusTag = ({ paymentStatus, orderStatus, className }) => {
  const { t } = useTranslation();
  const statusKey = getStatusKey({ orderStatus, paymentStatus });
  const matchTag = tagMap.get(statusKey) || DEFAULT_TAG;

  return (
    <div
      className={`${className ?? ""} w-fit px-2.5 rounded-2xl text-center text-[13px] leading-[22px]`}
      style={{ backgroundColor: matchTag.color, color: matchTag.textColor }}
    >
      <span>{t(matchTag.textKey)}</span>
    </div>
  );
};

StatusTag.propTypes = {
  paymentStatus: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  orderStatus: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
};

export default StatusTag;
