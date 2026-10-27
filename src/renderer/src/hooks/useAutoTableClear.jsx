import { useCallback } from "react";
import useTableClear from "./useTableClear";

// 自动清台复用人工确认后的清台动作，触发节点只需要提供可识别桌台的 table_uuid。
const useAutoTableClear = () => {
  const { clearTable } = useTableClear();

  const autoClearTable = useCallback(
    async (tableUuid, options = {}) => {
      return clearTable(tableUuid, options);
    },
    [clearTable],
  );

  return {
    autoClearTable,
  };
};

export default useAutoTableClear;
