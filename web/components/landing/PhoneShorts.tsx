"use client";

import { useEffect, useState } from "react";
import { CheckCircle, ShortsIcon } from "@/components/ui/Icons";
import { compact } from "@/lib/format";

type Slide = {
  caption: string;
  hue: number;
  handle: string;
  campaign: string;
  views: number;
  earned: string;
  code: string;
  note: string;
};

const SLIDES: Slide[] = [
  {
    caption: "the 2-second hook that pays",
    hue: 262,
    handle: "@tobi.cuts",
    campaign: "Clip the Cliprail launch talk",
    views: 18420,
    earned: "$18.42",
    code: "CR-3FA9B21C7D02E4A1",
    note: "Paid $12.00 · rest unlocks in 20 h",
  },
  {
    caption: "bots earn nothing",
    hue: 195,
    handle: "@adaeze.edits",
    campaign: "Indie trailer cuts for launch week",
    views: 12330,
    earned: "$12.33",
    code: "CR-91C04E7A2B6D58F3",
    note: "1,240 bot views rejected by the like floor",
  },
];

const HOLD_MS = 4200;

/** One Short, full screen inside the phone: the scene, YouTube-style action rail, and the Cliprail overlay. */
function ShortScreen({ s }: { s: Slide }) {
  return (
    <div
      className="relative h-full w-full shrink-0 overflow-hidden text-white"
      style={{
        background: `radial-gradient(80% 45% at 30% 28%, hsl(${s.hue} 90% 68% / .9), transparent 70%),
          radial-gradient(70% 55% at 80% 80%, hsl(${(s.hue + 60) % 360} 85% 55% / .85), transparent 70%),
          linear-gradient(160deg, hsl(${s.hue} 45% 22%), hsl(${(s.hue + 30) % 360} 50% 10%))`,
      }}
    >
      <div className="absolute inset-x-0 top-[22%] pr-14 pl-4 text-center">
        <span className="inline bg-black/70 box-decoration-clone px-2 py-0.5 font-display text-xl leading-relaxed font-bold uppercase">
          {s.caption}
        </span>
      </div>

      {/* right-hand action rail, like the Shorts player */}
      <div className="absolute right-2.5 bottom-[11rem] flex flex-col items-center gap-3 text-[10px] font-semibold">
        {[
          ["♥", compact(Math.round(s.views * 0.06))],
          ["💬", compact(Math.round(s.views * 0.004))],
          ["↗", "Share"],
        ].map(([icon, label]) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span className="grid size-9 place-items-center rounded-full bg-black/35 text-sm backdrop-blur">{icon}</span>
            {label}
          </div>
        ))}
      </div>

      {/* channel + title */}
      <div className="absolute inset-x-0 bottom-[8.6rem] px-3.5 pr-14 text-xs">
        <div className="flex items-center gap-2 font-semibold">
          <span className="size-6 rounded-full" style={{ background: `hsl(${s.hue} 70% 60%)` }} />
          {s.handle}
        </div>
        <p className="mt-1 truncate text-white/85">{s.campaign} · #shorts</p>
      </div>

      {/* Cliprail overlay: what the oracle saw and what it paid */}
      <div className="absolute inset-x-2.5 bottom-3 rounded-2xl border border-white/15 bg-black/55 p-3 backdrop-blur-md">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5ee3a1]">
          <CheckCircle className="size-3.5" /> Claim code found
        </div>
        <code className="mt-0.5 block font-mono text-[11px] tracking-tight text-white/80">{s.code}</code>
        <div className="tabular mt-2 grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] text-white/60 uppercase">Verified views</div>
            <div className="font-display text-lg font-bold">{s.views.toLocaleString("en-US")}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/60 uppercase">Earned</div>
            <div className="font-display text-lg font-bold text-[#5ee3a1]">{s.earned}</div>
          </div>
        </div>
        <div className="mt-1.5 text-[10px] text-white/70">{s.note}</div>
      </div>
    </div>
  );
}

/**
 * A phone playing clippers' Shorts. It swipes up to the next one every few seconds (Shorts-style), pauses while
 * hovered, and stays still for reduced-motion users.
 */
export function PhoneShorts() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % SLIDES.length), HOLD_MS);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <div
      className="relative mx-auto w-[17.5rem] shrink-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* bezel */}
      <div className="rounded-[2.9rem] border border-white/15 bg-[#16161c] p-2.5 shadow-[0_40px_90px_-30px_rgb(5_10_40/0.6),inset_0_0_0_1.5px_rgb(255_255_255/0.06)]">
        <div className="relative aspect-[9/19] overflow-hidden rounded-[2.3rem] bg-black">
          {/* feed: slides stacked vertically, moved up one screen per step */}
          <div
            className="flex h-full flex-col transition-transform duration-700 ease-[cubic-bezier(.65,0,.35,1)]"
            style={{ transform: `translateY(-${i * 100}%)` }}
          >
            {SLIDES.map((s) => (
              <ShortScreen key={s.handle} s={s} />
            ))}
          </div>

          {/* status bar + island */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-6 pt-3 text-[11px] font-semibold text-white">
            <span>9:41</span>
            <span className="absolute top-2.5 left-1/2 h-6 w-20 -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-1">
              <span className="tracking-tighter">▂▄▆</span>
              <span className="inline-block h-2.5 w-5 rounded-[3px] border border-white/80 p-px">
                <span className="block h-full w-3/4 rounded-[1px] bg-white" />
              </span>
            </span>
          </div>
          {/* Shorts header */}
          <div className="pointer-events-none absolute inset-x-0 top-9 flex items-center gap-1.5 px-4 text-sm font-bold text-white">
            <ShortsIcon className="size-4" /> Shorts
          </div>

          {/* which Short is showing */}
          <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 flex-col gap-1.5">
            {SLIDES.map((s, n) => (
              <button
                key={s.handle}
                type="button"
                aria-label={`Show ${s.handle}'s Short`}
                onClick={() => setI(n)}
                className={`w-1 rounded-full bg-white transition-all ${n === i ? "h-5 opacity-100" : "h-2 opacity-40"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
