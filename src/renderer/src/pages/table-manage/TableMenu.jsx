import { useTranslation } from "react-i18next";
import Header from "@renderer/components/Header";
import DishPreview from "./components/DishPreview";
import SelectProductModal from "./components/Modals/SelectProductModal";
import AddOrderMarkModal from "./components/Modals/AddOrderMarkModal";
import RollingNumber from "@renderer/components/RollingNumber.jsx";
import AnimatedList from "@renderer/components/AnimatedList";
import QuantityStepper from "@renderer/components/QuantityStepper";
import usePendingOrdersModal from "@renderer/hooks/usePendingOrdersModal.jsx";
import useUncompleteOrderCount from "@renderer/hooks/useUncompleteOrderCount";

import useTableClear from "@renderer/hooks/useTableClear.jsx";
import useGsapReflowAnimation from "@renderer/hooks/useGsapReflowAnimation";

import { AddProductContext } from "@renderer/context/TableManageContext.js";
import PropTypes from "prop-types";
import { EditOutlined } from "@ant-design/icons";
import { Badge, Button, message, InputNumber, Modal, Dropdown } from "antd";
import { CUSTOMER_DINING_STYLE, ORDER_CHANNEL, SERVICE_FEE_TYPE } from "@shared/constants/enums.ts";
import { cloneDeep } from "lodash";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import useStore from "@renderer/store";
import { format } from "@renderer/utils/MoneyUtils.js";
import { useNavigate, useLoaderData, useLocation } from "react-router";
import { STATUS_TYPE } from "@shared/constants/enums";
import CONSTANT from "@renderer/const";

import ExpandIcon from "@renderer/assets/expand-btn.svg";
import OrderBtn from "@renderer/assets/order-btn-icon.svg";

// 渲染dine type按钮的map
const renderDineTypeMap = new Map([
  [CUSTOMER_DINING_STYLE.DINING_ROOM, { icon: <i className="swifood-icon-dinner" />, label: "table_manage.dine_in" }],
  [CUSTOMER_DINING_STYLE.TAKE_AWAY, { icon: <i className="swifood-icon-take-out" />, label: "table_manage.take_out" }],
]);

const getOptionItemNos = (dish) => {
  return (dish?.option_list ?? [])
    .flatMap((option) => (option?.option_item_list ?? []).map((optionItem) => optionItem?.option_item_no))
    .filter(Boolean)
    .sort();
};

const getOptionItemNames = (dish) => {
  return (dish?.option_list ?? []).flatMap((option) =>
    (option?.option_item_list ?? []).map((optionItem) => optionItem?.option_item_name ?? optionItem?.name),
  );
};

const getDishKey = (dish) => {
  const optionItemNos = getOptionItemNos(dish);
  return `${dish?.sku_no ?? ""}::${optionItemNos.join("|")}`;
};

const isSameDish = (currentDish, targetDish) => {
  return getDishKey(currentDish) === getDishKey(targetDish);
};

const getPresetServiceFee = (productAmount, restaurantSetting) => {
  const isServiceFeeOpen = restaurantSetting?.service_fee_status === CONSTANT.SERVICE_FEE_STATUS.OPEN;
  const serviceFeeType = restaurantSetting?.service_fee_type;

  // CUSTOM 服务费需要在结账页手动输入，创建 food order 时不能提前写入。
  if (!isServiceFeeOpen || serviceFeeType === SERVICE_FEE_TYPE.CUSTOM) {
    return null;
  }

  if (serviceFeeType === SERVICE_FEE_TYPE.FIXED_AMOUNT) {
    return restaurantSetting?.service_fee ?? 0;
  }

  if (serviceFeeType === SERVICE_FEE_TYPE.PERCENTAGE) {
    return productAmount * (restaurantSetting?.service_fee ?? 0);
  }

  return null;
};

// BillOut 和创建订单接口使用 order_detail 风格字段，这里把菜单页菜品对象补齐成统一结构。
const normalizeOrderSummaryItem = (dish) => ({
  ...dish,
  option_list: (dish?.option_list ?? []).map((option) => ({
    ...option,
    option_name: option?.option_name ?? option?.name,
    option_item_list: (option?.option_item_list ?? []).map((optionItem) => ({
      ...optionItem,
      option_item_name: optionItem?.option_item_name ?? optionItem?.name,
    })),
  })),
  product_name: dish?.product_name ?? dish?.name ?? "",
  sku_name: dish?.sku_name ?? dish?.currentDish?.sku_name ?? "",
  version: dish?.version ?? dish?.currentDish?.sku_version,
});

