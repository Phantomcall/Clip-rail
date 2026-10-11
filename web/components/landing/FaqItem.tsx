"use client";

import { useId, useState } from "react";

/** One question: the answer opens and closes smoothly (grid rows 0fr → 1fr animates to the content's height). */
export function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-b border-line py-4 last:border-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        id={`${id}-q`}
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full cursor-pointer items-center justify-between gap-4 text-left font-medium"
      >
        <span className="transition-colors duration-200 group-hover:text-accent-solid-hover dark:group-hover:text-[#c9bfff]">{q}</span>
        <span
          aria-hidden
          className={`grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-solid-hover transition-[transform,background-color] duration-300 ease-out-soft group-hover:scale-110 dark:bg-accent/20 dark:text-[#c9bfff] ${open ? "rotate-45" : ""}`}
        >
          +
        </span>
      </button>
      <div
        id={id}
        role="region"
        aria-labelledby={`${id}-q`}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out-soft ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <p className="pt-2 pr-10 text-sm text-muted">{a}</p>
        </div>
      </div>
    </div>
  );
}
