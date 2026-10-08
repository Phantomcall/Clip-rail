"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { usd } from "@/lib/format";

/*
 * "Bots earn nothing", as a walkthrough: pick a clip and watch the vault's rules decide what it earns. Numbers follow the
 * real rules (PRD §5.2) for a campaign paying $1 per 1,000 views, with a 0.5% like floor, a 10k velocity cap and a $20
 * cap per clip.
 */

type Verdict = "pass" | "cut" | "stop";
type Check = { rule: string; detail: string; verdict: Verdict };
type Scenario = { key: string; label: string; clip: string; views: string; likes: string; checks: Check[]; paid: number; summary: string };

const SCENARIOS: Scenario[] = [
  {
    key: "real",
    label: "Real audience",
    clip: "the 2-second hook",
    views: "+8,200 views",
    likes: "610 likes (7.4%)",
    checks: [
      { rule: "Claim code", detail: "CR-3FA9… found in the description", verdict: "pass" },
      { rule: "Like floor 0.5%", detail: "7.4% of viewers liked it", verdict: "pass" },
      { rule: "Velocity cap 10k", detail: "8,200 new views, under the cap", verdict: "pass" },
      { rule: "Per-clip cap $20", detail: "$8.20 of $20 used", verdict: "pass" },
    ],
    paid: 8_200_000,
    summary: "Every view counts. $8.20 is reserved now and paid after the 24 h hold.",
  },
  {
    key: "bots",
    label: "Bought views",
    clip: "suspiciously viral",
    views: "+40,000 views",
    likes: "38 likes (0.1%)",
    checks: [
      { rule: "Claim code", detail: "Found in the description", verdict: "pass" },
      { rule: "Like floor 0.5%", detail: "Only 0.1% liked it: real audiences engage, bots don't", verdict: "stop" },
      { rule: "Velocity cap 10k", detail: "Not reached: the like floor already stopped it", verdict: "stop" },
      { rule: "Per-clip cap $20", detail: "Nothing to cap", verdict: "stop" },
    ],
    paid: 0,
    summary: "40,000 views, $0 paid. The report is marked suspect and the budget is untouched.",
  },
  {
    key: "spike",
    label: "Sudden spike",
    clip: "clip of the week",
    views: "+26,000 views",
    likes: "1,900 likes (7.3%)",
    checks: [
      { rule: "Claim code", detail: "Found in the description", verdict: "pass" },
      { rule: "Like floor 0.5%", detail: "7.3% liked it", verdict: "pass" },
      { rule: "Velocity cap 10k", detail: "26,000 in one check: only 10,000 count", verdict: "cut" },
      { rule: "Per-clip cap $20", detail: "$10.00 of $20 used", verdict: "pass" },
    ],
    paid: 10_000_000,
    summary: "Spikes can't drain a budget: one check pays at most the cap. Views above it are never paid.",
  },
  {
    key: "flag",
    label: "Brand flags it",
    clip: "repost of another clip",
    views: "+5,000 views",
    likes: "400 likes (8%)",
    checks: [
      { rule: "Claim code", detail: "Found, earnings reserved", verdict: "pass" },
      { rule: "Hold window 24 h", detail: "Brand flags it during the hold", verdict: "cut" },
      { rule: "Decision", detail: "Rejected before the deadline (silence would accept)", verdict: "stop" },
      { rule: "Refund", detail: "$5.00 still in hold returns to the budget", verdict: "stop" },
    ],
    paid: 0,
    summary: "Only money still in hold can be disputed, once per clip, on the record. Fair brands keep a low reject rate.",
  },
];

const TONE: Record<Verdict, { dot: string; text: string; label: string }> = {
  pass: { dot: "bg-money", text: "text-money", label: "Pass" },
  cut: { dot: "bg-holding", text: "text-holding", label: "Capped" },
  stop: { dot: "bg-danger", text: "text-danger", label: "Stopped" },
};

export function Fairness() {
  const [k, setK] = useState(0);
  const s = SCENARIOS[k];

  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="text-center">
        <p className="eyebrow">Fair by default</p>
        <h2 className="mt-3 text-4xl font-bold sm:text-5xl">Bots earn nothing.</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          Every rule runs in the contract, so neither side has to trust us. Pick a clip and watch the rules decide what it earns.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Scenarios">
        {SCENARIOS.map((sc, i) => (
          <button
            key={sc.key}
            type="button"
            role="tab"
            aria-selected={i === k}
            onClick={() => setK(i)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              i === k ? "bg-accent text-accent-fg shadow-[var(--shadow-soft)]" : "glass text-muted hover:text-fg"
            }`}
          >
            {sc.label}
          </button>
        ))}
      </div>

      <div className="glass mt-6 grid overflow-hidden rounded-[2rem] lg:grid-cols-[18rem_1fr_16rem]">
        {/* the clip */}
        <div className="flex flex-col justify-center gap-1 border-b border-line p-6 lg:border-r lg:border-b-0">
          <span className="text-xs text-muted">Oracle report for</span>
          <p className="font-display text-xl font-bold">&ldquo;{s.clip}&rdquo;</p>
          <p className="tabular mt-2 text-sm">{s.views}</p>
          <p className="tabular text-sm text-muted">{s.likes}</p>
        </div>

        {/* the rules, one by one */}
        <ol className="flex flex-col gap-2 p-5">
          <AnimatePresence mode="popLayout" initial={false}>
            {s.checks.map((c, i) => (
              <motion.li
                key={s.key + c.rule}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.18, duration: 0.35 }}
                className="flex items-center gap-3 rounded-2xl bg-white/40 px-4 py-3 dark:bg-white/[0.04]"
              >
                <span className={`size-2.5 shrink-0 rounded-full ${TONE[c.verdict].dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{c.rule}</p>
                  <p className="text-xs text-muted">{c.detail}</p>
                </div>
                <span className={`text-xs font-bold ${TONE[c.verdict].text}`}>{TONE[c.verdict].label}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>

        {/* the outcome */}
        <div className="flex flex-col justify-center border-t border-line p-6 lg:border-t-0 lg:border-l">
          <span className="text-xs text-muted">Earned from this report</span>
          <motion.p
            key={s.key}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.75, type: "spring", stiffness: 260, damping: 18 }}
            className={`tabular font-display text-5xl font-bold ${s.paid > 0 ? "text-money" : "text-danger"}`}
          >
            {usd(s.paid)}
          </motion.p>
          <p className="mt-3 text-sm text-muted">{s.summary}</p>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        Example campaign: $1 per 1,000 views, 0.5% like floor, 10k views per check, $20 per clip, 24 h hold.
      </p>
    </section>
  );
}
