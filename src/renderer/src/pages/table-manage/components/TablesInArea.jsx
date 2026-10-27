import TablePreview from "./TablePreview";
import PropTypes from "prop-types";
import { useRef } from "react";
import useGsapReflowAnimation from "@renderer/hooks/useGsapReflowAnimation";

const TablesInArea = ({ areaDetail }) => {
  const { area_name, table_info_list = [] } = areaDetail;
  const tablesWrapperRef = useRef(null);

  // 桌台列表响应窗口宽度换行时，使用公共 FLIP 动画平滑移动卡片。
  useGsapReflowAnimation(tablesWrapperRef, [table_info_list.length], {
    duration: 0.34,
    stagger: 0.01,
  });

  return (
    <div className="mb-12">
      <p className="text-[21px] text-primary mb-6" style={{ fontWeight: 600 }}>
        {area_name}
      </p>

      <div ref={tablesWrapperRef} className="flex flex-wrap">
        {table_info_list.map((table) => (
          <TablePreview key={table.id} tableDetail={table} className="m-2" />
        ))}
      </div>
    </div>
  );
};

TablesInArea.propTypes = {
  areaDetail: PropTypes.object,
};

export default TablesInArea;
