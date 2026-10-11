import { cn } from "@/lib/cn";

/**
 * Wordmark: the Rail C mark + "Cliprail". Two rails bend into a C and a green play head leaves it: a clip running
 * on a payment rail. The tile's gradient is CSS (no SVG gradient ids), so the logo can appear more than once on a
 * page. This is the simplified mark for small sizes; app/icon.svg and the app icons carry the same geometry, and
 * the large icons add the rail ties.
 */
export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2 font-display text-lg font-bold tracking-tight", inverted ? "text-white" : "text-fg", className)}>
      <span className="grid size-7 shrink-0 place-items-center rounded-[28%] bg-gradient-to-br from-[#9b86ff] to-[#5b3ff0] shadow-[0_4px_12px_-4px_rgb(91_63_240/0.6)]">
        <svg viewBox="0 0 64 64" className="size-7" aria-hidden>
          <path d="M42.01 20.29 A17.5 17.5 0 1 0 42.01 43.71" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" />
          <path d="M35.95 24.81 A10 10 0 1 0 35.95 39.19" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" />
          <path d="M44.6 25.4 C43.6 24.8 42.4 25.5 42.4 26.7 V37.3 C42.4 38.5 43.6 39.2 44.6 38.6 L53.6 33.3 C54.6 32.7 54.6 31.3 53.6 30.7 Z" fill="#2bd98a" />
        </svg>
      </span>
      Cliprail
    </span>
  );
}
