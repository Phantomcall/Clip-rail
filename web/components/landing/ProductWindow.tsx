"use client";

import { animate, AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/Badge";
import { ShortThumb } from "@/components/ui/ShortThumb";
import { count, usd } from "@/lib/format";

/*
 * Landing-page demo only: a scripted loop of oracle reports, so the dashboard looks alive. Real screens never tick on a
 * timer (docs/design.md); they use Counter with onchain numbers.
 */

type Status = "Active" | "Pending";
type Row = { views: number; earned: number; status: Status };
type Frame = {
  rows: [Row, Row, Row];
  verified: number;
  holding: number;
  paid: number;
  /** Which row a report just landed on, and what it added (USDC units). */
  hit?: { row: number; amount: number };
  /** A release just moved holding into the balance. */
  released?: number;
};

const ROWS = [
  { caption: "the hook that pays", hue: 262, title: "The 2-second hook that pays" },
  { caption: "paid in seconds", hue: 150, title: "Paid in seconds, not weeks" },
  { caption: "escrow in 30s", hue: 28, title: "Escrow explained in 30s" },
];

const r = (views: number, status: Status = "Active"): Row => ({ views, earned: views * 1000, status });

// $1 per 1,000 views, so earned (USDC units) = views × 1,000.
const SCRIPT: Frame[] = [
  { rows: [r(18420), r(12330), r(0, "Pending")], verified: 30_750_000, holding: 6_420_000, paid: 24_330_000 },
  { rows: [r(19660), r(12330), r(0, "Pending")], verified: 31_990_000, holding: 7_660_000, paid: 24_330_000, hit: { row: 0, amount: 1_240_000 } },
  { rows: [r(19660), r(12330), r(2150)], verified: 34_140_000, holding: 9_810_000, paid: 24_330_000, hit: { row: 2, amount: 2_150_000 } },
  { rows: [r(19660), r(13210), r(2150)], verified: 35_020_000, holding: 10_690_000, paid: 24_330_000, hit: { row: 1, amount: 880_000 } },
  { rows: [r(19660), r(13210), r(2150)], verified: 35_020_000, holding: 4_270_000, paid: 30_750_000, released: 6_420_000 },
  { rows: [r(21970), r(13210), r(2150)], verified: 37_330_000, holding: 6_580_000, paid: 30_750_000, hit: { row: 0, amount: 2_310_000 } },
];

const STEP_MS = 3200;

/** A number that eases to its new value. */
function Ticker({ value, kind, from }: { value: number; kind: "usd" | "int"; from?: number }) {
  const mv = useMotionValue(from ?? value);
  const text = useTransform(mv, (v) => (kind === "usd" ? usd(Math.round(v)) : count(Math.round(v))));
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span className="tabular">{text}</motion.span>;
}

/** "+$1.24" that floats up and fades, keyed so each report gets its own. */
function Gain({ id, amount, className = "" }: { id: number; amount: number; className?: string }) {
  return (
    <AnimatePresence>
      <motion.span
        key={id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: [0, 1, 1, 0], y: [6, 0, -10, -18] }}
        transition={{ duration: 2, times: [0, 0.15, 0.7, 1] }}
        className={`tabular pointer-events-none absolute text-xs font-bold text-money ${className}`}
      >
        +{usd(amount)}
      </motion.span>
    </AnimatePresence>
  );
}