// 左边菜品集合的组件
const CategoryClass = ({ category, addProduct }) => {
  const { name, product_list = [] } = category;
  const selectProductModalRef = useRef();
  const productsWrapperRef = useRef(null);

  // 菜品列表在窗口尺寸变化后会重新换行，通过公共动画保持移动过程可见。
  useGsapReflowAnimation(productsWrapperRef, [product_list.length], {
    duration: 0.3,
    stagger: 0.008,
  });

  const ClickProduct = async (product) => {
    const { product_no } = product;
    let currentProduct = await window.api.orders.getProductDetailByProductNo(product_no);
    console.log(currentProduct, "Click Product Detail");
    if (!currentProduct.option_list.length && currentProduct.spec_list[0].dish_product_spec_item_list.length === 1) {
      currentProduct = cloneDeep(currentProduct);
      currentProduct.count = 1;
      currentProduct.price = currentProduct.spec_list[0].dish_product_spec_item_list[0].price;
      currentProduct.sku_no = currentProduct.spec_list[0].dish_product_spec_item_list[0].sku_no;
      currentProduct.sku_name = currentProduct.spec_list[0].dish_product_spec_item_list[0].sku_name;
      // 当前菜品规格信息
      currentProduct.currentDish = currentProduct.spec_list[0].dish_product_spec_item_list[0];
      addProduct(currentProduct);
      return;
    }
    selectProductModalRef.current.showModal(currentProduct);
  };
  return (
    <div className="p-3 w-full">
      <p className="text-primary text-[21px] font-bold">{name}</p>
      <div ref={productsWrapperRef} className="flex flex-wrap">
        {product_list.map((product) => (
          <DishPreview
            className="m-1"
            key={product.product_no}
            productDetail={product}
            onClick={() => ClickProduct(product)}
          ></DishPreview>
        ))}
      </div>

      <SelectProductModal ref={selectProductModalRef}></SelectProductModal>
    </div>
  );
};

//堂食 or 外带
const DineTypeButton = ({ dineType, activeDineType, setType }) => {
  const { t } = useTranslation();

  return (
    <div
      onClick={() => setType(dineType)}
      style={dineType === activeDineType ? { backgroundColor: "#003498", color: "#fff" } : {}}
      className="w-[178px] h-[46px] flex justify-center items-center  px-3 border text-primary border-primary rounded-4xl bg-white hover:bg-primary hover:text-white cursor-pointer"
    >
      <span className="text-[24px] mr-2">{renderDineTypeMap.get(dineType).icon}</span>
      <span className="text-[16px] font-semibold">{t(`${renderDineTypeMap.get(dineType).label}`)}</span>
    </div>
  );
};

// order summary列表下的每一项菜品的控制组件
const ProductDisplayItem = ({ productItem, removeProduct, setProductCount }) => {
  const { count, price } = productItem;
  const dishKey = getDishKey(productItem);
  const productName = productItem.name ?? productItem.product_name ?? "";
  const skuName = productItem.sku_name ?? "";
  const hasSpecList = Array.isArray(productItem.spec_list);
  const specItemCount = hasSpecList
    ? productItem.spec_list.reduce((count, spec) => count + (spec?.dish_product_spec_item_list?.length ?? 0), 0)
    : 0;
  // 单规格、规格名为空或名称相同时只展示产品名，避免无意义的重复文案。
  const shouldShowSkuName =
    Number(productItem.variant) !== 2 &&
    (!hasSpecList || specItemCount > 1) &&
    Boolean(skuName) &&
    skuName !== productName;
  const displayName = shouldShowSkuName ? `${productName}(${skuName})` : productName;
  // 数量输入为 0 时移除菜品，其余值直接写入，兼容按钮步进和键盘输入。
  const updateProductCount = (nextCount) => {
    if (nextCount === 0) {
      removeProduct(dishKey);
    } else {
      setProductCount(dishKey, nextCount);
    }
  };
  const { currency_symbol } = useStore((state) => state.restaurantSetting);

  return (
    <div className="flex py-3 items-center">
      {/* count controller */}
      <QuantityStepper className="mr-[14px]" min={0} value={count} onChange={updateProductCount} />
      {/* 商品名称，规格 */}
      <div className="flex-1">
        <span className="block text-primary">{displayName}</span>
        <span className="block text-[13px] text-[#afafaf]">{getOptionItemNames(productItem).join(",")}</span>
      </div>
      {/* 总价 */}
      <RollingNumber value={`${currency_symbol} ${format(price * count)}`}></RollingNumber>
    </div>
  );
};

