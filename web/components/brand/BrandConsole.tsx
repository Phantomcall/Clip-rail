"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "@/components/ui/Badge";
import { BudgetMeter } from "@/components/ui/BudgetMeter";
import { ActionDialog } from "@/components/ui/ActionDialog";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AffixInput, Field, TextArea } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useClose, useFlag, useResolve, useTopUp } from "@/lib/actions";
import { getCampaignsByBrand, getClipsForCampaign, now } from "@/lib/data";
import { count, duration, percent, timeLeft, usd } from "@/lib/format";
import type { Address, Campaign, Clip } from "@/lib/types";
import { parseUsd } from "@/lib/units";
import { useLive } from "@/lib/live";
import { BrandSetup } from "@/components/brand/BrandSetup";

function busy(s: string) {
  return s === "signing" || s === "pending";
}

function FlagDialog({ clip }: { clip: Clip }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const tx = useFlag();
  const toast = useToast();
  return (
    <ActionDialog
      open={open}
      onOpenChange={setOpen}
      title="Flag this clip"
      description="Freezes its unpaid earnings. Then accept or reject it before the resolve window ends, or it's accepted automatically."
      trigger={<Button variant="danger" className="min-h-9 px-3 text-xs">Flag</Button>}
    >
      <div className="flex flex-col gap-4">
        <Field label="Reason (shown to the clipper)" htmlFor={`reason-${clip.id}`}>
          <TextArea id={`reason-${clip.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. views jumped 20k in 10 minutes with almost no likes" />
        </Field>
        <Button
          variant="danger"
          disabled={reason.trim().length < 5}
          loading={busy(tx.status)}
          onClick={async () => {
            const h = await tx.run(clip.id, reason.trim());
            if (h) {
              toast({ tone: "success", title: "Clip flagged", txHash: h });
              setOpen(false);
              tx.reset();
            } else toast({ tone: "error", title: "Couldn't flag the clip." });
          }}
        >
          Flag clip
        </Button>
      </div>
    </ActionDialog>
  );
}

function ResolveButtons({ clip }: { clip: Clip }) {
  const tx = useResolve();
  const toast = useToast();
  const [which, setWhich] = useState<"accept" | "reject" | null>(null);
  const go = async (reject: boolean) => {
    setWhich(reject ? "reject" : "accept");
    const h = await tx.run(clip.id, reject);
    toast(h ? { tone: "success", title: reject ? "Clip rejected. Its unpaid earnings went back to your budget." : "Clip accepted", txHash: h } : { tone: "error", title: "Couldn't resolve the flag." });
    setWhich(null);
    tx.reset();
  };
  return (
    <div className="flex gap-2">
      <Button variant="secondary" className="min-h-9 px-3 text-xs" loading={which === "accept"} onClick={() => go(false)}>Accept</Button>
      <Button variant="danger" className="min-h-9 px-3 text-xs" loading={which === "reject"} onClick={() => go(true)}>Reject</Button>
    </div>
  );
}

function TopUpDialog({ campaign }: { campaign: Campaign }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const tx = useTopUp();
  const toast = useToast();
  const units = parseUsd(amount);
  return (
    <ActionDialog open={open} onOpenChange={setOpen} title="Top up budget" trigger={<Button variant="secondary" className="min-h-9 px-3 text-xs">Top up</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="Amount" htmlFor={`topup-${campaign.id}`}>
          <AffixInput id={`topup-${campaign.id}`} prefix="$" suffix="USDC" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Button
          disabled={!units || units <= 0n}
          loading={busy(tx.status)}
          onClick={async () => {
            const h = await tx.run(campaign.id, units!);
            if (h) {
              toast({ tone: "success", title: `Added ${usd(Number(units))}`, txHash: h });
              setOpen(false);
              tx.reset();
            } else toast({ tone: "error", title: "Top up failed." });
          }}
        >
          Add to escrow
        </Button>
      </div>
    </ActionDialog>
  );
}

function CloseDialog({ campaign }: { campaign: Campaign }) {
  const [open, setOpen] = useState(false);
  const tx = useClose();
  const toast = useToast();
  const refund = Math.max(campaign.budget - campaign.reserved - campaign.paid, 0);
  return (
    <ActionDialog
      open={open}
      onOpenChange={setOpen}
      title="Close campaign"
      description="Stops new earnings. Money already earned still pays out after its hold window."
      trigger={<Button variant="ghost" className="min-h-9 px-3 text-xs">Close</Button>}
    >
      <div className="flex flex-col gap-4">
        <p className="tabular rounded-[var(--radius-control)] bg-surface-2 p-3 text-sm">
          You get back <b className="text-money">{usd(refund)}</b> now. {usd(campaign.reserved)} stays reserved for clippers in the hold window.
        </p>
        <Button
          variant="danger"
          loading={busy(tx.status)}
          onClick={async () => {
            const h = await tx.run(campaign.id);
            if (h) {
              toast({ tone: "success", title: `Campaign closed, ${usd(refund)} refunded`, txHash: h });
              setOpen(false);
              tx.reset();
            } else toast({ tone: "error", title: "Couldn't close the campaign." });
          }}
        >
          Close and refund {usd(refund)}
        </Button>
      </div>
    </ActionDialog>
  );
}

function CampaignPanel({ campaign }: { campaign: Campaign }) {
  const { data: clips, loading } = useLive(["campaign-clips", campaign.id], () => getClipsForCampaign(campaign.id));
  const NOW = now();
  const likeFloorHit = (c: Clip) => c.lastViews > 0 && (c.likes * 10_000) / c.lastViews < campaign.minLikeBps;

  return (
    <Card className="flex flex-col gap-5 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href={`/campaigns/${campaign.id}`} className="text-lg font-semibold hover:text-accent-hover">{campaign.title}</Link>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="tabular mt-1 text-xs text-muted">
            {usd(campaign.cpm)} / 1k · cap {usd(campaign.maxPerClip)} · like floor {percent(campaign.minLikeBps)} · hold {duration(campaign.holdSecs)} ·{" "}
            {campaign.status === "Active" ? timeLeft(campaign.endsAt, NOW) : "closed"}
          </p>
        </div>
        {campaign.status === "Active" && (
          <div className="flex gap-2">
            <TopUpDialog campaign={campaign} />
            <CloseDialog campaign={campaign} />
          </div>
        )}
      </div>
      <BudgetMeter budget={campaign.budget} reserved={campaign.reserved} paid={campaign.paid} />

      <div className="grid gap-2 rounded-2xl bg-surface-2/70 p-3 text-xs sm:grid-cols-3">
        <div><span className="text-muted">Rule health</span><p className="mt-1 font-semibold text-money">Oracle checks on</p></div>
        <div><span className="text-muted">Clipper access</span><p className="mt-1 font-semibold">Tier {campaign.minTier}+ can join</p></div>
        <div><span className="text-muted">Next best move</span><p className="mt-1 font-semibold">{clips && clips.length > 0 ? "Review recent clips" : "Share your campaign"}</p></div>
      </div>

      {loading ? (
        <Skeleton className="h-32" />
      ) : !clips || clips.length === 0 ? (
        <EmptyState title="No clips registered yet. Share your campaign link with clippers." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-control)] border border-line">
          {clips.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={`https://youtube.com/shorts/${c.videoId}`} target="_blank" rel="noreferrer" className="truncate text-sm font-medium hover:text-accent-hover">{c.title}</a>
                  <StatusBadge status={c.status} />
                  {likeFloorHit(c) && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] text-danger">below like floor</span>}
                </div>
                <div className="tabular mt-1 text-xs text-muted">
                  {c.clipperHandle} · {count(c.lastViews)} views · {count(c.likes)} likes · {usd(c.accrued)} earned · {usd(c.released)} paid
                </div>
              </div>
              {c.status === "Flagged" ? <ResolveButtons clip={c} /> : c.status === "Active" && c.accrued > c.released ? <FlagDialog clip={c} /> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BrandOverview({ campaigns }: { campaigns: Campaign[] }) {
  const active = campaigns.filter((campaign) => campaign.status === "Active");
  const budget = campaigns.reduce((sum, campaign) => sum + campaign.budget, 0);
  const paid = campaigns.reduce((sum, campaign) => sum + campaign.paid, 0);
  const holding = campaigns.reduce((sum, campaign) => sum + campaign.reserved, 0);
  return (
    <section className="overflow-hidden rounded-[2rem] border border-line bg-surface shadow-[var(--shadow-float)]">
      <div className="relative bg-[#17182a] px-6 py-7 text-white sm:px-8">
        <div aria-hidden className="absolute -top-20 right-10 size-52 rounded-full bg-accent/60 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold tracking-[0.16em] text-white/55 uppercase">Campaign control room</p><h2 className="mt-2 text-2xl font-bold">Your money is working in public.</h2><p className="mt-2 max-w-xl text-sm text-white/65">Track what has paid, what is still under review, and where your budget is ready for the next real view.</p></div>
          <LinkButton href="/brand/new" variant="secondary" className="!border-white/20 !bg-white !text-[#17182a]">Create another campaign</LinkButton>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0">
        {[
          ["Active campaigns", String(active.length), "text-accent"],
          ["Total escrowed", usd(budget), ""],
          ["Paid to clippers", usd(paid), "text-money"],
          ["In fraud hold", usd(holding), "text-holding"],
        ].map(([label, value, tone]) => <div key={label} className="p-4 sm:p-5"><p className="text-xs text-muted">{label}</p><p className={`tabular mt-1 text-xl font-bold ${tone}`}>{value}</p></div>)}
      </div>
    </section>
  );
}

function LaunchCampaignPanel() {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-line bg-surface shadow-[var(--shadow-float)]">
      <div className="bg-[radial-gradient(circle_at_85%_0%,rgb(139_116_255/0.28),transparent_34%),#17182a] px-7 py-10 text-white sm:px-10">
        <p className="text-xs font-semibold tracking-[0.16em] text-white/55 uppercase">Your first campaign</p>
        <h2 className="mt-3 max-w-xl text-3xl font-bold">A better brief brings better clips.</h2>
        <p className="mt-3 max-w-lg text-sm text-white/70">Set a clear source, a rate clippers understand, and rules that stop low-quality traffic before it drains your budget.</p>
        <LinkButton href="/brand/new" variant="secondary" className="mt-6 !border-white/20 !bg-white !text-[#17182a]">Build your campaign →</LinkButton>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
        {[["01", "Bring the source", "A video and a brief creators can act on."], ["02", "Set guardrails", "Like floor, velocity cap and a hold window."], ["03", "Fund escrow", "USDC only moves after verified views."]].map(([step, title, body]) => <div key={step} className="rounded-2xl bg-surface-2 p-4"><span className="font-mono text-xs text-accent">{step}</span><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 text-xs leading-relaxed text-muted">{body}</p></div>)}
      </div>
    </section>
  );
}

export function BrandConsole({ address }: { address: Address }) {
  const { data: campaigns, loading } = useLive(["brand-campaigns", address], () => getCampaignsByBrand(address));
  if (loading) return <Skeleton className="h-64" />;
  if (!campaigns || campaigns.length === 0) {
    return <LaunchCampaignPanel />;
  }
  return (
    <div className="flex flex-col gap-6">
      <BrandOverview campaigns={campaigns} />
      {campaigns.map((c) => <CampaignPanel key={c.id} campaign={c} />)}
    </div>
  );
}
