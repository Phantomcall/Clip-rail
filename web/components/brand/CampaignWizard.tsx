"use client";

import { parseVideoId } from "@cliprail/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { keccak256, toBytes } from "viem";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AffixInput, Field, Input, Select, TextArea } from "@/components/ui/Field";
import { Stepper } from "@/components/ui/Stepper";
import { TxLink } from "@/components/ui/TxLink";
import { useToast } from "@/components/ui/Toast";
import { useCreateCampaign, type CampaignParams } from "@/lib/actions";
import { useBalances } from "@/lib/balances";
import { saveBrief } from "@/lib/briefs";
import { count, duration, usd, viewsBuyable } from "@/lib/format";
import { ADDR, NETWORK, USDC } from "@/lib/network";
import { parseUsd } from "@/lib/units";

const STEPS = ["Source & brief", "Rates & caps", "Fraud rules", "Review & fund"];
// testnet adds a 5-minute hold, so a judge sees a payout during the demo
const HOLD_OPTIONS = [...(NETWORK === "testnet" ? [300] : []), 3600, 6 * 3600, 86400, 2 * 86400, 3 * 86400];
const MOCK_USDC = ADDR.mockUsdc as `0x${string}` | null;

interface Form {
  brandName: string;
  title: string;
  sourceUrl: string;
  brief: string;
  budget: string;
  cpm: string;
  maxPerClip: string;
  minLikePct: string;
  maxViewsPerReport: string;
  holdSecs: number;
  days: string;
  minTier: 0 | 1 | 2;
}

const DEFAULTS: Form = {
  brandName: "",
  title: "",
  sourceUrl: "",
  brief: "",
  budget: "150",
  cpm: "1",
  maxPerClip: "20",
  minLikePct: "0.5",
  maxViewsPerReport: "20000",
  holdSecs: 86400,
  days: "14",
  minTier: 0,
};

/** /brand/new?demo=1 from the judge sandbox: a small test campaign that pays out within minutes. */
const DEMO: Form = {
  ...DEFAULTS,
  brandName: "Sandbox brand",
  title: "Judge test campaign",
  sourceUrl: "https://youtube.com/shorts/GJcHrS4vWbc", // a team test Short; any public video works
  brief: "Testing Cliprail end to end: any short vertical cut works. Put your claim code in the description.",
  budget: "100",
  minLikePct: "0",
  holdSecs: 300,
  days: "2",
};

type Errors = Partial<Record<keyof Form, string>>;

function validate(f: Form, step: number): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (!f.brandName.trim()) e.brandName = "Who is running this campaign?";
    if (f.title.trim().length < 6) e.title = "Give it a title clippers will understand (6+ characters).";
    if (!parseVideoId(f.sourceUrl)) e.sourceUrl = "Paste a YouTube link to the video clippers will cut from.";
    if (f.brief.trim().length < 20) e.brief = "Tell clippers what you want (20+ characters).";
  }
  if (step === 1) {
    const budget = parseUsd(f.budget);
    const cpm = parseUsd(f.cpm);
    const cap = parseUsd(f.maxPerClip);
    if (!budget || budget < 10_000_000n) e.budget = "Minimum budget is $10.";
    if (!cpm || cpm < 100_000n) e.cpm = "Minimum rate is $0.10 per 1,000 views.";
    if (!cap || cap <= 0n) e.maxPerClip = "Set a per-clip cap.";
    else if (budget && cap > budget) e.maxPerClip = "The per-clip cap can't be more than the budget.";
  }
  if (step === 2) {
    const like = Number(f.minLikePct);
    if (!(like >= 0 && like <= 20)) e.minLikePct = "Between 0% and 20%.";
    const vel = Number(f.maxViewsPerReport);
    if (!(Number.isInteger(vel) && vel >= 1000)) e.maxViewsPerReport = "At least 1,000 views per report.";
    const days = Number(f.days);
    if (!(Number.isInteger(days) && days >= 1 && days <= 60)) e.days = "Between 1 and 60 days.";
  }
  return e;
}

function toParams(f: Form, brief: string, token: `0x${string}`): CampaignParams {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    token,
    budget: parseUsd(f.budget)!,
    cpm: parseUsd(f.cpm)!,
    maxPerClip: parseUsd(f.maxPerClip)!,
    maxViewsPerReport: BigInt(f.maxViewsPerReport),
    minLikeBps: Math.round(Number(f.minLikePct) * 100),
    holdSecs: f.holdSecs,
    startsAt: nowSec,
    endsAt: nowSec + Number(f.days) * 86400,
    minTier: f.minTier,
    briefHash: keccak256(toBytes(brief)),
  };
}

