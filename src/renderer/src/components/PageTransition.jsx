import { motion } from "motion/react";

import { useLocation, useOutlet } from "react-router";

const pageTransition = {
  initial: {
    opacity: 0,
    x: 30,
    filter: "blur(2px)",
  },
  animate: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
  },
};

function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <motion.div
      key={location.pathname}
      variants={pageTransition}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="page-transition"
    >
      {outlet}
    </motion.div>
  );
}

export default PageTransition;
