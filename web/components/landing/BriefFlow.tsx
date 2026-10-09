"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { compact, usd } from "@/lib/format";

const STEPS = [
  { title: "Launch a campaign in minutes", body: "Set the budget, the rate per 1M views and the rules. The budget is locked in escrow, so clippers know it's real." },
  { title: "Clippers post with a claim code", body: "Each Short carries the clipper's code in its description, so nobody can claim someone else's clip." },
  { title: "Views verified by an oracle", body: "Chainlink CRE reads real views and likes every few minutes. Bot-like spikes and low-engagement views don't pay." },
  { title: "Flag anything. Pay only what's real.", body: "Earnings sit in a hold window you control. Close any time and get back everything that wasn't earned." },
];

/** Brand section (Airaa-style): numbered steps on the left, a live mini campaign builder on the right. */
export function BriefFlow() {
  const [active, setActive] = useState(0);
  const [budget, setBudget] = useState(1500);
  const cpm = 1.5; // $ per 1k views
  const views = Math.floor((budget / cpm) * 1000);
  const clips = Math.max(1, Math.round(budget / 40));

  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="text-center">
        <span className="rounded-full bg-accent-soft px-3 py-1 text-[11px] font-semibold tracking-wider text-accent-solid-hover uppercase dark:text-[#c9bfff]">For brands</span>
        <h2 className="mt-4 text-4xl font-bold sm:text-5xl">
          Brief to payout, <span className="text-accent">in one flow</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted">Pay only for views an oracle can verify. Whatever isn&apos;t earned comes back to you.</p>
      </div>

      <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
        <ol className="flex flex-col gap-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button
                onClick={() => setActive(i)}
                className={cn(
                  "w-full rounded-2xl border-l-4 px-5 py-4 text-left transition",
                  i === active ? "border-accent bg-surface shadow-[var(--shadow-soft)]" : "border-line hover:bg-surface/60",
                )}
              >
                <div className="flex items-baseline gap-3">
                  <span className={cn("font-mono text-xs", i === active ? "text-accent" : "text-muted")}>0{i + 1}</span>
                  <span className={cn("font-display text-lg font-semibold", i !== active && "text-muted")}>{s.title}</span>
                </div>
                {i === active && <p className="mt-2 pl-8 text-sm text-muted">{s.body}</p>}
              </button>
            </li>
          ))}
        </ol>

        <div className="glass dots relative grid place-items-center rounded-[28px] px-4 py-14">
          <span className="absolute top-6 left-6 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold shadow-[var(--shadow-soft)]">🔒 Locked in escrow</span>
          <span className="absolute top-8 right-6 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted shadow-[var(--shadow-soft)]">YouTube Shorts</span>
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-float)]">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Launch campaign</span>
              <span className="font-mono text-xs text-muted">{active + 1}/4</span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={cn("h-1.5 rounded-full", i <= active ? "bg-accent" : "bg-accent-soft")} />
              ))}
            </div>
            <label className="mt-5 block text-[10px] font-semibold tracking-wider text-muted uppercase">Campaign name</label>
            <div className="mt-1 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm">Launch week clipping sprint</div>
            <div className="mt-5 flex items-center justify-between">
              <label htmlFor="bf-budget" className="text-[10px] font-semibold tracking-wider text-muted uppercase">Budget</label>
              <span className="tabular font-display text-xl font-bold">{usd(budget * 1_000_000, { cents: false })}</span>
            </div>
            <input
              id="bf-budget"
              type="range"
              min={100}
              max={10000}
              step={100}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="mt-2 w-full accent-[var(--color-accent)]"
            />
            <div className="tabular mt-1 flex justify-between font-mono text-[11px] text-muted">
              <span>~{clips} clips</span>
              <span>~{compact(views)} verified views</span>
            </div>
            <div className="mt-5 rounded-full bg-accent-solid py-2.5 text-center text-sm font-semibold text-white">Fund {usd(budget * 1_000_000, { cents: false })} →</div>
          </div>
          <span className="absolute bottom-6 left-8 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-soft)]">$1,500 / 1M views</span>
          <span className="absolute right-6 bottom-6 flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold shadow-[var(--shadow-soft)]">
            <span className="grid size-4 place-items-center rounded-full bg-money text-[9px] text-white">✓</span> Live in 4 steps
          </span>
        </div>
      </div>
    </section>
  );
}
