import { useCallback, useEffect } from "react";
import useStore from "@renderer/store";

const useUncompleteOrderCount = () => {
  const restaurantId = useStore((state) => state.user?.restaurant_id);
  const uncompleteOrderCount = useStore((state) => state.uncompleteOrderCount);
  const setUncompleteOrderCount = useStore((state) => state.setUncompleteOrderCount);

  const refreshUncompleteOrderCount = useCallback(() => {
    if (!restaurantId) {
      setUncompleteOrderCount(0);
      return Promise.resolve(0);
    }

    return window.api.orders.getUncompleteOrderCount().then((count) => {
      setUncompleteOrderCount(count);
      return count;
    });
  }, [restaurantId, setUncompleteOrderCount]);

  return {
    uncompleteOrderCount,
    refreshUncompleteOrderCount,
  };
};

export const useUncompleteOrderCountSubscription = () => {
  const setUncompleteOrderCount = useStore((state) => state.setUncompleteOrderCount);
  const { refreshUncompleteOrderCount } = useUncompleteOrderCount();

  useEffect(() => {
    const unsubscribe = window.api.orders.onUncompleteOrderCountChanged(({ count }) => {
      setUncompleteOrderCount(count);
    });

    return unsubscribe;
  }, [setUncompleteOrderCount]);

  useEffect(() => {
    refreshUncompleteOrderCount().catch((error) => {
      console.error(error);
    });
  }, [refreshUncompleteOrderCount]);
};

export default useUncompleteOrderCount;
