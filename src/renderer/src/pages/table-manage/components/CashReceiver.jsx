import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { DoubleLeftOutlined } from "@ant-design/icons";

import { format } from "@renderer/utils/MoneyUtils";
import PropTypes from "prop-types";
import { cloneDeep } from "lodash";

const keyBoards = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "clear"];

const getAmountInCents = (inputNumber) => {
  if (inputNumber.length === 0) return 0;

  const rawValue = inputNumber.join("");
  const [integerPart = "0", decimalPart = ""] = rawValue.split(".");
  const normalizedDecimalPart = `${decimalPart}00`.slice(0, 2);

  return Number(integerPart) * 100 + Number(normalizedDecimalPart);
};

const isTypingTarget = (target) => {
  if (!target) return false;

  const tagName = target.tagName?.toLowerCase();

  return tagName === "input" || tagName === "textarea" || target.isContentEditable === true;
};

const getNextInputNumber = (currentInputNumber, key, disabled) => {
  if (disabled) return currentInputNumber;

  if (currentInputNumber.length === 0) {
    if ([".", "0", "clear"].includes(key)) return currentInputNumber;
  }

  if (key === "clear") {
    const copyInput = cloneDeep(currentInputNumber);
    copyInput.splice(copyInput.length - 1);
    return copyInput;
  }

  if (key === ".") {
    if (currentInputNumber.includes(".")) return currentInputNumber;
  }

  if (currentInputNumber.includes(".") && currentInputNumber.indexOf(".") < currentInputNumber.length - 2) {
    return currentInputNumber;
  }

  return [...currentInputNumber, key];
};

const CashReceiver = ({ className, currencySymbol = "", disabled, totalAmount = 0, onAmountChange }) => {
  const { t } = useTranslation();
  const [inputNumber, setInputNumber] = useState([]);
  const inputNumberRef = useRef([]);
  const receivedAmount = useMemo(() => getAmountInCents(inputNumber), [inputNumber]);
  const change = useMemo(() => {
    return receivedAmount - totalAmount;
  }, [receivedAmount, totalAmount]);
  const displayInputAmount = inputNumber.length === 0 ? "0" : inputNumber.join("");

  useEffect(() => {
    onAmountChange?.(receivedAmount);
  }, [onAmountChange, receivedAmount]);

  useEffect(() => {
    inputNumberRef.current = inputNumber;
  }, [inputNumber]);

  const applyKey = useCallback(
    (key) => {
      const nextInputNumber = getNextInputNumber(inputNumberRef.current, key, disabled);

      inputNumberRef.current = nextInputNumber;
      setInputNumber(nextInputNumber);
    },
    [disabled],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      if (disabled) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        applyKey(event.key);
        return;
      }

      if (event.key === "." || event.code === "NumpadDecimal") {
        event.preventDefault();
        applyKey(".");
        return;
      }

      if (event.key === "Backspace" || event.code === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        applyKey("clear");
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [applyKey, disabled]);

  const pressKey = (key) => {
    applyKey(key);
  };
  return (
    <div className={`${className} flex flex-col bg-empty p-4`}>
      <div className="flex min-h-0 flex-1 flex-col text-normal text-[17px]">
        <span className="flex-none font-semibold">{t("table_manage.cash_received")}</span>
        <div className="my-3 px-[10px] py-[20px] bg-white w-full h-[114px] rounded-[4px] text-right">
          <span className="text-[64px] text-normal">
            {currencySymbol}
            {displayInputAmount}
          </span>
        </div>
        <div className="flex flex-none justify-between">
          <span className="font-semibold">{t("table_manage.change")}</span>
          <span className="font-semibold">
            {currencySymbol}
            {format(change)}
          </span>
        </div>
        {/* 只让空白区域出现在 Change 下方，键盘仍保持原来的底部定位逻辑。 */}
        <div className="min-h-4 flex-1"></div>
      </div>

      <div className="grid flex-none grid-cols-3 gap-4 mt-4">
        {keyBoards.map((key) => (
          <div
            key={key}
            className={`text-center h-13 leading-13 border rounded-[8px] transition-colors ${
              disabled ? "border-[#d9d9d9] bg-[#f5f5f5] cursor-not-allowed" : "border-primary cursor-pointer"
            }`}
            onClick={() => pressKey(key)}
          >
            <span className={`text-[17px] font-semibold ${disabled ? "text-[#bfbfbf]" : "text-primary"}`}>
              {key === "clear" ? <DoubleLeftOutlined /> : key}
            </span>
          </div>
        ))}
        <div
          className={`col-span-3 text-center h-13 leading-13 border rounded-[8px] transition-colors ${
            disabled ? "border-[#d9d9d9] bg-[#f5f5f5] cursor-not-allowed" : "border-primary cursor-pointer"
          }`}
          onClick={() => !disabled && setInputNumber([])}
        >
          <span className={`text-[17px] font-semibold ${disabled ? "text-[#bfbfbf]" : "text-primary"}`}>
            {t("components.clear")}
          </span>
        </div>
      </div>
    </div>
  );
};

CashReceiver.propTypes = {
  className: PropTypes.string,
  currencySymbol: PropTypes.string,
  disabled: PropTypes.bool,
  totalAmount: PropTypes.number,
  onAmountChange: PropTypes.func,
};

export default CashReceiver;
