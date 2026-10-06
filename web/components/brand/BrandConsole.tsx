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
import { useAsync } from "@/lib/useAsync";

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
  const { data: clips, loading } = useAsync(() => getClipsForCampaign(campaign.id), [campaign.id]);
  const NOW = now();
  const likeFloorHit = (c: Clip) => c.lastViews > 0 && (c.likes * 10_000) / c.lastViews < campaign.minLikeBps;

  return (
    <Card className="flex flex-col gap-5">
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

export function BrandConsole({ address }: { address: Address }) {
  const { data: campaigns, loading } = useAsync(() => getCampaignsByBrand(address), [address]);
  if (loading) return <Skeleton className="h-64" />;
  if (!campaigns || campaigns.length === 0) {
    return <EmptyState title="You haven't launched a campaign yet." action={<LinkButton href="/brand/new">Launch a campaign</LinkButton>} />;
  }
  return (
    <div className="flex flex-col gap-6">
      {campaigns.map((c) => <CampaignPanel key={c.id} campaign={c} />)}
    </div>
  );
}
