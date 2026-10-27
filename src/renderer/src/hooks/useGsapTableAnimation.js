import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";

const DEFAULT_OPTIONS = {
  duration: 0.28,
  ease: "power2.out",
  rowSelector: ".ant-table-tbody > tr[data-row-key]",
};

const canUseReducedMotion = () => {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
};

const getRows = (container, rowSelector) => {
  if (!container) return [];
  return Array.from(container.querySelectorAll(rowSelector)).filter(
    (row) => !row.classList.contains("ant-table-measure-row"),
  );
};

const getRowKey = (row, index) => {
  return row.getAttribute("data-row-key") ?? `row-${index}`;
};

const measureTable = (container, rowSelector) => {
  const rows = getRows(container, rowSelector);
  const rowRects = new Map();

  rows.forEach((row, index) => {
    rowRects.set(getRowKey(row, index), {
      top: row.offsetTop,
    });
  });

  return {
    height: container?.offsetHeight ?? 0,
    rowRects,
    rows,
  };
};

// AntD Table 数据变化时，平滑过渡表格高度、新行淡入、已有行位移。
export function useGsapTableAnimation(containerRef, dependencies = [], options = {}) {
  const previousMeasureRef = useRef(null);
  const frameRef = useRef(null);
  const latestOptionsRef = useRef({ ...DEFAULT_OPTIONS, ...options });
  const dependencyKey = dependencies.map((dependency) => String(dependency)).join("|");

  latestOptionsRef.current = { ...DEFAULT_OPTIONS, ...options };

  useLayoutEffect(() => {
    const container = containerRef.current;
    const { duration, ease, rowSelector } = latestOptionsRef.current;
    const nextMeasure = measureTable(container, rowSelector);
    const previousMeasure = previousMeasureRef.current;

    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (!container || !previousMeasure || canUseReducedMotion()) {
      previousMeasureRef.current = nextMeasure;
      return undefined;
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;

      if (previousMeasure.height !== nextMeasure.height) {
        gsap.fromTo(
          container,
          {
            height: previousMeasure.height,
            overflow: "hidden",
          },
          {
            height: nextMeasure.height,
            duration,
            ease,
            overwrite: "auto",
            clearProps: "height,overflow",
          },
        );
      }

      nextMeasure.rows.forEach((row, index) => {
        const rowKey = getRowKey(row, index);
        const previousRect = previousMeasure.rowRects.get(rowKey);
        const nextRect = nextMeasure.rowRects.get(rowKey);

        if (!previousRect || !nextRect) {
          gsap.fromTo(
            row,
            { autoAlpha: 0, y: 8 },
            {
              autoAlpha: 1,
              y: 0,
              duration: duration * 0.85,
              ease,
              overwrite: "auto",
              clearProps: "opacity,visibility,transform",
            },
          );
          return;
        }

        const deltaY = previousRect.top - nextRect.top;
        if (Math.abs(deltaY) < 0.5) return;

        gsap.fromTo(
          row,
          { y: deltaY },
          {
            y: 0,
            duration,
            ease,
            overwrite: "auto",
            clearProps: "transform",
          },
        );
      });
    });

    previousMeasureRef.current = nextMeasure;

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      gsap.killTweensOf([container, ...nextMeasure.rows].filter(Boolean));
    };
    // dependencyKey 由调用方的数据源身份生成，避免把数组对象本身塞进 effect 依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependencyKey]);
}

export default useGsapTableAnimation;
