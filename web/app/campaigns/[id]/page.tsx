import { LiveRefresh } from "@/lib/live";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/PageHeader";
import { BrandRecord } from "@/components/site/BrandRecord";
import { ClipsTable } from "@/components/site/ClipsTable";
import { AddressChip } from "@/components/ui/AddressChip";
import { StatusBadge, TierBadge } from "@/components/ui/Badge";
import { BudgetMeter } from "@/components/ui/BudgetMeter";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tip } from "@/components/ui/Tip";
import { count, duration, percent, timeLeft, usd, viewsBuyable, shortAddress } from "@/lib/format";
import { getBrandStats, getCampaign, getClipsForCampaign, now } from "@/lib/data";

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = await getCampaign((await params).id);
  if (!c) return { title: "Campaign not found · Cliprail" };
  const title = `${c.title} · Cliprail`;
  const description = `${usd(c.cpm * 1000, { cents: false })} per 1M verified views, budget locked in escrow on Monad. Clip it and get paid per verified view.`;
  // a page's own openGraph replaces the root's, so name the shared preview image again
  return { title, description, openGraph: { title, description, images: ["/opengraph-image.png"] } };
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCampaign(id);
  const NOW = now();
  if (!c) notFound();

  const free = Math.max(c.budget - c.reserved - c.paid, 0);
  const [clips, brandStats] = await Promise.all([getClipsForCampaign(c.id), getBrandStats(c.brand)]);
  const rules = [
    { label: "Rate", value: `${usd(c.cpm * 1000, { cents: false })} per 1M views`, tip: `${usd(c.cpm)} for every 1,000 views the oracle verifies, paid in USDC.` },
    { label: "Max per clip", value: usd(c.maxPerClip), tip: "One clip can't earn more than this, so the budget is shared." },
    { label: "Like floor", value: percent(c.minLikeBps), tip: "Views on a clip with fewer likes than this share of views earn nothing. Stops botted views." },
    { label: "Hold window", value: duration(c.holdSecs), tip: "Earnings wait this long before paying out, so the brand can flag fraud." },
    { label: "Velocity cap", value: `${count(c.maxViewsPerReport)} views / report`, tip: "Sudden spikes above this per check aren't paid." },
    { label: "Who can join", value: c.minTier === 0 ? "Everyone" : <TierBadge tier={c.minTier} />, tip: "Some campaigns need a clipper reputation tier." },
  ];

  return (
    <>
    <LiveRefresh />
    <PageHeader
      eyebrow={
        <>
          {/* without a brief the name is the short address; don't show it twice */}
          {c.brandName !== shortAddress(c.brand) && <span>{c.brandName}</span>}
          <AddressChip address={c.brand} />
          <StatusBadge status={c.status} />
        </>
      }
      title={c.title}
    />
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_22rem] lg:grid-rows-[auto_1fr]">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        {c.brief && <p className="text-muted">{c.brief}</p>}

        {/* the source video, when the brand's brief names one */}
        {YT_ID.test(c.sourceVideoId) && (
          <div className="mt-6 aspect-video overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            <iframe
              className="size-full"
              src={`https://www.youtube-nocookie.com/embed/${c.sourceVideoId}`}
              title="Source video"
              loading="lazy"
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </div>

      <aside className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
        <Card className="flex flex-col gap-5">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">Rate</div>
            <div className="tabular mt-1 font-display text-3xl font-bold">{usd(c.cpm * 1000, { cents: false })}<span className="text-base font-normal text-muted"> / 1M views</span></div>
          </div>
          <div>
            <div className="mb-2 flex justify-between text-xs text-muted">
              <span>Budget in escrow</span>
              <span className="tabular">{usd(c.budget)}</span>
            </div>
            <BudgetMeter budget={c.budget} reserved={c.reserved} paid={c.paid} />
          </div>
          <p className="tabular text-sm text-muted">
            Still enough for about <b className="text-fg">{count(viewsBuyable(free, c.cpm))}</b> more verified views ·{" "}
            {c.status === "Active" ? timeLeft(c.endsAt, NOW) : "closed"}
          </p>
          {c.status === "Active" ? (
            <LinkButton href={`/clip/new?c=${c.id}`} className="w-full">Get my claim code</LinkButton>
          ) : (
            <p className="rounded-[var(--radius-control)] bg-surface-2 p-3 text-center text-sm text-muted">This campaign is closed.</p>
          )}
          <BrandRecord stats={brandStats} />
          <p className="text-xs text-muted">You&apos;ll sign in with a passkey. No app, no seed phrase, no gas.</p>
        </Card>
      </aside>

      <div className="min-w-0 lg:col-start-1 lg:row-start-2">
        <h2 className="text-xl font-bold">Rules</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rules.map((r) => (
            <Tip key={r.label} content={r.tip}>
              <div className="cursor-help rounded-[var(--radius-control)] border border-line bg-surface p-3" tabIndex={0}>
                <dt className="text-xs text-muted">{r.label} ⓘ</dt>
                <dd className="tabular mt-1 text-sm font-semibold">{r.value}</dd>
              </div>
            </Tip>
          ))}
        </dl>

        <h2 className="mt-10 text-xl font-bold">Clips <span className="text-base font-normal text-muted">({clips.length})</span></h2>
        <div className="mt-4"><ClipsTable clips={clips} /></div>
      </div>

    </div>
    </>
  );
}
