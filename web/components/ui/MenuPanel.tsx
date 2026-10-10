"use client";

import { AnimatePresence, motion } from "motion/react";

/** A dropdown that grows from its corner and fades back out (MotionConfig turns this off under reduced motion). */
export function MenuPanel({ open, className, children }: { open: boolean; className?: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="menu"
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "top right" }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