export function CampaignWizard({ demo = false }: { demo?: boolean }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(demo ? DEMO : DEFAULTS);
  const balances = useBalances();
  const [errors, setErrors] = useState<Errors>({});
  const tx = useCreateCampaign();
  const toast = useToast();

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const calc = useMemo(() => {
    const budget = Number(parseUsd(form.budget) ?? 0n);
    const cpm = Number(parseUsd(form.cpm) ?? 0n);
    const cap = Number(parseUsd(form.maxPerClip) ?? 0n);
    return { views: viewsBuyable(budget, cpm), minClips: cap > 0 ? Math.ceil(budget / cap) : 0, budget, cpm, cap };
  }, [form.budget, form.cpm, form.maxPerClip]);

  // Testnet: pay with the sandbox's MockUSDC when that's what the account holds (both tokens are allowed by the vault).
  const pay = useMemo(() => {
    const b = balances.data;
    const sandbox = !!MOCK_USDC && !!b && b.testUsdc > b.usdc;
    return { token: sandbox ? MOCK_USDC! : USDC, label: sandbox ? "Test USDC (sandbox)" : "USDC", balance: b ? (sandbox ? b.testUsdc : b.usdc) : null };
  }, [balances.data]);
  const short = pay.balance !== null && BigInt(calc.budget) > pay.balance;

  const next = () => {
    const e = validate(form, step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => s + 1);
  };

  const fund = async () => {
    const brief = JSON.stringify({ brandName: form.brandName, title: form.title, sourceVideoId: parseVideoId(form.sourceUrl), brief: form.brief });
    if (short) {
      toast({ tone: "error", title: `You have ${usd(Number(pay.balance))} ${pay.label}. Lower the budget or add funds.` });
      return;
    }
    const hash = await tx.run(toParams(form, brief, pay.token));
    if (hash) {
      toast({ tone: "success", title: "Campaign funded", txHash: hash });
      void saveBrief(hash, brief); // a mock hash has no receipt, so this quietly does nothing
    }
    else toast({ tone: "error", title: `Funding failed: ${tx.lastError() ?? "try again"}. Nothing was charged.` });
  };

  if (tx.status === "success" && tx.txHash) {
    return (
      <Card className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-money/15 text-2xl text-money">✓</span>
        <h2 className="text-2xl font-bold">Your campaign is live</h2>
        <p className="max-w-md text-muted">{usd(calc.budget)} is locked in escrow. Clippers can start posting now.</p>
        <TxLink hash={tx.txHash} label="View funding transaction" />
        <div className="flex gap-3">
          <LinkButton href="/brand">Go to brand console</LinkButton>
          <LinkButton href="/campaigns" variant="secondary">See it in the feed</LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper steps={STEPS} current={step} />

      <Card className="flex flex-col gap-5">
        {step === 0 && (
          <>
            <Field label="Brand name" htmlFor="brandName" error={errors.brandName}>
              <Input id="brandName" value={form.brandName} onChange={(e) => set("brandName", e.target.value)} placeholder="Northwind Games" invalid={!!errors.brandName} />
            </Field>
            <Field label="Campaign title" htmlFor="title" error={errors.title}>
              <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Clip our launch trailer" invalid={!!errors.title} />
            </Field>
            <Field label="Source video (YouTube link)" htmlFor="sourceUrl" error={errors.sourceUrl} hint="The video clippers will cut Shorts from.">
              <Input id="sourceUrl" value={form.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://youtube.com/watch?v=…" inputMode="url" invalid={!!errors.sourceUrl} />
            </Field>
            <Field label="Brief" htmlFor="brief" error={errors.brief} hint="What makes a good clip? Length, style, what to avoid.">
              <TextArea id="brief" value={form.brief} onChange={(e) => set("brief", e.target.value)} placeholder="20–60 second vertical cuts, hook in the first 2 seconds, captions on…" invalid={!!errors.brief} />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Budget" htmlFor="budget" error={errors.budget}>
                <AffixInput id="budget" prefix="$" suffix="USDC" inputMode="decimal" value={form.budget} onChange={(e) => set("budget", e.target.value)} invalid={!!errors.budget} />
              </Field>
              <Field label="Rate" htmlFor="cpm" error={errors.cpm} hint={calc.cpm > 0 ? `= ${usd(calc.cpm * 1000, { cents: false })} per 1M views` : undefined}>
                <AffixInput id="cpm" prefix="$" suffix="/ 1k views" inputMode="decimal" value={form.cpm} onChange={(e) => set("cpm", e.target.value)} invalid={!!errors.cpm} />
              </Field>
              <Field label="Max per clip" htmlFor="maxPerClip" error={errors.maxPerClip}>
                <AffixInput id="maxPerClip" prefix="$" inputMode="decimal" value={form.maxPerClip} onChange={(e) => set("maxPerClip", e.target.value)} invalid={!!errors.maxPerClip} />
              </Field>
            </div>
            <div className="rounded-[var(--radius-control)] border border-accent/30 bg-accent/10 p-4 text-sm">
              Your budget buys about <b className="tabular text-fg">{count(calc.views)}</b> verified views, shared by at least{" "}
              <b className="tabular text-fg">{count(calc.minClips)}</b> clips. Whatever isn&apos;t earned comes back to you when you close the campaign.
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Like floor" htmlFor="minLike" error={errors.minLikePct} hint="Views on clips with fewer likes than this share of views earn nothing. 0.5% is lenient; it can't be changed later.">
                <AffixInput id="minLike" suffix="% of views" inputMode="decimal" value={form.minLikePct} onChange={(e) => set("minLikePct", e.target.value)} invalid={!!errors.minLikePct} />
              </Field>
              <Field label="Velocity cap" htmlFor="velocity" error={errors.maxViewsPerReport} hint="Views above this per oracle check (~10 min) aren't paid. Stops bot spikes draining the budget.">
                <AffixInput id="velocity" suffix="views / check" inputMode="numeric" value={form.maxViewsPerReport} onChange={(e) => set("maxViewsPerReport", e.target.value)} invalid={!!errors.maxViewsPerReport} />
              </Field>
              <Field label="Hold window" htmlFor="hold" hint="How long earnings wait before paying out. You can flag a clip during this time.">
                <Select id="hold" value={form.holdSecs} onChange={(e) => set("holdSecs", Number(e.target.value))}>
                  {HOLD_OPTIONS.map((h) => (
                    <option key={h} value={h}>{duration(h)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Runs for" htmlFor="days" error={errors.days}>
                <AffixInput id="days" suffix="days" inputMode="numeric" value={form.days} onChange={(e) => set("days", e.target.value)} invalid={!!errors.days} />
              </Field>
              <Field label="Who can join" htmlFor="tier" hint="Tiers come from clippers' paid, verified history.">
                <Select id="tier" value={form.minTier} onChange={(e) => set("minTier", Number(e.target.value) as 0 | 1 | 2)}>
                  <option value={0}>Everyone</option>
                  <option value={1}>Tier 1+ (5k paid views, at most 1 rejecting brand)</option>
                  <option value={2}>Tier 2 (50k paid views, under 5% rejected)</option>
                </Select>
              </Field>
            </div>
          </>
        )}

        {step === 3 && (
          <dl className="tabular grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ["Brand", form.brandName],
              ["Title", form.title],
              ["Budget", usd(calc.budget)],
              ["Rate", `${usd(calc.cpm)} / 1k views`],
              ["Max per clip", usd(calc.cap)],
              ["Like floor", `${form.minLikePct}%`],
              ["Velocity cap", `${count(Number(form.maxViewsPerReport))} views / check`],
              ["Hold window", duration(form.holdSecs)],
              ["Runs for", `${form.days} days`],
              ["Who can join", form.minTier === 0 ? "Everyone" : `Tier ${form.minTier}+`],
              ["Pays with", pay.balance === null ? pay.label : `${pay.label} · ${usd(Number(pay.balance))} available`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-line pb-2">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-semibold">{v}</dd>
              </div>
            ))}
            <p className="text-xs text-muted sm:col-span-2">
              These rules are fixed once funded. Funding asks you to approve {usd(calc.budget)} {pay.label}, then locks it in the Cliprail escrow.
            </p>
            {short && (
              <p className="rounded-[var(--radius-control)] bg-danger/10 px-3 py-2 text-xs font-semibold text-danger sm:col-span-2">
                The budget is more than your {pay.label} balance. Go back and lower it, or add funds.
              </p>
            )}
          </dl>
        )}

        <div className="flex justify-between gap-3 border-t border-line pt-5">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={tx.status === "signing" || tx.status === "pending"}>
              ← Back
            </Button>
          ) : (
            <Link href="/brand" className="self-center text-sm text-muted hover:text-fg">Cancel</Link>
          )}
          {step < 3 ? (
            <Button onClick={next}>Continue</Button>
          ) : (
            <Button onClick={fund} loading={tx.status === "signing" || tx.status === "pending"}>
              {tx.status === "signing" ? "Confirm with passkey…" : tx.status === "pending" ? "Funding…" : `Fund ${usd(calc.budget)}`}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
