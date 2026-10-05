import { cn } from "@/lib/cn";
import type { CampaignStatus, ClipStatus, Tier } from "@/lib/types";

type Status = ClipStatus | CampaignStatus;

const tone: Record<Status, string> = {
  Pending: "bg-info/15 text-info",
  Active: "bg-accent/15 text-accent-hover",
  Flagged: "bg-danger/15 text-danger",
  Rejected: "bg-danger/10 text-danger/70 line-through decoration-1",
  Ended: "bg-surface-2 text-muted",
  Closed: "bg-surface-2 text-muted",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span data-badge className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", tone[status])}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

const tierLabel: Record<Tier, string> = { 0: "New", 1: "Tier 1", 2: "Tier 2" };

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      data-badge
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        tier === 0 && "border-line text-muted",
        tier === 1 && "border-accent/50 text-accent-hover",
        tier === 2 && "border-holding/60 text-holding",
      )}
    >
      {tierLabel[tier]}
    </span>
  );
}
