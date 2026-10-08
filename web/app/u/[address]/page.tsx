import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { AddressChip } from "@/components/ui/AddressChip";
import { StatusBadge, TierBadge } from "@/components/ui/Badge";
import { CheckCircle } from "@/components/ui/Icons";
import { ReceiptRow } from "@/components/ui/ReceiptRow";
import { getClipper, getClipsByClipper, getReceiptsByClipper, now } from "@/lib/data";
import { compact, count, usd } from "@/lib/format";
import { displayName } from "@/lib/names";
import type { Tier } from "@/lib/types";

const NEXT_TIER: Record<Tier, { views: number; label: string } | null> = {
  0: { views: 5_000, label: "Tier 1" },
  1: { views: 50_000, label: "Tier 2" },
  2: null,
};

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) return {};
  const p = await getClipper(address);
  return { title: `${displayName(address, p.handle).primary} · Cliprail` };
}

export default async function ProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  const [profile, clips, receipts] = await Promise.all([getClipper(address), getClipsByClipper(address), getReceiptsByClipper(address)]);
  const NOW = now();
  const days = profile.firstSeen ? Math.max(1, Math.round((NOW - profile.firstSeen) / 86400)) : 0;
  const name = displayName(address, profile.handle);
  const initial = (name.hasName ? name.primary.slice(1, 2) : address.slice(2, 3)).toUpperCase();
  const outcomes = profile.clipsPaid + profile.rejections;
  const cleanRate = outcomes > 0 ? Math.round(((outcomes - profile.rejections) / outcomes) * 100) : 100;
  const next = NEXT_TIER[profile.tier];
  const progress = next ? Math.min(100, Math.round((profile.paidViews / next.views) * 100)) : 100;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 pb-16 sm:pt-16">
      {/* identity card */}
      <section className="glass overflow-hidden rounded-[2rem]">
        <div className="relative h-28 bg-[radial-gradient(circle_at_15%_30%,rgb(139_116_255/0.55),transparent_45%),radial-gradient(circle_at_85%_70%,rgb(80_199_255/0.45),transparent_50%),linear-gradient(120deg,#3b2a9a,#1b2c6b)] sm:h-36" />
        <div className="relative px-6 pb-6 sm:px-8">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4 sm:-mt-14">
            <div className="flex items-end gap-4">
              <span className="grid size-24 place-items-center rounded-3xl border-4 border-white bg-gradient-to-br from-accent to-[#50c7ff] font-display text-4xl font-bold text-white shadow-[var(--shadow-float)] dark:border-[#141830]">
                {initial}
              </span>
              <div className="pt-14 sm:pt-16">
                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold sm:text-3xl">
                  {name.primary} <TierBadge tier={profile.tier} />
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <AddressChip address={address} />
                  {days > 0 && <span>clipping for {days} {days === 1 ? "day" : "days"}</span>}
                </div>
              </div>
            </div>
            <Link href="/leaderboard" className="glass rounded-full px-4 py-2 text-sm font-semibold hover:text-accent">
              See the leaderboard →
            </Link>
          </div>

          <p className="mt-5 flex items-start gap-2 text-sm text-muted">
            <span className="mt-0.5 text-money">
              <CheckCircle />
            </span>
            A portable creator record: every number comes from paid, verified views on Monad, and only the Cliprail escrow can write to it.
          </p>
        </div>
      </section>

      {/* stats + tier */}
      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Paid views", compact(profile.paidViews), ""],
            ["Earned", usd(profile.earned), "text-money"],
            ["Clips paid", count(profile.clipsPaid), ""],
            ["Clean record", `${cleanRate}%`, cleanRate >= 95 ? "text-money" : cleanRate >= 80 ? "text-holding" : "text-danger"],
          ].map(([label, value, tone]) => (
            <div key={label} className="glass rounded-[var(--radius-card)] p-4">
              <p className="text-xs text-muted">{label}</p>
              <p className={`tabular mt-1 font-display text-2xl font-bold ${tone}`}>{value}</p>
            </div>
          ))}
          <p className="col-span-full text-xs text-muted">
            {profile.brands} {profile.brands === 1 ? "brand" : "brands"} paid this clipper · {profile.rejections}{" "}
            {profile.rejections === 1 ? "brand" : "brands"} rejected a clip
          </p>
        </div>
        <div className="glass rounded-[var(--radius-card)] p-5">
          <p className="text-xs text-muted">Reputation</p>
          <p className="mt-1 font-display text-xl font-bold">{next ? `${progress}% to ${next.label}` : "Top tier"}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-[#50c7ff]" style={{ width: `${progress}%` }} />
          </div>
          <p className="tabular mt-2 text-xs text-muted">
            {next ? `${count(profile.paidViews)} of ${count(next.views)} paid views. Higher tiers unlock premium campaigns.` : "Unlocks every campaign on Cliprail."}
          </p>
        </div>
      </section>

      {/* clips + receipts side by side on desktop, so nothing needs long scrolling */}
      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <div className="glass rounded-[var(--radius-card)] p-5">
          <h2 className="font-semibold">Clips</h2>
          {clips.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No clips yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {clips.slice(0, 6).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <a href={`https://youtube.com/shorts/${c.videoId}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:text-accent-hover">
                      {c.title}
                    </a>
                    <div className="tabular text-xs text-muted">{count(c.lastViews)} verified views</div>
                  </div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="glass rounded-[var(--radius-card)] p-5">
          <h2 className="font-semibold">Receipts</h2>
          {receipts.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No receipts yet.</p>
          ) : (
            <ul className="mt-1">
              {receipts.slice(0, 6).map((r) => (
                <ReceiptRow key={r.id} receipt={r} now={NOW} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
