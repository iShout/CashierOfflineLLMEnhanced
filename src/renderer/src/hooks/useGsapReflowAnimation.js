import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";

const DEFAULT_OPTIONS = {
  duration: 0.32,
  ease: "power3.out",
  stagger: 0.012,
  itemSelector: ":scope > *",
};

const getDirectItems = (container, selector) => {
  if (!container) return [];

  try {
    return Array.from(container.querySelectorAll(selector));
  } catch {
    return Array.from(container.children);
  }
};

const canUseReducedMotion = () => {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
};

const getLayoutRect = (item) => {
  return {
    left: item.offsetLeft,
    top: item.offsetTop,
  };
};

// 记录包裹层子元素重排前后位置，并使用 GSAP transform 补间移动。
export function useGsapReflowAnimation(containerRef, dependencies = [], options = {}) {
  const previousRectsRef = useRef(new WeakMap());
  const initializedRef = useRef(false);
  const frameRef = useRef(null);
  const latestOptionsRef = useRef({ ...DEFAULT_OPTIONS, ...options });
  const dependencyKey = dependencies.map((dependency) => String(dependency)).join("|");

  latestOptionsRef.current = { ...DEFAULT_OPTIONS, ...options };

  const measureItems = () => {
    const container = containerRef.current;
    const { itemSelector } = latestOptionsRef.current;
    const items = getDirectItems(container, itemSelector);
    const nextRects = new WeakMap();

    items.forEach((item) => {
      nextRects.set(item, getLayoutRect(item));
    });

    return { items, nextRects };
  };

  const snapshot = () => {
    previousRectsRef.current = measureItems().nextRects;
    initializedRef.current = true;
  };

  const animate = () => {
    const { duration, ease, stagger } = latestOptionsRef.current;
    const previousRects = previousRectsRef.current;
    const { items, nextRects } = measureItems();
    const reduceMotion = canUseReducedMotion();
    let movingIndex = 0;

    if (!initializedRef.current || reduceMotion) {
      previousRectsRef.current = nextRects;
      initializedRef.current = true;
      return;
    }

    items.forEach((item) => {
      const previousRect = previousRects.get(item);
      const nextRect = nextRects.get(item);

      if (!previousRect || !nextRect) {
        const delay = movingIndex * stagger;
        movingIndex += 1;
        gsap.fromTo(
          item,
          { autoAlpha: 0, scale: 0.98 },
          {
            autoAlpha: 1,
            scale: 1,
            duration: duration * 0.75,
            delay,
            ease,
            overwrite: "auto",
            clearProps: "opacity,visibility,transform",
          },
        );
        return;
      }

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

      const delay = movingIndex * stagger;
      movingIndex += 1;
      gsap.fromTo(
        item,
        { x: deltaX, y: deltaY },
        {
          x: 0,
          y: 0,
          duration,
          delay,
          ease,
          overwrite: "auto",
          clearProps: "transform",
        },
      );
    });

    previousRectsRef.current = nextRects;
  };

  const scheduleAnimation = () => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      animate();
    });
  };

  useLayoutEffect(() => {
    snapshot();

    const container = containerRef.current;
    if (!container) return undefined;

    const resizeObserver = new ResizeObserver(scheduleAnimation);
    const mutationObserver = new MutationObserver(scheduleAnimation);

    resizeObserver.observe(container);
    mutationObserver.observe(container, { childList: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      gsap.killTweensOf(getDirectItems(container, latestOptionsRef.current.itemSelector));
    };
    // containerRef 是稳定的组件 ref；其余运行时选项通过 latestOptionsRef 获取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  useLayoutEffect(() => {
    scheduleAnimation();
    // dependencyKey 由调用方传入的列表生成，用于数据变化后触发一次重排检查。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependencyKey]);
}

export default useGsapReflowAnimation;
