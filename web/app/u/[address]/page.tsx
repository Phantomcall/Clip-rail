import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { PageHeader } from "@/components/site/PageHeader";
import { AddressChip } from "@/components/ui/AddressChip";
import { StatusBadge, TierBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReceiptRow } from "@/components/ui/ReceiptRow";
import { StatTile } from "@/components/ui/StatTile";
import { getClipper, getClipsByClipper, getReceiptsByClipper, now } from "@/lib/data";
import { count, usd } from "@/lib/format";

export default async function ProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  const [profile, clips, receipts] = await Promise.all([getClipper(address), getClipsByClipper(address), getReceiptsByClipper(address)]);
  const NOW = now();
  const days = profile.firstSeen ? Math.max(1, Math.round((NOW - profile.firstSeen) / 86400)) : 0;

  return (
    <>
    <PageHeader
      eyebrow={
        <>
          <AddressChip address={address} />
          {days > 0 && <span>clipping for {days} {days === 1 ? "day" : "days"}</span>}
        </>
      }
      title={
        <span className="flex flex-wrap items-center gap-3">
          <span>{profile.handle ? (profile.handle.startsWith("@") ? profile.handle : `@${profile.handle}`) : "@clipper"}</span> <TierBadge tier={profile.tier} />
        </span>
      }
      width="max-w-4xl"
    />
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="max-w-2xl rounded-2xl border border-line bg-surface/80 p-4 text-sm text-muted shadow-[var(--shadow-soft)]">
        <span className="font-semibold text-fg">A portable creator record.</span> Every number here comes from paid, verified views on Monad. Nobody can write to this record except the Cliprail escrow when it pays out.
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Paid views" value={count(profile.paidViews)} />
        <StatTile label="Earned" value={usd(profile.earned)} tone="money" />
        <StatTile label="Clips paid" value={count(profile.clipsPaid)} hint={`${profile.brands} ${profile.brands === 1 ? "brand" : "brands"}`} />
        <StatTile label="Rejected" value={count(profile.rejections)} hint={profile.clipsPaid + profile.rejections > 0 ? `${Math.round((profile.rejections / (profile.clipsPaid + profile.rejections)) * 100)}% of clips` : undefined} />
      </div>

      <h2 className="mt-10 text-xl font-bold">Clips</h2>
      {clips.length === 0 ? (
        <div className="mt-4"><EmptyState title="No clips yet." /></div>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {clips.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <a href={`https://youtube.com/shorts/${c.videoId}`} target="_blank" rel="noreferrer" className="block truncate font-medium hover:text-accent-hover">{c.title}</a>
                <div className="tabular text-xs text-muted">{count(c.lastViews)} verified views</div>
              </div>
              <StatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-xl font-bold">Receipts</h2>
      <Card className="mt-4">
        {receipts.length === 0 ? <p className="text-sm text-muted">No receipts yet.</p> : <ul>{receipts.map((r) => <ReceiptRow key={r.id} receipt={r} now={NOW} />)}</ul>}
      </Card>
    </div>
    </>
  );
}
