import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { TierBadge } from "@/components/ui/Badge";
import { ShortsIcon } from "@/components/ui/Icons";
import { compact, duration, timeLeft, usd } from "@/lib/format";
import type { Campaign } from "@/lib/types";

/** Campaign card: brand first, the per-1M-views rate as the hero number, budget left as a thin bar. */
export function CampaignCard({ campaign: c, now }: { campaign: Campaign; now: number }) {
  const free = Math.max(c.budget - c.reserved - c.paid, 0);
  const usedPct = c.budget > 0 ? ((c.reserved + c.paid) / c.budget) * 100 : 100;
  const closed = c.status !== "Active";
  return (
    <Link
      href={`/campaigns/${c.id}`}
      className="group flex h-full flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]"
    >
      <div className="flex items-center gap-3">
        <Avatar name={c.brandName} size={44} />
        <div className="min-w-0">
          <div className="flex items-center gap-1 font-semibold">
            <span className="truncate">{c.brandName}</span>
            {c.minTier > 0 && <TierBadge tier={c.minTier} />}
          </div>
          <div className="text-xs text-muted">
            {duration(Math.max(now - c.createdAt, 60))} ago · Per view · {closed ? "closed" : timeLeft(c.endsAt, now)}
          </div>
        </div>
      </div>
      <p className="line-clamp-2 min-h-10 text-[15px] font-medium leading-snug">{c.title}</p>
      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <ShortsIcon className="size-5" />
          <span>{compact(c.verifiedViews)} verified views</span>
        </div>
        <div className="text-right">
          <div className="tabular font-display text-2xl font-bold leading-none">{usd(c.cpm * 1000, { cents: false })}</div>
          <div className="eyebrow mt-1 !text-[10px] !tracking-[0.12em]">per 1M views</div>
        </div>
      </div>
      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-[#9b87ff]" style={{ width: `${Math.min(usedPct, 100)}%` }} />
        </div>
        <div className="tabular mt-1.5 flex justify-between text-[11px] text-muted">
          <span>{closed ? "Campaign closed" : `${usd(free, { cents: false })} budget left`}</span>
          <span>{c.clipsCount} clips</span>
        </div>
      </div>
    </Link>
  );
}
