import { useCallback } from "react";

const useRefreshOfflineOrders = ({
  buildOrderListParams,
  onRefreshed,
  pageSize,
  setOrderList,
  setOrderListHasMore,
  setOrderListPage,
}) => {
  return useCallback(async () => {
    // 状态流转后沿用当前已应用的筛选参数，并从第一页重新生成列表结果。
    const params = buildOrderListParams(1);
    const { list, hasMore } = await window.api.orders.getOrderList({
      ...params,
      size: pageSize,
    });

    setOrderListPage(1);
    setOrderList(list);
    setOrderListHasMore(hasMore);
    onRefreshed?.(list);
    return list;
  }, [buildOrderListParams, onRefreshed, pageSize, setOrderList, setOrderListHasMore, setOrderListPage]);
};

export default useRefreshOfflineOrders;