// UI组件 -- 圆形按钮
const RoundBtn = ({ icon, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="size-12 border-4 rounded-4xl border-primary flex justify-center items-center text-[24px] cursor-pointer"
    >
      <span className="font-bold">{icon}</span>
    </div>
  );
};

// 主页面
const TableManage = () => {
  const { tableId } = useLoaderData();
  const location = useLocation();
  const statusType = location.state?.status_type;
  // 桌码菜单右上角优先展示桌名，避免把内部 table id 暴露给收银员。
  const tableDisplayName = location.state?.tableName || tableId;
  const tableUuid = location.state?.tableUuid ?? "";
  // 内存路由被直接导航时也按 counter 参数识别排队点餐，不能只依赖菜单传入的 state。
  const isQueueOrder = tableId === "counter" || statusType === STATUS_TYPE.QUEUE;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [orderSummaryList, setOrderSummary] = useState([]);
  const [showMarkModal, setMarkModalShow] = useState(false);
  const [orderRemark, setOrderRemark] = useState("");
  const [categoryList, setCategoryList] = useState([]); // 菜品列表
  const [customerDining, setCustomerDining] = useState(CUSTOMER_DINING_STYLE.DINING_ROOM);
  const { openPendingOrders, pendingOrdersModalHolder } = usePendingOrdersModal();

  const { clearTable, promptClearTableIfNeeded } = useTableClear();
  const tableClearPromptedRef = useRef("");

  const [modal, modalContextHolder] = Modal.useModal();
  const [guestNumber, setGuestNumber] = useState(1);
  const totalPrice = useMemo(() => {
    let total = 0;
    orderSummaryList.forEach((product) => {
      const { price, count } = product;
      total = total + price * count;
    });

    return total;
  }, [orderSummaryList]);
  const user = useStore((state) => state.user);
  const swifood_platform = useStore((state) => state.swifood_platform);
  const { uncompleteOrderCount } = useUncompleteOrderCount();
  const restaurantSetting = useStore((state) => state.restaurantSetting);
  const { currency_symbol } = restaurantSetting ?? {};
  const isAfterMealTableOrder = !isQueueOrder && restaurantSetting?.mode === CONSTANT.MODE.AFTER_MEAL;
  // 桌码由餐厅 mode 决定餐前/餐后；排队点餐永远按餐前线处理，Bill Out 时先不建 food_order。
  const shouldDelayOrderCreationForBillOut =
    isQueueOrder || (!isQueueOrder && restaurantSetting?.mode === CONSTANT.MODE.BEFORE_MEAL);
  const hasSelectedDishes = orderSummaryList.length > 0;
  // 没有可点菜品的分类不展示，避免菜单页出现空分类标题。
  const visibleCategoryList = useMemo(
    () => categoryList.filter((category) => (category?.product_list ?? []).length > 0),
    [categoryList],
  );

  // 编辑顾客人数弹窗
  const guestNumberModalConfig = {
    title: t("table_manage.guest_number"),
    content: (
      <>
        <p>{t("table_manage.guest_number_tip")}</p>
        <InputNumber mode="spinner" min={1} defaultValue={guestNumber} onChange={(value) => setGuestNumber(value)} />
      </>
    ),
    okText: t("components.confirm"),
  };

  const refreshCurrentPageData = useCallback(() => {
    window.api.orders.getDishProductList(user.restaurant_id).then((res) => {
      setCategoryList(res);
      console.log(res, "Dish Product List");
    });
  }, [user.restaurant_id]);

  useEffect(() => {
    refreshCurrentPageData();
  }, [refreshCurrentPageData]);

  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    if (isQueueOrder || !tableUuid || tableClearPromptedRef.current === tableUuid) {
      return;
    }

    tableClearPromptedRef.current = tableUuid;
    promptClearTableIfNeeded(
      {
        tableId,
        tableUuid,
      },
      {
        onSuccess: () => navigate("/"),
      },
    ).catch((error) => {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    });
  }, [isQueueOrder, messageApi, navigate, promptClearTableIfNeeded, tableId, tableUuid]);

  const addProduct = (productInfo) => {
    setOrderSummary((prevList) => {
      for (const product of prevList) {
        if (isSameDish(productInfo, product)) {
          return prevList.map((targetProduct) =>
            isSameDish(productInfo, targetProduct)
              ? { ...targetProduct, count: (targetProduct.count ?? 0) + 1 }
              : targetProduct,
          );
        }
      }

      return [...prevList, productInfo];
    });
  };
  const removeProduct = (dishKey) => {
    const nextList = orderSummaryList.filter((product) => getDishKey(product) !== dishKey);
    setOrderSummary(nextList);
    if (nextList.length === 0) {
      setOrderRemark("");
    }
  };
  const setProductCount = (dishKey, count) => {
    setOrderSummary((prevList) => prevList.map((prod) => (getDishKey(prod) === dishKey ? { ...prod, count } : prod)));
  };
  // 创建订单（主订单还是子订单由主进程判断）
  const createOrderByTable = ({ shouldNavigateToBillOut = true } = {}) => {
    const orderApp = Number(swifood_platform ?? 3);
    const orderChannel = isQueueOrder ? ORDER_CHANNEL.QUEUE : ORDER_CHANNEL.TABLE;
    const presetServiceFee = isQueueOrder ? 0 : getPresetServiceFee(totalPrice, restaurantSetting);
    // 固定/百分比服务费在创建 food order 时就写入，保证本地订单总额包含服务费；
    // 手动 CUSTOM 服务费则留到结账页写入本地支付订单的 real_service_fee。
    const orderTotalAmount = totalPrice + (presetServiceFee ?? 0);
    const params = {
      table_id: tableId,
      waiter_no: user.waiter_no,
      restaurant_id: user.restaurant_id,
      order_channel: orderChannel,
      customer_dining_style: isQueueOrder ? customerDining : undefined,
      sku_list: orderSummaryList,
      order_app: orderApp,
      total_amount: orderTotalAmount,
      remark: orderRemark || undefined,
      // 创建 food_order 时服务费为 0 也要明确传递，避免本地订单金额落成 null。
      service_fee: presetServiceFee ?? 0,
      customer_num: guestNumber,
      mode: restaurantSetting?.mode,
    };
    window.api.orders
      .createOrder(params)
      .then((result) => {
        // 本地订单创建成功后先清理点餐草稿，避免上传失败重试时重复创建 food_order。
        setOrderSummary([]);
        setOrderRemark("");
        refreshCurrentPageData();

        if (!shouldNavigateToBillOut) return;

        console.log("go bill out");
        navigate("/bill-out", {
          state: {
            orderInnerNo: result?.order_inner_no ?? "",
            tableUuid,
          },
        });
      })
      .catch((error) => {
        console.error(error);
        messageApi.open({
          type: "error",
          content: error?.message || String(error),
        });
      });
  };

  // 结账入口：有新菜品则先创建订单；没有新菜品则查当前桌台是否已有待结账订单。
  const handleBillOut = () => {
    if (hasSelectedDishes) {
      if (shouldDelayOrderCreationForBillOut) {
        const presetServiceFee = isQueueOrder ? 0 : getPresetServiceFee(totalPrice, restaurantSetting);
        const orderTotalAmount = totalPrice + (presetServiceFee ?? 0);
        const orderChannel = isQueueOrder ? ORDER_CHANNEL.QUEUE : ORDER_CHANNEL.TABLE;
        const normalizedOrderSummaryList = orderSummaryList.map(normalizeOrderSummaryItem);

        // 餐前桌码和排队点餐都先带临时订单进入结账页，支付时再创建 food_order。
        navigate("/bill-out", {
          state: {
            tableUuid,
            beforeMealOrder: {
              customerNum: guestNumber,
              customerDiningStyle: isQueueOrder ? customerDining : undefined,
              orderChannel,
              orderSummaryList: normalizedOrderSummaryList,
              remark: orderRemark || undefined,
              serviceFee: presetServiceFee ?? 0,
              tableId,
              totalAmount: orderTotalAmount,
            },
          },
        });
        return;
      }

      createOrderByTable({ shouldNavigateToBillOut: true });
      return;
    }

    if (isQueueOrder) {
      messageApi.open({
        type: "warning",
        content: t("tips.select_dish_first"),
      });
      return;
    }

    window.api.orders
      .getPendingOrderByTable({ table_id: tableId })
      .then((pendingOrder) => {
        if (!pendingOrder?.order_inner_no) {
          messageApi.open({
            type: "warning",
            content: t("tips.no_order_at_table"),
          });
          return;
        }

        navigate("/bill-out", {
          state: {
            orderInnerNo: pendingOrder.order_inner_no,
            tableUuid: pendingOrder.table_uuid ?? tableUuid,
          },
        });
      })
      .catch((error) => {
        messageApi.open({
          type: "error",
          content: error?.message || String(error),
        });
      });
  };

  // 餐后模式的桌码点餐允许先下单留在当前页面。
  const handlePlaceOrder = () => {
    createOrderByTable({ shouldNavigateToBillOut: false });
  };

  const handleTableClear = () => {
    clearTable(tableUuid, {
      onSuccess: () => navigate("/"),
    }).catch((error) => {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    });
  };

  // 订单操作dropdown
  const orderOperations = [
    {
      key: "COMPLETE",
      label: <div className="px-3 py-1.5">{t("components.complete")}</div>,
    },
    {
      key: "ORDER_LIST",
      label: <div className="px-3 py-1.5">{t("menu.order_list")}</div>,
    },
  ];

  const handleOrderOperationClick = ({ key }) => {
    switch (key) {
      case "ORDER_LIST":
        navigate(`/table-order-list?table_id=${tableId}`);
        break;

      case "COMPLETE":
        handleTableClear();
        break;
      default:
        break;
    }
  };

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      <div>
        <Header currentTitle={t("menu.menu_manage")} onTopPage={isQueueOrder}></Header>
        <AddProductContext.Provider value={addProduct}>
          <div className="flex h-[calc(100vh-64px)] overflow-hidden">
            {/* 左边：菜品 */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {visibleCategoryList.map((category) => (
                <CategoryClass category={category} key={category.id} addProduct={addProduct}></CategoryClass>
              ))}
            </div>

            {/* 右边：下单的菜品 */}
            <div className="flex h-full flex-col flex-none w-[398px] border-l border-line bg-empty pt-5">
              {/* dine in & take out */}
              {isQueueOrder ? (
                <div className="flex items-center justify-around pt-2">
                  <DineTypeButton
                    dineType={CUSTOMER_DINING_STYLE.DINING_ROOM}
                    activeDineType={customerDining}
                    setType={setCustomerDining}
                  ></DineTypeButton>
                  <DineTypeButton
                    dineType={CUSTOMER_DINING_STYLE.TAKE_AWAY}
                    activeDineType={customerDining}
                    setType={setCustomerDining}
                  ></DineTypeButton>
                </div>
              ) : (
                <div className="px-3">
                  <div className="w-full p-2 flex flex-row justify-between bg-white rounded-[4px] text-[15px]">
                    <span className="font-semibold">
                      {t("table_manage.table_no")}:{" "}
                      <span className="font-semibold text-primary">{tableDisplayName}</span>
                    </span>
                    <span className="font-semibold">
                      {t("table_manage.guest")}: <span className="text-primary font-semibold">{guestNumber}</span>
                      <span
                        className="text-danger cursor-pointer ml-1.5"
                        onClick={async () => modal.info(guestNumberModalConfig)}
                      >
                        <EditOutlined />
                      </span>
                    </span>
                  </div>
                </div>
              )}
              {/* order summary */}
              <div className="flex-1 min-h-0 px-3 mt-[14px] mb-3">
                <div className="flex h-full min-h-0 flex-col p-[14px] bg-white rounded-[4px]">
                  <div className="border-b border-line flex justify-between pb-2">
                    <span className="text-normal text-[18px] font-semibold">{t("menu.order_summary")}</span>
                    {hasSelectedDishes ? (
                      <span className="text-danger cursor-pointer" onClick={() => setMarkModalShow(true)}>
                        <EditOutlined />
                      </span>
                    ) : null}
                  </div>

                  {/* order summary list */}
                  <AnimatedList className="flex-1 min-h-0 overflow-y-auto">
                    {orderSummaryList.map((order) => (
                      <ProductDisplayItem
                        key={getDishKey(order)}
                        productItem={order}
                        removeProduct={removeProduct}
                        setProductCount={setProductCount}
                      ></ProductDisplayItem>
                    ))}
                  </AnimatedList>
                </div>
              </div>
              {/* 总价 & billout */}
              <div className="bg-white">
                <div className="px-6 py-3 text-normal text-[20px] flex items-center border-b border-line">
                  <span className="font-semibold flex-1">
                    {t("components.total")}
                    <span className="text-danger text-[14px] font-semibold">{t("order.incl_vat")}</span>
                  </span>
                  <RollingNumber className="font-semibold" value={`${currency_symbol} ${format(totalPrice)}`} />
                </div>
                {/* 排队点餐操作 : 桌码点餐操作 */}
                {isQueueOrder ? (
                  <div className="px-3 py-5 flex items-center justify-between gap-3">
                    {/* 在线订单入口暂不开放，保留代码位置便于后续恢复。 */}
                    {/* <div className="size-12 border-primary border-2 rounded-[24px] flex justify-center items-cente cursor-pointer">
                      <img src={OnlineOrder} alt="" className="w-6" />
                    </div> */}
                    <Badge count={uncompleteOrderCount} size="large" offset={[-8, 10]}>
                      <div
                        className="size-12 border-primary border-2 rounded-[24px] flex justify-center items-center cursor-pointer"
                        onClick={openPendingOrders}
                      >
                        <img src={OrderBtn} alt="" className="w-6" />
                      </div>
                    </Badge>

                    <Button className="bg-primary flex-1 h-[56px]" type="primary" size="large" onClick={handleBillOut}>
                      {/* 在点击bill out前，查询当前桌子是否存在未完成订单。不存在创建新订单，存在则创建子订单。
                  订单创建完毕后再跳转到结算页面，因为结算页面应该不需要桌台数据了 */}
                      {t("menu.bill_out")}
                    </Button>
                  </div>
                ) : (
                  <div className="px-3 py-5 flex items-center justify-between gap-3">
                    <Dropdown
                      menu={{
                        items: orderOperations,
                        onClick: handleOrderOperationClick,
                      }}
                    >
                      <img src={ExpandIcon} alt="" className="w-12 cursor-pointer" />
                    </Dropdown>
                    {isAfterMealTableOrder ? (
                      <Button
                        className="bg-primary w-[192px] h-[56px]"
                        color="primary"
                        size="large"
                        variant="outlined"
                        disabled={!hasSelectedDishes}
                        onClick={handlePlaceOrder}
                      >
                        {t("order.order")}
                      </Button>
                    ) : null}
                    <Button
                      className="bg-primary w-[192px] h-[56px]"
                      type="primary"
                      size="large"
                      onClick={handleBillOut}
                    >
                      {/* 在点击bill out前，查询当前桌子是否存在未完成订单。不存在创建新订单，存在则创建子订单。
                  订单创建完毕后再跳转到结算页面，因为结算页面应该不需要桌台数据了 */}
                      {t("menu.bill_out")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </AddProductContext.Provider>

        {/* Modals */}
        <AddOrderMarkModal
          showMarkModal={showMarkModal}
          closeMarkModal={() => setMarkModalShow(false)}
          value={orderRemark}
          onConfirm={(nextRemark) => {
            // 备注只绑定当前已选菜品订单，提交后随创建订单或结账临时订单带走。
            setOrderRemark(nextRemark);
            setMarkModalShow(false);
          }}
        ></AddOrderMarkModal>
        {pendingOrdersModalHolder}
      </div>
    </>
  );
};

CategoryClass.propTypes = {
  category: PropTypes.object,
  addProduct: PropTypes.func,
};

DineTypeButton.propTypes = {
  dineType: PropTypes.number,
  activeDineType: PropTypes.number,
  setType: PropTypes.func,
};
ProductDisplayItem.propTypes = {
  productItem: PropTypes.object,
  removeProduct: PropTypes.func,
  setProductCount: PropTypes.func,
};

RoundBtn.propTypes = {
  icon: PropTypes.node,
  onClick: PropTypes.func,
};

export default TableManage;
