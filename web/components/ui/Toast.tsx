"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/cn";
import { txUrl } from "@/lib/format";
import { ExternalIcon } from "@/components/ui/Icons";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  txHash?: string;
}

const ToastContext = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 6000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:right-6 sm:left-auto">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } }}
              transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}
              role="status"
              className={cn(
                "pointer-events-auto w-full max-w-sm rounded-[var(--radius-control)] border bg-surface px-4 py-3 text-sm shadow-xl",
                t.tone === "success" && "border-money/40",
                t.tone === "error" && "border-danger/50",
                t.tone === "info" && "border-line",
              )}
            >
              <div className="font-semibold">{t.title}</div>
              {t.txHash && (
                <a href={txUrl(t.txHash)} target="_blank" rel="noreferrer" className="text-xs text-accent-hover hover:underline">
                  View transaction <ExternalIcon className="inline size-3" />
                </a>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
