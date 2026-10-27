import { MinusOutlined, PlusOutlined } from "@ant-design/icons";
import PropTypes from "prop-types";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const DEFAULT_MAX = 999;

const QuantityStepper = ({ value, min = 0, max = DEFAULT_MAX, onChange, allowIncrease = true, className = "" }) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const normalizedMin = Number.isFinite(Number(min)) ? Math.trunc(Number(min)) : 0;
  const normalizedMax = Number.isFinite(Number(max)) ? Math.max(normalizedMin, Math.trunc(Number(max))) : DEFAULT_MAX;
  const numericValue = Number(value);
  const currentValue = Number.isFinite(numericValue)
    ? Math.min(Math.max(Math.trunc(numericValue), normalizedMin), normalizedMax)
    : normalizedMin;
  const canDecrease = currentValue > normalizedMin;
  const canIncrease = allowIncrease && currentValue < normalizedMax;

  const updateValue = (nextValue) => {
    const boundedValue = Math.min(Math.max(Math.trunc(nextValue), normalizedMin), normalizedMax);
    if (boundedValue !== currentValue) {
      onChange?.(boundedValue);
    }
  };

  const startEditing = () => {
    setInputValue(String(currentValue));
    setIsEditing(true);
  };

  // 手动输入只保留非负整数，并立即把超过上限的值收敛到允许的最大值。
  const handleInputChange = (event) => {
    const digits = event.target.value.replace(/\D/g, "");
    if (!digits) {
      setInputValue("");
      return;
    }

    const editableMax = allowIncrease ? normalizedMax : currentValue;
    setInputValue(String(Math.min(Number(digits), editableMax)));
  };

  // Enter 和失焦共用保存逻辑；空输入保持原数量不变。
  const saveInputValue = () => {
    if (inputValue !== "") {
      updateValue(Number(inputValue));
    }
    setIsEditing(false);
  };

  return (
    <div className={`flex ${className}`}>
      <div
        className={`size-6 text-center leading-6 ${
          canDecrease ? "bg-danger text-white cursor-pointer" : "bg-[#eeeeee] text-[#afafaf] cursor-not-allowed"
        }`}
        onClick={() => canDecrease && updateValue(currentValue - 1)}
      >
        <MinusOutlined />
      </div>
      {isEditing ? (
        <input
          autoFocus
          aria-label={t("order.quantity")}
          className="h-6 w-9 border border-primary px-1 text-center leading-6 outline-none"
          inputMode="numeric"
          value={inputValue}
          onBlur={saveInputValue}
          onChange={handleInputChange}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              saveInputValue();
            }
          }}
        />
      ) : (
        <span className="min-w-9 cursor-text px-1 text-center leading-6" onClick={startEditing}>
          {currentValue}
        </span>
      )}
      <div
        className={`size-6 text-center leading-6 font-bold ${
          canIncrease ? "bg-info text-white cursor-pointer" : "bg-[#eeeeee] text-[#afafaf] cursor-not-allowed"
        }`}
        onClick={() => canIncrease && updateValue(currentValue + 1)}
      >
        <PlusOutlined />
      </div>
    </div>
  );
};

QuantityStepper.propTypes = {
  value: PropTypes.number,
  min: PropTypes.number,
  max: PropTypes.number,
  onChange: PropTypes.func,
  allowIncrease: PropTypes.bool,
  className: PropTypes.string,
};

export default QuantityStepper;
