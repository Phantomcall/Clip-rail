import { Tip } from "@/components/ui/Tip";
import type { BrandStats } from "@/lib/types";

/**
 * A brand's dispute record, shown before a clipper joins. Brands judge their own flags (audit R-4), so their history
 * is public: how many of the clips that earned in their campaigns they later rejected.
 */
export function BrandRecord({ stats }: { stats: BrandStats }) {
  const { clipsEarning: n, rejects, flags } = stats;
  const rate = n > 0 ? rejects / n : 0;
  const tone = n === 0 ? "text-muted" : rate < 0.05 ? "text-money" : rate < 0.2 ? "text-holding" : "text-danger";
  return (
    <Tip content="Brands can flag a clip during the hold window and reject it. Rejected earnings go back to the brand, so check how often this brand does it.">
      <div className="cursor-help rounded-[var(--radius-control)] border border-line bg-surface-2/60 p-3" tabIndex={0}>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Brand reject rate ⓘ</span>
          <span className={`tabular font-display text-base font-bold ${tone}`}>{n === 0 ? "New" : `${Math.round(rate * 100)}%`}</span>
        </div>
        <p className="tabular mt-1 text-xs text-muted">
          {n === 0
            ? "No clips have earned with this brand yet."
            : `${rejects} of ${n} paid ${n === 1 ? "clip" : "clips"} rejected · ${flags} ${flags === 1 ? "flag" : "flags"} raised`}
        </p>
      </div>
    </Tip>
  );
}
