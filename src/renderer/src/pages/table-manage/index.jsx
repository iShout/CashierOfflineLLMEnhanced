import Header from "@renderer/components/Header";
import TablesInArea from "./components/TablesInArea";
import RoundButton from "./components/RoundButton";
import { useTranslation } from "react-i18next";
import { Badge } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import useStore from "@renderer/store";
import usePendingOrdersModal from "@renderer/hooks/usePendingOrdersModal.jsx";
import useUncompleteOrderCount from "@renderer/hooks/useUncompleteOrderCount";
import useTableClear from "@renderer/hooks/useTableClear.jsx";
import useAutoTableClear from "@renderer/hooks/useAutoTableClear.jsx";
import { useLocation, useNavigate } from "react-router";

function TableManage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [areaList, setAreaList] = useState([]);
  const contentRef = useRef(null);
  const areaRefs = useRef([]);
  const activeIndexRef = useRef(0);
  const rafRef = useRef(null);
  const tableClearPromptedRef = useRef("");
  const user = useStore((state) => state.user);
  const autoTableClearStatus = useStore((state) => state.restaurantSetting?.completion);
  const { uncompleteOrderCount } = useUncompleteOrderCount();
  const { promptClearTableIfNeeded } = useTableClear();
  const { autoClearTable } = useAutoTableClear();

  // 重新拉取桌台区域，确保取消待处理订单后桌台状态同步更新。
  const fetchTableAreaList = useCallback(() => {
    return window.api.orders.getTableAreaList(user.restaurant_id).then((res) => {
      console.log(res, "table manage area list");
      setAreaList(res);
      return res;
    });
  }, [user.restaurant_id]);

  const { openPendingOrders, pendingOrdersModalHolder } = usePendingOrdersModal({
    onOrderCanceled: fetchTableAreaList,
  });

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const scrollContainer = contentRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (areaList.length === 0) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const threshold = 12;
        let nextIndex = 0;
        const maxIndex = areaList.length - 1;

        areaRefs.current.forEach((node, index) => {
          if (!node) return;
          const rect = node.getBoundingClientRect();
          if (rect.top - containerRect.top <= threshold) {
            nextIndex = index;
          }
        });

        const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        if (maxScroll <= 0 || scrollContainer.scrollTop >= maxScroll - 2) {
          nextIndex = maxIndex;
        }

        if (nextIndex !== activeIndexRef.current) {
          setActiveIndex(nextIndex);
        }
      });
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [areaList.length]);

  useEffect(() => {
    fetchTableAreaList();
  }, [fetchTableAreaList]);

  useEffect(() => {
    const promptState = location.state?.promptTableClear ? location.state : null;
    const tableUuid = promptState?.tableUuid;

    if (!tableUuid || tableClearPromptedRef.current === tableUuid) {
      return;
    }

    tableClearPromptedRef.current = tableUuid;
    // 消费跳转状态，避免刷新或同一路由状态更新时重复弹清台确认框。
    navigate("/", { replace: true, state: null });

    if (Number(autoTableClearStatus) === 1) {
      // 餐厅开启自动清台时跳过人工确认，直接复用现有清台动作并刷新桌台列表。
      autoClearTable(tableUuid, {
        onSuccess: fetchTableAreaList,
      }).catch((error) => {
        console.error("Auto table clear after payment failed:", error);
      });
      return;
    }

    promptClearTableIfNeeded(
      {
        tableUuid,
      },
      {
        onSuccess: fetchTableAreaList,
      },
    ).catch((error) => {
      console.error("Prompt table clear after payment failed:", error);
    });
  }, [autoClearTable, autoTableClearStatus, fetchTableAreaList, location.state, navigate, promptClearTableIfNeeded]);

  const handleAreaClick = (index) => {
    const scrollContainer = contentRef.current;
    const node = areaRefs.current[index];
    if (!scrollContainer || !node) return;
    const top =
      node.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;
    setActiveIndex(index);
    scrollContainer.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <div className="h-screen overflow-hidden">
      <Header currentTitle={t("menu.table_manage")}></Header>

      <div className="flex h-[calc(100vh-64px)] min-h-0">
        <div className="fixed right-[32px] bottom-[24px] z-40">
          <Badge count={uncompleteOrderCount} size="large" offset={[-12, 12]}>
            <RoundButton onClick={openPendingOrders} />
          </Badge>
        </div>
        {/* table areas */}
        <div ref={contentRef} className="flex-auto min-h-0 overflow-y-auto px-5 py-4">
          {areaList.map((area, index) => (
            <div
              key={area.area_uuid || area.area_name}
              ref={(node) => {
                areaRefs.current[index] = node;
              }}
            >
              <TablesInArea areaDetail={area}></TablesInArea>
            </div>
          ))}
        </div>
        {/* area列表 */}
        <div className="flex-none basis-[205px] h-full min-h-0">
          <div className="h-full overflow-y-auto">
            {areaList.map((area, index) => (
              <div
                key={area.area_uuid || area.area_name}
                onClick={() => handleAreaClick(index)}
                className={[
                  "text-center w-full h-[60px] leading-[60px] border border-[#f1f1f1] cursor-pointer",
                  "transition-colors",
                  index === activeIndex ? "bg-primary text-white" : "hover:bg-primary hover:text-white",
                ].join(" ")}
              >
                <span className="text-[18px] font-medium">{area.area_name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {pendingOrdersModalHolder}
    </div>
  );
}

export default TableManage;
