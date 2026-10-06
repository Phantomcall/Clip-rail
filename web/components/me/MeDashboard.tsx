"use client";

import { claimCode } from "@cliprail/shared";
import Link from "next/link";
import { PayoutAddressDialog } from "@/components/me/PayoutAddressDialog";
import { LiveViews } from "@/components/me/LiveViews";
import { SendOutDialog } from "@/components/me/SendOutDialog";
import { StatusBadge, TierBadge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Counter } from "@/components/ui/Counter";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReceiptRow } from "@/components/ui/ReceiptRow";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { earningsSummary, getClipper, getClipsByClipper, getReceiptsByClipper, now } from "@/lib/data";
import { count, duration, usd } from "@/lib/format";
import type { Address } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

export function MeDashboard({ address }: { address: Address }) {
  const { data, loading, error } = useAsync(
    async () => {
      const [clips, receipts, profile] = await Promise.all([getClipsByClipper(address), getReceiptsByClipper(address), getClipper(address)]);
      return { clips, receipts, profile };
    },
    [address],
  );
  const NOW = now();

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
    );
  }
  if (error || !data) return <EmptyState title={`Couldn't load your earnings. ${error ?? ""}`} />;

  const { clips, receipts, profile } = data;
  const e = earningsSummary(clips);
  const nextUnlock = receipts.filter((r) => !r.released && r.unlockAt > NOW).sort((a, b) => a.unlockAt - b.unlockAt)[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <TierBadge tier={profile.tier} />
          <Link href={`/u/${address}`} className="text-sm text-muted hover:text-fg">Public profile →</Link>
        </div>
        <div className="flex gap-2">
          <PayoutAddressDialog />
          <SendOutDialog balance={e.paid} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Verified" value={<Counter value={e.verified} kind="usd" />} hint="earned from verified views" />
        <StatTile
          label="Holding"
          value={usd(e.holding)}
          tone="holding"
          hint={nextUnlock ? `next ${usd(nextUnlock.amount)} unlocks in ${duration(nextUnlock.unlockAt - NOW)}` : "nothing waiting"}
        />
        <StatTile label="Paid" value={<Counter value={e.paid} kind="usd" />} tone="money" hint="already in your account" />
      </div>

      <section>
        <h2 className="text-xl font-bold">My clips</h2>
        {clips.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No clips yet. Pick a campaign, post a Short and start earning." action={<LinkButton href="/campaigns">Browse campaigns</LinkButton>} />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {clips.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <a href={`https://youtube.com/shorts/${c.videoId}`} target="_blank" rel="noreferrer" className="truncate font-medium hover:text-accent-hover">{c.title}</a>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="tabular mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
                    <span>{count(c.lastViews)} verified views</span>
                    {c.status === "Active" && <LiveViews videoId={c.videoId} code={claimCode(BigInt(c.campaignId), address)} verified={c.lastViews} />}
                    <Link href={`/campaigns/${c.campaignId}`} className="hover:text-fg">campaign →</Link>
                  </div>
                  {c.status === "Pending" && <p className="mt-1 text-xs text-info">Waiting for the oracle to find your claim code in the description.</p>}
                  {c.status === "Flagged" && <p className="mt-1 text-xs text-danger">The brand flagged this clip. Payouts are paused until they decide (or the window runs out).</p>}
                </div>
                <div className="tabular flex gap-4 text-sm sm:text-right">
                  <span>{usd(c.accrued)} <span className="text-xs text-muted">earned</span></span>
                  <span className={c.released > 0 ? "text-money" : "text-muted"}>{usd(c.released)} <span className="text-xs text-muted">paid</span></span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold">Receipts</h2>
        <p className="mt-1 text-sm text-muted">Every verified-view report, onchain. Click any one to see the transaction.</p>
        <Card className="mt-4">
          {receipts.length === 0 ? (
            <p className="text-sm text-muted">No receipts yet.</p>
          ) : (
            <ul>{receipts.map((r) => <ReceiptRow key={r.id} receipt={r} now={NOW} />)}</ul>
          )}
        </Card>
      </section>
    </div>
  );
}
