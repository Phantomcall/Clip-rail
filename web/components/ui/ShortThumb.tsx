import { cn } from "@/lib/cn";
import { compact } from "@/lib/format";
import { PlayIcon } from "@/components/ui/Icons";

/**
 * A vertical "Short" drawn with CSS: gradient scene, bold caption, view count.
 * Stands in for real clip thumbnails until live campaign clips exist (then use i.ytimg.com thumbnails).
 */
export function ShortThumb({
  caption,
  views,
  hue = 262,
  className,
  paid,
}: {
  caption: string;
  views?: number;
  hue?: number;
  className?: string;
  paid?: string;
}) {
  return (
    <div
      className={cn("relative aspect-[9/16] overflow-hidden rounded-2xl text-white shadow-[var(--shadow-float)]", className)}
      style={{
        background: `radial-gradient(80% 50% at 30% 30%, hsl(${hue} 90% 70% / .9), transparent 70%),
          radial-gradient(70% 60% at 80% 85%, hsl(${(hue + 60) % 360} 85% 55% / .85), transparent 70%),
          linear-gradient(160deg, hsl(${hue} 45% 22%), hsl(${(hue + 30) % 360} 50% 12%))`,
      }}
    >
      <div className="absolute inset-x-0 top-[38%] px-3 text-center">
        <span className="inline bg-black/70 box-decoration-clone px-1.5 py-0.5 font-display text-[13px] font-bold leading-relaxed uppercase">
          {caption}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/60 to-transparent p-2.5 pt-8 text-[11px] font-semibold">
        {views !== undefined && <span className="inline-flex items-center gap-1"><PlayIcon /> {compact(views)}</span>}
        {paid && <span className="rounded-full bg-money px-2 py-0.5 text-[10px]">{paid}</span>}
      </div>
    </div>
  );
}
