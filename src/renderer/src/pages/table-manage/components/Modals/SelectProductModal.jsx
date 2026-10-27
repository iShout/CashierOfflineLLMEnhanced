import { Modal, Radio, message } from "antd";
import { useState, useImperativeHandle, forwardRef, useContext, useMemo, useCallback } from "react";
import { cloneDeep } from "lodash";
import { useTranslation } from "react-i18next";
import { format } from "@renderer/utils/MoneyUtils";
import CONSTANTS from "../../../../const";
import { AddProductContext } from "@renderer/context/TableManageContext.js";

const { REQUIRED_TYPE } = CONSTANTS;

const SelectProductModal = forwardRef((props, ref) => {
  const addProduct = useContext(AddProductContext);
  const [messageApi, contextHolder] = message.useMessage();
  const [productDetail, setProductDetail] = useState(null);
  const { name, spec_list = [], option_list = [] } = productDetail || {};
  const { t } = useTranslation();
  const [isModalShow, setIsModalShow] = useState(false);
  const [selectedSpec, setSpec] = useState("");
  // 加料有多个列表，所以设置其为数组
  const [selectOptions, setOptions] = useState([]);

  //点击确认
  const confirmAddProduct = () => {
    if (!validateAddProd()) {
      messageApi.open({
        type: "error",
        content: t("tips.check_required_options"),
      });
      return;
    }
    const selectedProduct = cloneDeep(productDetail);
    const specDetail = getSpecDetail(selectedSpec);
    let optionDetailsList = [];
    if (Array.isArray(selectOptions) && selectOptions.length > 0) {
      optionDetailsList = getOptionDetailList(selectOptions);
    }

    const extraInfos = {
      sku_no: specDetail.sku_no,
      sku_name: specDetail.sku_name,
      price: totalPrice,
      count: 1,
      option_list: optionDetailsList,
      currentDish: specDetail,
    };

    addProduct({ ...selectedProduct, ...extraInfos });
    setIsModalShow(false);
  };
  /**
   * 获取选中的规格详情
   * @param {String} specNo
   * @returns 规格详情数据
   */
  const getSpecDetail = useCallback(
    (specNo) => {
      return spec_list[0]?.dish_product_spec_item_list.find((spec) => spec.spec_item_no === specNo);
    },
    [spec_list],
  );
  /**
   * 获取选中的加料详情
   * @param {*} options 含有加料no的数组，[] 或者[[],[]]都有可能
   * @returns 含有小料信息的数组
   */
  const getOptionDetailList = useCallback(
    (options) => {
      if (options.length === 0) return [];
      const resList = [];
      for (let i = 0; i < options.length; i++) {
        if (!options[i]) continue;
        const currentOption = option_list[i];
        if (!currentOption) continue;

        let selectedOptionItems = [];
        if (typeof options[i] === "string") {
          const detail = currentOption.option_item_list.find((op) => op.option_item_no === options[i]);
          selectedOptionItems = detail ? [detail] : [];
        } else {
          selectedOptionItems = currentOption.option_item_list.filter((op) => options[i].includes(op.option_item_no));
        }

        if (selectedOptionItems.length === 0) continue;

        resList.push({
          option_name: currentOption.name,
          option_no: currentOption.option_no,
          option_item_list: selectedOptionItems,
        });
      }
      return resList;
    },
    [option_list],
  );

  // 计算总价
  const totalPrice = useMemo(() => {
    let total;
    const specDetail = getSpecDetail(selectedSpec);
    const optionDetailList = getOptionDetailList(selectOptions);
    if (Array.isArray(optionDetailList) && optionDetailList.length === 0) {
      total = specDetail?.price;
    } else {
      total = specDetail?.price;
      optionDetailList.forEach((optionGroup) => {
        optionGroup.option_item_list.forEach((op) => {
          total = total + op?.price;
        });
      });
    }
    return total;
  }, [selectedSpec, selectOptions, getSpecDetail, getOptionDetailList]);

  /**
   * 在确认添加前，对是否选中了必选进行校验
   */
  const validateAddProd = () => {
    if (!selectedSpec) return false;
    const requiredOptIndexs = [];
    option_list.forEach((item, index) => {
      if (item.required_type === REQUIRED_TYPE.YES) requiredOptIndexs.push(index);
    });
    if (requiredOptIndexs.length > 0) {
      for (let i = 0; i < requiredOptIndexs.length; i++) {
        const idx = requiredOptIndexs[i];
        if (!selectOptions[idx]) return false;
      }
    }
    return true;
  };

  // 选择规格的回调
  const onSelectSpec = (e) => {
    const newVal = e.target.value;
    setSpec(newVal);
  };
  // 选择加料的回调
  const onSelectOptions = (e, index) => {
    const newVal = e.target.value;
    const currentOptions = cloneDeep(selectOptions);
    currentOptions[index] = newVal;
    setOptions(currentOptions);
  };
  // 弹窗关闭后的回调
  const closedCallback = () => {
    setSpec("");
    setOptions([]);
  };

  useImperativeHandle(
    ref,
    () => ({
      showModal: (data) => {
        setProductDetail(data);
        const { spec_list } = data;
        const defaultSpec = spec_list[0]?.dish_product_spec_item_list[0];
        setSpec(defaultSpec.spec_item_no);
        setIsModalShow(true);
      },
    }),
    [],
  );
  return (
    <>
      {contextHolder}
      <Modal
        title={
          <div className="border-b border-line text-primary pb-3">
            <span className="font-semibold">{t("order.order_item")}</span>
          </div>
        }
        afterClose={closedCallback}
        mask={{ blur: true }}
        closable={{ "aria-label": t("components.close") }}
        open={isModalShow}
        onOk={confirmAddProduct}
        onCancel={() => {
          setIsModalShow(false);
        }}
      >
        {/* 商品名 -- 总价 */}
        <div className="text-[17px] text-[#4b5567] flex items-center">
          <span className="flex-1 font-semibold">{name}</span>
          <span className="font-semibold">{format(totalPrice)}</span>
        </div>
        {/* 规格 */}
        <div className="w-full h-fit border border-line rounded-[4px] my-4">
          <div className="px-4 py-2 flex items-center border-b border-line">
            <span className="text-[15px] text-[#4b5567] flex-1 font-semibold">{t("table_manage.variations")}</span>
            <span className="text-[12px] text-danger">{t("table_manage.required")}</span>
          </div>
          <div className="py-3 px-4 w-full">
            <Radio.Group
              className="radio-item-w-full"
              value={selectedSpec}
              onChange={onSelectSpec}
              vertical
              block
              options={spec_list[0]?.dish_product_spec_item_list.map((spec) => ({
                value: spec.spec_item_no,
                label: (
                  <div className="w-full flex items-center">
                    <span className="flex-1">{spec.name}</span>
                    <span className="flex-none text-right">{format(spec.price)}</span>
                  </div>
                ),
              }))}
            ></Radio.Group>
          </div>
        </div>

        {/* 加料 */}
        <div>
          {option_list.map((option, optionIndex) => (
            <div key={option.option_no} className="w-full h-fit border border-line rounded-[4px] my-4">
              <div className="px-4 py-2 flex items-center border-b border-line">
                <span className="text-[15px] text-[#4b5567] flex-1 font-semibold">{option.name}</span>
                <span className="text-[12px] text-danger">
                  {option.required_type === REQUIRED_TYPE.YES && t("table_manage.required")}
                </span>
              </div>
              <div className="py-3 px-4 w-full">
                <Radio.Group
                  className="radio-item-w-full"
                  value={selectOptions[optionIndex]}
                  onChange={(e) => onSelectOptions(e, optionIndex)}
                  vertical
                  block
                  options={option.option_item_list.map((optionItem) => ({
                    value: optionItem.option_item_no,
                    label: (
                      <div className="w-full flex items-center">
                        <span className="flex-1">{optionItem.name}</span>
                        <span className="flex-none text-right">{format(optionItem.price)}</span>
                      </div>
                    ),
                  }))}
                ></Radio.Group>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
});

SelectProductModal.displayName = "SelectProductModal";
export default SelectProductModal;
