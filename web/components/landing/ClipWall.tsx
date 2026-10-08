import Image from "next/image";
import { CheckCircle } from "@/components/ui/Icons";
import { compact } from "@/lib/format";

/** Sample Shorts: thumbnails are stock photos cropped to 9:16; captions, views and payouts are illustrative. */
const CLIPS: { caption: string; views: number; paid?: string; handle: string }[] = [
  { caption: "POV: you got paid for this", views: 31_200, paid: "+$31.20", handle: "@kola.cuts" },
  { caption: "the 2-second hook", views: 18_420, paid: "+$18.42", handle: "@tobi.cuts" },
  { caption: "late night edit drop", views: 9_100, handle: "@ayo.edits" },
  { caption: "bike to the shoot", views: 14_800, paid: "+$14.80", handle: "@femi.clips" },
  { caption: "duet with the bestie", views: 22_000, handle: "@dami.duo" },
  { caption: "reacting to my payout", views: 12_330, paid: "+$12.33", handle: "@seun.react" },
  { caption: "desk setup in 30s", views: 7_400, handle: "@nkem.daily" },
  { caption: "she said yes to the brand", views: 5_600, paid: "+$5.60", handle: "@zara.vlogs" },
  { caption: "suit check before the call", views: 11_900, handle: "@chidi.fits" },
  { caption: "city walk clip", views: 16_500, paid: "+$16.50", handle: "@adaeze.edits" },
  { caption: "one take, no cuts", views: 8_300, handle: "@ike.raw" },
  { caption: "cooking clip went viral", views: 27_400, paid: "+$27.40", handle: "@bola.kitchen" },
];

const FEED = [
  ["@kola.cuts", "2,310 views verified", "+$2.31"],
  ["@adaeze.edits", "released after 24 h hold", "+$12.00"],
  ["@bola.kitchen", "claim code found", "Active"],
  ["@tobi.cuts", "1,240 views verified", "+$1.24"],
  ["@zara.vlogs", "like floor passed", "+$0.88"],
] as const;

function ShortCard({ i }: { i: number }) {
  const c = CLIPS[i];
  return (
    <figure className="group relative aspect-[9/16] w-36 shrink-0 overflow-hidden rounded-2xl shadow-[0_18px_40px_-18px_rgb(10_20_60/0.55)] ring-1 ring-white/20 sm:w-44">
      <Image src={`/clips/clip-${String(i + 1).padStart(2, "0")}.webp`} alt="" fill sizes="11rem" className="object-cover transition duration-700 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/75" />
      <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
        <svg viewBox="0 0 24 24" className="size-3" aria-hidden>
          <path fill="#ff0033" d="M10 15l5.19-3L10 9v6Zm11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73Z" />
        </svg>
        Shorts
      </span>
      <figcaption className="absolute inset-x-0 bottom-0 p-3 text-white">
        <p className="line-clamp-2 text-[13px] leading-snug font-semibold">{c.caption}</p>
        <div className="mt-1.5 flex items-center justify-between text-[11px]">
          <span className="text-white/75">{c.handle}</span>
          <span className="tabular font-semibold">▶ {compact(c.views)}</span>
        </div>
        {c.paid && (
          <span className="tabular mt-2 inline-flex items-center gap-1 rounded-full bg-money px-2 py-0.5 text-[10px] font-bold text-white">
            <CheckCircle className="size-3" /> {c.paid} paid
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** Two rows of sample Shorts drifting in opposite directions, with a feed of the events behind each payout. */
export function ClipWall() {
  const rowA = [0, 1, 2, 3, 4, 5];
  const rowB = [6, 7, 8, 9, 10, 11];
  return (
    <section className="overflow-hidden py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col items-center justify-between gap-5 text-center sm:flex-row sm:text-left">
          <div>
            <p className="eyebrow">A live proof feed</p>
            <h2 className="mt-3 text-4xl font-bold sm:text-5xl">Real clips. Real payouts.</h2>
          </div>
          <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-2 text-xs font-semibold"><span className="size-2 rounded-full bg-money" /> Oracle verified</div>
            <p className="mt-1 text-xs text-muted">Views, rules and payout receipts are public.</p>
          </div>
        </div>
      </div>
      <div className="relative mt-10 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="flex w-max animate-marquee gap-4">
          {row.map(([c, h, v], i) => (
            <ShortThumb key={i} caption={c} hue={h} views={v} paid={i % 3 === 0 ? `+$${(v / 1000).toFixed(2)}` : undefined} className="w-36 sm:w-44" />
          ))}
        </div>
      </div>
      <p className="mx-auto mt-6 max-w-md px-4 text-center text-sm text-muted">Every moving card is a sample of what clippers and brands see: a Short, verified views, and the amount reserved for payout.</p>
    </section>
  );
}
