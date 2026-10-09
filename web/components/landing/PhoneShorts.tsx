"use client";

import { useEffect, useState } from "react";
import { LoopVideo } from "@/components/ui/LoopVideo";
import { CheckCircle, ShortsIcon } from "@/components/ui/Icons";
import { compact } from "@/lib/format";

type Slide = {
  caption: string;
  /** The Short itself: always a looping clip, never a still. */
  media: { video: string; poster: string };
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
    media: { video: "/video/short-selfie.mp4", poster: "/video/short-selfie.jpg" },
    handle: "@tobi.cuts",
    campaign: "Clip the Cliprail launch talk",
    views: 18420,
    earned: "$18.42",
    code: "CR-3FA9B21C7D02E4A1",
    note: "Paid $12.00 · rest unlocks in 20 h",
  },
  {
    caption: "bots earn nothing",
    media: { video: "/video/short-tulips.mp4", poster: "/video/short-tulips.jpg" },
    handle: "@adaeze.edits",
    campaign: "Indie trailer cuts for launch week",
    views: 12330,
    earned: "$12.33",
    code: "CR-91C04E7A2B6D58F3",
    note: "1,240 bot views rejected by the like floor",
  },
  {
    caption: "POV: you got paid for this",
    media: { video: "/video/short-dance.mp4", poster: "/video/short-dance.jpg" },
    handle: "@kola.cuts",
    campaign: "Clip the Cliprail launch talk",
    views: 31200,
    earned: "$20.00",
    code: "CR-5D17A0C3E9B24F86",
    note: "Hit the $20 per-clip cap · budget shared fairly",
  },
];

const RAIL = [
  { label: (v: number) => compact(Math.round(v * 0.06)), path: "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.4 5c2 0 3.3 1 4.1 2.2h3c.8-1.2 2.1-2.2 4.1-2.2C21 5 23.1 8.4 21.6 11.8 19.5 16.4 12 21 12 21Z" },
  { label: (v: number) => compact(Math.round(v * 0.004)), path: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4.5 3.5V17H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" },
  { label: () => "Share", path: "M14 4l7 7-7 7v-4.2C8.6 13.8 5.2 15.6 3 20c.6-6.4 4-11.1 11-12V4Z" },
];

const HOLD_MS = 4200;

/** One Short, full screen inside the phone: the scene, YouTube-style action rail, and the Cliprail overlay. */
function ShortScreen({ s }: { s: Slide }) {
  return (
    <div className="relative h-full w-full shrink-0 overflow-hidden bg-black text-white">
      <LoopVideo src={s.media.video} poster={s.media.poster} className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent via-40% to-black/80" />
      <div className="absolute inset-x-0 top-[22%] pr-14 pl-4 text-center">
        <span className="inline bg-black/70 box-decoration-clone px-2 py-0.5 font-display text-xl leading-relaxed font-bold uppercase">
          {s.caption}
        </span>
      </div>

      {/* right-hand action rail, like the Shorts player */}
      <div className="absolute right-2.5 bottom-[11rem] flex flex-col items-center gap-3 text-[10px] font-semibold">
        {RAIL.map((r, n) => (
          <div key={n} className="flex flex-col items-center gap-1">
            <span className="grid size-9 place-items-center rounded-full bg-black/35 backdrop-blur">
              <svg viewBox="0 0 24 24" className="size-[18px]" fill="white" aria-hidden>
                <path d={r.path} />
              </svg>
            </span>
            {r.label(s.views)}
          </div>
        ))}
        <span className="mt-1 size-8 animate-[spin_6s_linear_infinite] rounded-md border-2 border-white/80 bg-[conic-gradient(#ff5f6d,#ffc371,#5ee3a1,#6e54ff,#ff5f6d)]" aria-hidden />
      </div>

      {/* channel + title */}
      <div className="absolute inset-x-0 bottom-[8.6rem] px-3.5 pr-14 text-xs">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid size-6 place-items-center rounded-full bg-accent text-[10px] font-bold">{s.handle[1].toUpperCase()}</span>
          {s.handle}
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-ink">Subscribe</span>
        </div>
        <p className="mt-1 truncate text-white/85">{s.campaign} · #shorts</p>
      </div>

      {/* playback progress */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
        <div className="h-full w-full origin-left animate-[shorts-progress_4.2s_linear_infinite] bg-[#ff0033]" />
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
      {/* side buttons */}
      <span aria-hidden className="absolute top-28 -left-[3px] h-8 w-[3px] rounded-l bg-[#2a2a33]" />
      <span aria-hidden className="absolute top-40 -left-[3px] h-14 w-[3px] rounded-l bg-[#2a2a33]" />
      <span aria-hidden className="absolute top-36 -right-[3px] h-20 w-[3px] rounded-r bg-[#2a2a33]" />
      {/* bezel with a titanium-like edge */}
      <div className="rounded-[2.9rem] bg-[linear-gradient(145deg,#4a4a55,#1c1c22_35%,#2c2c34_70%,#55555f)] p-[3px] shadow-[0_40px_90px_-30px_rgb(5_10_40/0.6)]">
      <div className="rounded-[2.75rem] bg-[#0d0d11] p-2">
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
          <div className="absolute top-1/2 right-0 flex -translate-y-1/2 flex-col">
            {SLIDES.map((s, n) => (
              // the bar stays thin; the button around it is a finger-sized target
              <button key={s.handle} type="button" aria-label={`Show ${s.handle}'s Short`} onClick={() => setI(n)} className="grid w-6 place-items-center py-1">
                <span className={`w-1 rounded-full bg-white transition-all ${n === i ? "h-5 opacity-100" : "h-2 opacity-40"}`} />
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
