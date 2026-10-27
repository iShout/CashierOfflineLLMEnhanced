import PropTypes from "prop-types";
import { Navigate, Outlet, useParams } from "react-router";
import useStore, { selectToken } from "../store";
import Login from "@pages/login";
import CONSTANT from "../const";
import { STATUS_TYPE } from "@shared/constants/enums";
import { getDefaultOrderingRoute, hasDefaultOrderingSettings } from "./defaultOrderingRoute";

const getAvailableOrderingRoute = (restaurantSetting) => {
  if (Number(restaurantSetting?.table_order_status) === CONSTANT.SWITCH_STATUS.ON) {
    return { to: "/" };
  }

  if (Number(restaurantSetting?.wait_order_status) === CONSTANT.SWITCH_STATUS.ON) {
    return {
      to: "/table-menu/counter",
      state: { status_type: STATUS_TYPE.QUEUE },
    };
  }

  return { to: "/offline-orders" };
};

const OrderingFeatureGuard = ({ children, settingKey }) => {
  const restaurantSetting = useStore((state) => state.restaurantSetting);
  const hasSetting = Object.prototype.hasOwnProperty.call(restaurantSetting ?? {}, settingKey);

  // 设置尚未从本地库补齐时先保留当前页面，避免持久化迁移过程中发生错误跳转。
  if (!restaurantSetting || !hasSetting || Number(restaurantSetting[settingKey]) === CONSTANT.SWITCH_STATUS.ON) {
    return children;
  }

  const fallback = getAvailableOrderingRoute(restaurantSetting);
  return <Navigate to={fallback.to} state={fallback.state} replace />;
};

OrderingFeatureGuard.propTypes = {
  children: PropTypes.node.isRequired,
  settingKey: PropTypes.oneOf(["table_order_status", "wait_order_status"]).isRequired,
};

export function RequireTableOrdering({ children }) {
  return <OrderingFeatureGuard settingKey="table_order_status">{children}</OrderingFeatureGuard>;
}

RequireTableOrdering.propTypes = {
  children: PropTypes.node.isRequired,
};

export function RequireOrderingMenu({ children }) {
  const { tableId } = useParams();
  const settingKey = tableId === "counter" ? "wait_order_status" : "table_order_status";

  return <OrderingFeatureGuard settingKey={settingKey}>{children}</OrderingFeatureGuard>;
}

RequireOrderingMenu.propTypes = {
  children: PropTypes.node.isRequired,
};

export function RequireAuth() {
  const token = useStore(selectToken);

  const user = useStore((state) => state.user);

  // 离线业务只要求有效账号与餐厅会话，不再依赖 POS 绑定状态。
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function DefaultOrderingEntry() {
  const restaurantSetting = useStore((state) => state.restaurantSetting);

  // 餐厅设置异步补齐前停留在系统入口，避免先跳到错误默认页后无法自动纠正。
  if (!hasDefaultOrderingSettings(restaurantSetting)) {
    return null;
  }

  const target = getDefaultOrderingRoute(restaurantSetting);

  return <Navigate to={target.to} state={target.state} replace />;
}

export function GuestOnly() {
  const token = useStore(selectToken);
  const isLoginFlowPending = useStore((state) => state.isLoginFlowPending);

  const user = useStore((state) => state.user);

  if (token && user && !isLoginFlowPending) {
    return <Navigate to="/entry" replace />;
  }

  return <Login />;
}
