import { useCallback } from "react";

const useAutoQueueComplete = () => {
  const autoCompleteQueueOrder = useCallback(async (orderInnerNo) => {
    if (!orderInnerNo) {
      throw new Error("自动完成失败：缺少 order_inner_no");
    }

    const result = await window.api.orders.orderComplete({
      order_inner_no: orderInnerNo,
    });

    return result;
  }, []);

  return {
    autoCompleteQueueOrder,
  };
};

export default useAutoQueueComplete;
