"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A muted, looping background video. Plays only while on screen, shows its poster for reduced-motion users, and never
 * downloads until it's near the viewport.
 */
export function LoopVideo({ src, poster, className }: { src: string; poster: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setLoad(true);
          if (!reduce) void v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video ref={ref} poster={poster} muted loop playsInline preload="none" aria-hidden className={className}>
      {load && <source src={src} type="video/mp4" />}
    </video>
  );
}
