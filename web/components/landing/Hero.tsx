import { LinkButton } from "@/components/ui/Button";
import { AvatarStack } from "@/components/ui/Avatar";
import { CheckCircle } from "@/components/ui/Icons";
import { compact, usd } from "@/lib/format";
import type { Totals } from "@/lib/types";
import { PhoneShorts } from "./PhoneShorts";
import { ProductWindow } from "./ProductWindow";

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`absolute z-10 hidden items-center gap-2 rounded-full border border-white bg-white/90 px-3.5 py-2 dark:border-white/10 dark:bg-surface/85 text-xs font-semibold shadow-[var(--shadow-float)] backdrop-blur md:flex ${className}`}>
      {children}
    </div>
  );
}

export function Hero({ totals }: { totals: Totals }) {
  return (
    <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40">
      <div className="relative mx-auto max-w-6xl px-4 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-white/90 dark:border-white/10 dark:bg-white/5 dark:text-white/80 text-xs font-medium shadow-[var(--shadow-soft)] backdrop-blur">
          <span className="size-1.5 animate-pulse rounded-full bg-money" />
          Live on Monad testnet · views verified by Chainlink
        </span>
        <p className="eyebrow mt-6 !text-white/70 dark:!text-white/60">Clip · Post · Get paid</p>
        <h1 className="mx-auto mt-3 max-w-4xl text-[2.6rem] leading-[1.02] font-bold text-white drop-shadow-[0_2px_24px_rgb(5_30_80/0.25)] sm:text-7xl">
          Get paid for every
          <br />
          <span className="bg-gradient-to-r from-[#d4c9ff] to-[#9fe0ff] bg-clip-text text-transparent dark:from-[#b9a8ff] dark:to-[#7fd3ff]">verified view.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-white/85 sm:text-lg dark:text-white/70">
          Brands lock the budget in escrow before you post. Real views are checked by an oracle, bots earn nothing, and you&apos;re
          paid in USDC within a day.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton href="/campaigns">Start clipping →</LinkButton>
          <LinkButton href="/brand/new" variant="secondary">Launch a campaign</LinkButton>
        </div>
        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-white/75 dark:text-white/60">
          <AvatarStack names={["Tobi Cuts", "Adaeze Edits", "Kay Clips", "Vertical Vibes"]} size={26} />
          <span className="tabular">
            {totals.clippers}+ clippers · {usd(totals.paid, { cents: false })} paid · {compact(totals.verifiedViews)} verified views
          </span>
        </div>
      </div>

      {/* Product shot: the clipper dashboard on the left, a phone playing the Shorts that earned it on the right */}
      <div className="relative mx-auto mt-14 grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
        {/* extends a little past the text column on the left on wide screens */}
        <div className="relative min-w-0 xl:-ml-10 2xl:-ml-20">
          <Chip className="-top-4 left-10">
            <CheckCircle /> 2,310 views verified · <span className="text-money">+$2.31</span>
          </Chip>
          <Chip className="-bottom-4 left-1/3">
            <span className="size-2 rounded-full bg-money" /> Paid $12.00 · 24 h after verification
          </Chip>
          <ProductWindow />
        </div>
        <PhoneShorts />
      </div>
    </section>
  );
}
