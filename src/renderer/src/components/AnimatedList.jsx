import { AnimatePresence, motion } from "motion/react";
import PropTypes from "prop-types";
import { Children } from "react";

import "./AnimatedList.css";

const easeOut = [0.22, 1, 0.36, 1];

function AnimatedList({ children, className = "", itemClassName = "", gap, duration = 0.22, disabled = false }) {
  const items = Children.toArray(children);
  const classNames = ["animated-list", className].filter(Boolean).join(" ");
  const itemClassNames = ["animated-list__item", itemClassName].filter(Boolean).join(" ");
  const style =
    gap === undefined
      ? undefined
      : {
          "--animated-list-gap": typeof gap === "number" ? `${gap}px` : gap,
        };

  if (disabled) {
    return (
      <div className={classNames} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div className={classNames} style={style} layout>
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((child) => (
          <motion.div
            className={itemClassNames}
            key={child.key}
            layout
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{
              opacity: { duration: duration * 0.75, ease: "easeOut" },
              scale: { duration, ease: easeOut },
              y: { duration, ease: easeOut },
              layout: { duration, ease: easeOut },
            }}
          >
            {child}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

AnimatedList.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  itemClassName: PropTypes.string,
  gap: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  duration: PropTypes.number,
  disabled: PropTypes.bool,
};

export default AnimatedList;
