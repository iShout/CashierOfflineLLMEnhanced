import { useCallback } from "react";
import { App as AntdApp } from "antd";
import { useTranslation } from "react-i18next";

import CONSTANT from "@renderer/const";

const { ORDER_STATUS, PAYMENT_STATUS } = CONSTANT;

// 判断是否需要弹出“是否完成订单/清台”的确认框，规则对齐 web 在线项目。
const shouldPromptTableClear = (orderGroups = []) => {
  if (orderGroups.length === 0) {
    return false;
  }

  return orderGroups.every((orderGroup) => {
    const mainOrder = orderGroup?.order_list?.[0];
    return mainOrder?.payment_status === PAYMENT_STATUS.PAY_SUCCESS && mainOrder?.order_status !== ORDER_STATUS.PENDING;
  });
};

// 统一封装本地清台和进入桌台时的清台确认弹窗。
const useTableClear = () => {
  const { t } = useTranslation();
  const { modal, message } = AntdApp.useApp();

  // 执行本地清台事务后刷新页面，不再维护服务器同步队列。
  const clearTable = useCallback(
    async (tableUuid, { onSuccess } = {}) => {
      if (!tableUuid) {
        message.warning("当前桌台信息缺少 table_uuid");
        return null;
      }

      const result = await window.api.orders.tableClear({ table_uuid: tableUuid });
      message.success(t("tips.success"));
      await onSuccess?.(result);
      return result;
    },
    [message, t],
  );

  // 进入桌台菜单时检查是否存在已支付未清台订单，满足条件才弹确认框。
  const promptClearTableIfNeeded = useCallback(
    async ({ tableId, tableUuid } = {}, { onSuccess } = {}) => {
      if (!tableUuid) {
        return false;
      }

      // 查询指定桌台未完成订单组；主进程优先使用 table_id，兼容 table_uuid。
      const orderGroups = await window.api.orders.getUncompleteOrdersByTable({
        table_id: tableId,
        table_uuid: tableUuid,
      });

      if (!shouldPromptTableClear(orderGroups)) {
        return false;
      }

      modal.confirm({
        title: t("components.tips"),
        content: t("order.complete_order_tips"),
        okText: t("components.confirm"),
        cancelText: t("components.cancel"),
        maskClosable: false,
        onOk: () => clearTable(tableUuid, { onSuccess }),
      });

      return true;
    },
    [clearTable, modal, t],
  );

  return {
    clearTable,
    promptClearTableIfNeeded,
  };
};

export default useTableClear;
