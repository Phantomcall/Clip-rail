"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [used, setUsed] = useState(false); // the label only animates back after a copy, not on page load
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setUsed(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={cn("relative rounded-md px-2 py-1 text-xs font-semibold text-muted transition-[color,background-color,transform] duration-200 ease-out-soft after:absolute after:-inset-1.5 hover:bg-surface-2 hover:text-fg active:scale-95", className)}
      aria-live="polite"
    >
      {copied ? (
        <span key="done" className="inline-flex animate-pop-in items-center gap-1 text-money">
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m3.5 8.5 3 3 6-7" />
          </svg>
          Copied
        </span>
      ) : (
        <span key="idle" className={used ? "inline-block animate-pop-in" : "inline-block"}>
          {label}
        </span>
      )}
    </button>
  );
}