/** A browser-framed miniature of the clipper dashboard (Airaa-style product shot), built from our real components. */
export function ProductWindow() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const entered = useInView(ref, { amount: 0.3, once: true });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  // Advance the script while the window is on screen; loop back to the start.
  useEffect(() => {
    if (!inView || reduce) return;
    const id = setInterval(() => setStep((s) => (s + 1) % SCRIPT.length), STEP_MS);
    return () => clearInterval(id);
  }, [inView, reduce]);

  const f = SCRIPT[step];
  const restarting = step === 0 && entered;

  return (
    <motion.div
      ref={ref}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      animate={entered ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-[22px] border border-white/80 bg-white/70 p-1.5 shadow-[0_30px_80px_-30px_rgb(18_18_22/0.35)] backdrop-blur dark:border-white/10 dark:bg-white/5"
    >
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 hidden rounded-full bg-surface-2 px-3 py-0.5 font-mono text-[11px] text-muted sm:block">cliprail.app/me</span>
        <span className="ml-auto hidden items-center gap-1.5 text-[11px] font-medium text-muted sm:flex">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-money/60" />
            <span className="relative inline-flex size-2 rounded-full bg-money" />
          </span>
          Live
        </span>
      </div>
      <div className="grid gap-4 rounded-[18px] border border-line bg-surface p-4 text-left sm:grid-cols-[1fr_15rem] sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow">My earnings</div>
              <div className="font-display text-xl font-bold">Good evening, Tobi</div>
            </div>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-solid-hover dark:text-[#c9bfff]">Tier 1</span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {(
              [
                ["Verified", f.verified, "text-fg"],
                ["Holding", f.holding, "text-holding"],
                ["Paid", f.paid, "text-money"],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="rounded-xl border border-line p-3">
                <div className="text-[10px] font-medium tracking-wide text-muted uppercase">{label}</div>
                <div className={`mt-0.5 font-display text-lg font-bold sm:text-2xl ${tone}`}>
                  {entered ? <Ticker value={value} kind="usd" from={reduce ? value : 0} /> : usd(0)}
                </div>
              </div>
            ))}
          </div>

          <motion.ul className="mt-4 divide-y divide-line" animate={{ opacity: restarting && !reduce ? [1, 0.35, 1] : 1 }} transition={{ duration: 0.6 }}>
            {ROWS.map((meta, i) => {
              const row = f.rows[i];
              const hit = f.hit?.row === i;
              return (
                <motion.li
                  key={meta.title}
                  initial={reduce ? false : { opacity: 0, x: -16 }}
                  animate={entered ? { opacity: 1, x: 0 } : undefined}
                  transition={{ delay: 0.35 + i * 0.12, duration: 0.5, ease: "easeOut" }}
                  className="relative flex items-center gap-3 py-2.5"
                >
                  {/* green sweep when a report lands on this clip */}
                  <motion.span
                    key={hit ? `hit-${step}` : "idle"}
                    aria-hidden
                    initial={{ opacity: hit ? 0.9 : 0 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 1.6, ease: "easeOut" }}
                    className="pointer-events-none absolute inset-x-[-0.5rem] inset-y-0.5 rounded-lg bg-money/12"
                  />
                  <ShortThumb caption={meta.caption} hue={meta.hue} className="w-9 shrink-0 rounded-lg !shadow-none [&_span]:!text-[5px]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{meta.title}</div>
                    <div className="text-xs text-muted">
                      <Ticker value={row.views} kind="int" /> verified views
                    </div>
                  </div>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={row.status}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.35 }}
                    >
                      <StatusBadge status={row.status} />
                    </motion.span>
                  </AnimatePresence>
                  <span className="relative hidden w-16 text-right text-sm font-semibold sm:block">
                    <Ticker value={row.earned} kind="usd" />
                    {hit && f.hit && <Gain id={step} amount={f.hit.amount} className="-top-3 right-0" />}
                  </span>
                </motion.li>
              );
            })}
          </motion.ul>
        </div>

        <div className="relative hidden flex-col gap-3 overflow-hidden rounded-2xl bg-night p-4 text-white sm:flex">
          {/* glow when a release lands in the balance */}
          <motion.span
            key={f.released ? `rel-${step}` : "idle"}
            aria-hidden
            initial={{ opacity: f.released ? 1 : 0 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 2, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgb(43_217_138/0.35),transparent_60%)]"
          />
          <div className="relative text-xs text-white/60">Available balance</div>
          <div className="relative font-display text-3xl font-bold">
            {entered ? <Ticker value={f.paid} kind="usd" from={reduce ? f.paid : 0} /> : usd(0)}
            {f.released && <Gain id={step} amount={f.released} className="-top-4 left-0 text-sm" />}
          </div>
          <div className="relative text-xs text-white/50">USDC on Monad</div>
          <AnimatePresence>
            {f.released && (
              <motion.div
                key={`paid-${step}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
                className="relative flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] text-white/80"
              >
                <span className="size-1.5 rounded-full bg-money" /> Released after the 24 h hold
              </motion.div>
            )}
          </AnimatePresence>
          <div className="relative mt-auto flex flex-col gap-2">
            <span className="rounded-full bg-white py-2 text-center text-sm font-semibold text-ink">Send USDC</span>
            <span className="text-center text-[11px] text-white/40">No fees. No seed phrase.</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
