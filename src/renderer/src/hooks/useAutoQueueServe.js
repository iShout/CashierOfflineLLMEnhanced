import { useCallback } from "react";

const useAutoQueueServe = () => {
  const autoServeQueueOrder = useCallback(async (orderInnerNo) => {
    if (!orderInnerNo) {
      throw new Error("自动出餐失败：缺少 order_inner_no");
    }

    const result = await window.api.orders.orderServe({
      order_inner_no: orderInnerNo,
    });

    return result;
  }, []);

  return {
    autoServeQueueOrder,
  };
};

export default useAutoQueueServe;
