import { compact, usd } from "@/lib/format";
import type { Totals } from "@/lib/types";

export function StatStrip({ totals }: { totals: Totals }) {
  const stats = [
    [usd(totals.paid, { cents: false }), "paid to clippers"],
    [`${totals.clippers}+`, "clippers"],
    [compact(totals.verifiedViews), "verified views"],
    [String(totals.payouts), "onchain payouts"],
  ];
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-2 divide-line overflow-hidden glass rounded-2xl sm:grid-cols-4 sm:divide-x">
      {stats.map(([v, l]) => (
        <div key={l} className="px-4 py-4 text-center">
          <div className="tabular font-display text-2xl font-bold">{v}</div>
          <div className="text-xs text-muted">{l}</div>
        </div>
      ))}
    </div>
  );
}
