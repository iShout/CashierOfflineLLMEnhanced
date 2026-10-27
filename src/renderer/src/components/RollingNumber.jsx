import { motion } from "motion/react";
import PropTypes from "prop-types";

const DIGITS = Array.from({ length: 10 }, (_, index) => index);

function RollingDigit({ value, duration, delay, className }) {
  return (
    <span className="rolling-number__digit" aria-hidden="true">
      <motion.span
        className="rolling-number__digit-track"
        initial={false}
        animate={{ y: `${-value}em` }}
        transition={{
          type: "spring",
          stiffness: 420,
          damping: 34,
          mass: 0.9,
          duration,
          delay,
        }}
      >
        {DIGITS.map((digit) => (
          <span className={`${className} rolling-number__digit-item`} key={digit}>
            {digit}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function RollingCharacter({ char, duration, delay, className }) {
  if (!/^\d$/.test(char)) {
    return (
      <span className="rolling-number__static" aria-hidden="true">
        {char}
      </span>
    );
  }

  const digit = Number(char);
  return <RollingDigit value={digit} duration={duration} delay={delay} className={className} />;
}

function RollingNumber({ value, className = "", duration = 0.35, stagger = 0.015, ariaLabel }) {
  const displayValue = String(value ?? "");
  const classNames = ["rolling-number", className].filter(Boolean).join(" ");

  return (
    <span className={classNames} aria-label={ariaLabel ?? displayValue}>
      {Array.from(displayValue).map((char, index) => (
        <RollingCharacter char={char} duration={duration} delay={index * stagger} key={index} className={className} />
      ))}
    </span>
  );
}

RollingDigit.propTypes = {
  value: PropTypes.number.isRequired,
  duration: PropTypes.number.isRequired,
  delay: PropTypes.number.isRequired,
  className: PropTypes.string,
};

RollingCharacter.propTypes = {
  char: PropTypes.string.isRequired,
  duration: PropTypes.number.isRequired,
  delay: PropTypes.number.isRequired,
  className: PropTypes.string,
};

RollingNumber.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
  duration: PropTypes.number,
  stagger: PropTypes.number,
  ariaLabel: PropTypes.string,
};

export default RollingNumber;
