import { LiveRefresh } from "@/lib/live";
import Link from "next/link";
import { PageHeader } from "@/components/site/PageHeader";
import { TierBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCampaigns, getLeaderboard } from "@/lib/data";
import { compact, count, shortAddress, usd } from "@/lib/format";

export const metadata = { title: "Leaderboard · Cliprail" };

export default async function LeaderboardPage() {
  const [clippers, campaigns] = await Promise.all([getLeaderboard(20), getCampaigns()]);
  const topCampaigns = [...campaigns].sort((a, b) => b.verifiedViews - a.verifiedViews).slice(0, 5);
  return (
    <>
    <LiveRefresh />
    <PageHeader title="Leaderboard">Ranked by paid, verified views. Bot views and rejected clips don&apos;t count.</PageHeader>
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[1fr_20rem]">
      <section>
        {clippers.length === 0 ? (
          <div><EmptyState title="No paid clippers yet. The first payout puts you at the top." /></div>
        ) : (
          <ol className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {clippers.map((c, i) => (
              <li key={c.id}>
                <Link href={`/u/${c.id}`} className="flex items-center gap-4 p-4 hover:bg-surface-2/60">
                  <span className={`tabular w-6 text-center text-sm font-bold ${i < 3 ? "text-holding" : "text-muted"}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{c.handle ?? shortAddress(c.id)}</span>
                      <TierBadge tier={c.tier} />
                    </div>
                    <div className="tabular text-xs text-muted">{c.clipsPaid} clips paid · {c.brands} brands</div>
                  </div>
                  <div className="tabular text-right">
                    <div className="font-semibold">{count(c.paidViews)} <span className="text-xs font-normal text-muted">views</span></div>
                    <div className="text-xs text-money">{usd(c.earned)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
      <aside>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Top campaigns</h2>
        <ol className="mt-4 flex flex-col gap-3">
          {topCampaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/campaigns/${c.id}`} className="block rounded-[var(--radius-control)] border border-line bg-surface p-3 hover:border-muted/60">
                <div className="text-xs text-muted">{c.brandName}</div>
                <div className="truncate text-sm font-semibold">{c.title}</div>
                <div className="tabular mt-1 text-xs text-muted">{compact(c.verifiedViews)} verified views · <span className="text-money">{usd(c.paid, { cents: false })} paid</span></div>
              </Link>
            </li>
          ))}
        </ol>
      </aside>
    </div>
    </>
  );
}
