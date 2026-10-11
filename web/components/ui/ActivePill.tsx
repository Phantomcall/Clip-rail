"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";

/**
 * The background of the selected tab or link. Every pill with the same `id` is one shared element, so when the
 * selection moves it glides there instead of jumping. Its parent needs `relative isolate`.
 */
export function ActivePill({ id, className }: { id: string; className?: string }) {
  return (
    <motion.span
      layoutId={id}
      aria-hidden
      className={cn("absolute inset-0 -z-10 rounded-full", className)}
      transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
    />
  );
}
