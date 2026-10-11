"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Creator = { src: string; caption: string; alt: string };

const INTERVAL_MS = 3200;
const SWIPE_PX = 40;

/**
 * A stacked carousel: the active card sits in the centre, its neighbours peek out behind it, smaller and dimmed,
 * and every few seconds the next one glides forward. Swipe, tap a side card or use the dots. It pauses while
 * touched or hovered and while off screen, and doesn't auto-advance under reduced motion.
 */
export function CreatorCarousel({ items, className }: { items: Creator[]; className?: string }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const n = items.length;

  const go = useCallback((i: number) => setActive(((i % n) + n) % n), [n]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !visible || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setTimeout(() => go(active + 1), INTERVAL_MS);
    return () => clearTimeout(id);
  }, [active, paused, visible, go]);

  return (
    <div
      ref={root}
      role="region"
      aria-roledescription="carousel"
      aria-label="Creators on Cliprail"
      className={cn("select-none", className)}
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div
        className="relative mx-auto aspect-[4/5] w-[66%] max-w-72 touch-pan-y"
        onPointerDown={(e) => {
          startX.current = e.clientX;
          setPaused(true);
          e.currentTarget.setPointerCapture(e.pointerId); // the release still counts if the finger ends off the stack
        }}
        onPointerUp={(e) => {
          if (startX.current !== null) {
            const dx = e.clientX - startX.current;
            const box = e.currentTarget.getBoundingClientRect();
            if (dx < -SWIPE_PX) go(active + 1);
            else if (dx > SWIPE_PX) go(active - 1);
            // a tap on a card peeking out to either side brings it forward
            else if (Math.abs(dx) < 8 && e.clientX > box.right) go(active + 1);
            else if (Math.abs(dx) < 8 && e.clientX < box.left) go(active - 1);
          }
          startX.current = null;
          setPaused(false);
        }}
        onPointerCancel={() => {
          startX.current = null;
          setPaused(false);
        }}
      >
        {items.map((c, i) => {
          // position relative to the active card, wrapped so the stack is endless: -1 left, 0 centre, 1 right
          let d = i - active;
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
          const side = Math.abs(d) === 1;
          const hidden = Math.abs(d) > 1;
          return (
            <figure
              key={c.src}
              aria-hidden={d !== 0}
              aria-label={`${i + 1} of ${n}: ${c.caption}`}
              className={cn(
                "absolute inset-0 overflow-hidden rounded-3xl shadow-[0_24px_50px_-24px_rgb(10_20_60/0.6)] transition-[transform,opacity,filter] duration-700 ease-out-soft",
                side && "cursor-pointer",
              )}
              style={{
                transform: `translateX(${d * 58}%) scale(${d === 0 ? 1 : hidden ? 0.7 : 0.82})`,
                opacity: hidden ? 0 : side ? 0.75 : 1,
                filter: d === 0 ? "none" : "brightness(0.7) saturate(0.9)",
                zIndex: d === 0 ? 30 : side ? 20 : 10,
              }}
            >
              <Image src={c.src} alt={c.alt} fill sizes="18rem" draggable={false} className="object-cover" />
              <figcaption
                className={cn(
                  "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12 text-sm font-semibold text-white transition-opacity duration-500",
                  d === 0 ? "opacity-100" : "opacity-0",
                )}
              >
                {c.caption}
              </figcaption>
            </figure>
          );
        })}
      </div>

      <div className="mt-5 flex justify-center gap-1.5" role="group" aria-label="Choose a creator">
        {items.map((c, i) => (
          <button
            key={c.src}
            type="button"
            aria-label={`Show ${c.caption}`}
            aria-current={i === active}
            onClick={() => go(i)}
            className="grid h-6 place-items-center px-1"
          >
            <span className={cn("block h-1.5 rounded-full transition-all duration-500 ease-out-soft", i === active ? "w-6 bg-accent" : "w-1.5 bg-fg/25")} />
          </button>
        ))}
      </div>
    </div>
  );
}
