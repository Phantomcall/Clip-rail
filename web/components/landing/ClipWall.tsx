import { ShortThumb } from "@/components/ui/ShortThumb";

const clips = [
  ["the 2-second hook", 262, 18420], ["paid in 24 hours", 150, 12330], ["escrow explained", 28, 9100], ["bots earn nothing", 340, 22000],
  ["clip of the week", 200, 31000], ["why brands love this", 48, 7400], ["face id sign up", 290, 5600], ["verified onchain", 190, 14800],
] as const;

/** Auto-scrolling wall of clips (Clipping.net's creator wall, with our own drawn thumbnails). */
export function ClipWall() {
  const row = [...clips, ...clips];
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
