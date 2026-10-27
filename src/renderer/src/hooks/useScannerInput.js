import { useCallback, useEffect, useRef } from "react";

const IGNORED_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock", "ScrollLock"]);

const SYMBOL_MAPPING = [
  ["，", ","],
  ["。", "."],
  ["；", ";"],
  ["：", ":"],
  ["、", ","],
  ["【", "["],
  ["】", "]"],
  ["（", "("],
  ["）", ")"],
  ["《", "<"],
  ["》", ">"],
  ["——", "-"],
  ["…", "..."],
  ["“", '"'],
  ["”", '"'],
  ["‘", "'"],
  ["’", "'"],
  ["！", "!"],
  ["？", "?"],
  ["～", "~"],
  ["￥", "$"],
  ["¥", "$"],
  ["「", "{"],
  ["」", "}"],
  ["『", "["],
  ["』", "]"],
  ["＠", "@"],
  ["＆", "&"],
  ["＊", "*"],
  ["＋", "+"],
  ["＝", "="],
  ["＜", "<"],
  ["＞", ">"],
  ["／", "/"],
  ["＼", "\\"],
  ["＿", "_"],
  ["０", "0"],
  ["１", "1"],
  ["２", "2"],
  ["３", "3"],
  ["４", "4"],
  ["５", "5"],
  ["６", "6"],
  ["７", "7"],
  ["８", "8"],
  ["９", "9"],
];

const translateSymbol = (value) =>
  SYMBOL_MAPPING.reduce((nextValue, [source, target]) => nextValue.replaceAll(source, target), value);

export default function useScannerInput({ enabled, onScan }) {
  const bufferRef = useRef("");
  const keyEventByScannerRef = useRef(null);
  const lastTimePressKeyRef = useRef(null);
  const clearTimerRef = useRef(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const resetScannerState = useCallback(() => {
    bufferRef.current = "";
    keyEventByScannerRef.current = null;
    lastTimePressKeyRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) {
      resetScannerState();
      return undefined;
    }

    const clearLastKey = () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }

      clearTimerRef.current = setTimeout(() => {
        lastTimePressKeyRef.current = null;
        keyEventByScannerRef.current = null;
      }, 500);
    };

    const onKeyDown = (event) => {
      const eventKey = event.key;

      // 扫码枪通常以高速键盘输入结束于 Enter，低速输入按普通人工输入丢弃。
      if (!lastTimePressKeyRef.current) {
        if (!IGNORED_KEYS.has(eventKey)) {
          bufferRef.current = eventKey;
        }
        lastTimePressKeyRef.current = event.timeStamp;
      } else if (keyEventByScannerRef.current === null) {
        if (event.timeStamp - lastTimePressKeyRef.current < 20) {
          keyEventByScannerRef.current = true;
        } else {
          keyEventByScannerRef.current = false;
          bufferRef.current = "";
        }
      }

      if (keyEventByScannerRef.current) {
        event.preventDefault();

        if (IGNORED_KEYS.has(eventKey)) {
          return;
        }

        if (eventKey !== "Enter") {
          bufferRef.current = `${bufferRef.current}${eventKey}`;
        } else {
          const content = translateSymbol(bufferRef.current);
          bufferRef.current = "";
          onScanRef.current?.(content);
        }
      }

      clearLastKey();
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      resetScannerState();
    };
  }, [enabled, resetScannerState]);
}
