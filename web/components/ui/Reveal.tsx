"use client";

import { useEffect, useRef } from "react";

/**
 * Fades its content up once as it scrolls into view. It never hides anything that is already on screen when the
 * page loads, and does nothing without JavaScript or under reduced motion, so content is never stuck invisible.
 * State lives in a data attribute (no re-render): wait → in. Styles in globals.css.
 */
/** `stagger`: the children come in one after another instead of the block as a whole. */
export function Reveal({ children, className, stagger }: { children: React.ReactNode; className?: string; stagger?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already visible: leave it alone
    el.dataset.reveal = "wait";
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        el.dataset.reveal = "in";
        io.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={stagger ? `cr-stagger ${className ?? ""}` : className}>
      {children}
    </div>
  );
}
