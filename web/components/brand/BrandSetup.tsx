"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle } from "@/components/ui/Icons";
import { LoopVideo } from "@/components/ui/LoopVideo";
import { cn } from "@/lib/cn";

/**
 * The brand console's top band: a setup checklist that says why each step pays off, beside a short video of what the
 * brand is buying. Progress is saved per device; steps that the console can see (a launched campaign) tick themselves.
 */
type Step = { key: string; title: string; why: string; href?: string; cta?: string };

const STEPS: Step[] = [
  { key: "account", title: "Sign in with a passkey", why: "Your campaigns and refunds are tied to this account. No seed phrase to lose." },
  { key: "brief", title: "Write a brief clippers can act on", why: "Clear briefs get better clips: hook, length, style, what to avoid.", href: "/guide?for=brands", cta: "See good briefs" },
  { key: "rules", title: "Set your fraud rules", why: "A like floor and velocity cap stop bought views before they touch your budget.", href: "/brand/new", cta: "Set rules" },
  { key: "fund", title: "Fund escrow and launch", why: "A funded budget is what makes good clippers say yes.", href: "/brand/new", cta: "Launch" },
  { key: "judge", title: "Choose who judges disputes", why: "Clippers trust campaigns with a fair judge. You, or a specialist.", href: "/judges", cta: "How judging works" },
];

const KEY = "cliprail.brand-setup.v1";

export function BrandSetup({ hasCampaign }: { hasCampaign: boolean }) {
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from storage after mount
      setDone(saved);
    } catch {
      // storage blocked: start empty
    }
  }, []);

  const auto: Record<string, boolean> = { account: true, brief: hasCampaign, rules: hasCampaign, fund: hasCampaign };
  const isDone = (k: string) => !!(auto[k] || done[k]);
  const count = STEPS.filter((s) => isDone(s.key)).length;
  const toggle = (k: string) => {
    const next = { ...done, [k]: !done[k] };
    setDone(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage blocked: keep it for this visit
    }
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <div className="glass rounded-[2rem] p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Set up</p>
            <h2 className="mt-1 text-xl font-bold">Five steps to a campaign clippers want</h2>
          </div>
          <span className="tabular rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent dark:bg-accent/20 dark:text-[#c9bfff]">
            {count}/{STEPS.length}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-[#50c7ff] transition-[width] duration-500" style={{ width: `${(count / STEPS.length) * 100}%` }} />
        </div>
        <ol className="mt-4 flex flex-col gap-1">
          {STEPS.map((s, i) => {
            const d = isDone(s.key);
            return (
              <li key={s.key} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-2xl px-2 py-2.5 transition hover:bg-white/40 dark:hover:bg-white/[0.04]">
                <button
                  type="button"
                  onClick={() => !auto[s.key] && toggle(s.key)}
                  aria-label={d ? `${s.title}: done` : `Mark ${s.title} as done`}
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold transition",
                    d ? "border-money bg-money text-white" : "border-line text-muted hover:border-accent",
                  )}
                >
                  {d ? <CheckCircle className="size-3.5" /> : i + 1}
                </button>
                <div className="min-w-0 flex-1 basis-48">
                  <p className={cn("text-sm font-semibold", d && "text-muted line-through decoration-1")}>{s.title}</p>
                  <p className="text-xs text-muted">{s.why}</p>
                </div>
                {s.href && !d && (
                  <Link href={s.href} className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-accent max-sm:ml-6 hover:bg-accent-soft dark:text-[#c9bfff]">
                    {s.cta} →
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="relative min-h-72 overflow-hidden rounded-[2rem] shadow-[0_24px_60px_-28px_rgb(10_20_60/0.6)]">
        <LoopVideo src="/video/brand-led.mp4" poster="/video/brand-led.jpg" className="absolute inset-0 size-full object-cover object-[50%_25%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#120d3a]/95 via-[#120d3a]/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white">
          <p className="text-xs font-semibold tracking-widest text-white/70 uppercase">What you&apos;re paying for</p>
          <p className="mt-2 text-lg leading-snug font-bold">Real people, filming real Shorts about your brand. You pay only for views an oracle verifies.</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="relative size-10 overflow-hidden rounded-full ring-2 ring-white/60">
              <Image src="/clips/clip-02.webp" alt="" fill sizes="40px" className="object-cover" />
            </div>
            <div className="relative -ml-5 size-10 overflow-hidden rounded-full ring-2 ring-white/60">
              <Image src="/clips/clip-04.webp" alt="" fill sizes="40px" className="object-cover" />
            </div>
            <div className="relative -ml-5 size-10 overflow-hidden rounded-full ring-2 ring-white/60">
              <Image src="/clips/clip-10.webp" alt="" fill sizes="40px" className="object-cover" />
            </div>
            <span className="text-xs text-white/80">Clippers join funded campaigns first</span>
          </div>
        </div>
      </div>
    </section>
  );
}
