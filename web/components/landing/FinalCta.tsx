import { LinkButton } from "@/components/ui/Button";
import Image from "next/image";

export function FinalCta() {
  return (
    <section className="px-3">
      <div className="relative mx-auto grid max-w-6xl overflow-hidden rounded-[32px] bg-accent px-6 py-14 text-white sm:grid-cols-[1.3fr_1fr] sm:px-12">
        <div>
          <h2 className="max-w-md text-4xl font-bold sm:text-5xl">Your next clip could pay tonight.</h2>
          <p className="mt-3 max-w-md text-white/80">Pick a campaign, post a Short, get paid per verified view.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/campaigns" variant="secondary" className="!border-white">Start clipping →</LinkButton>
            <LinkButton href="/brand/new" variant="ink">Launch a campaign</LinkButton>
          </div>
        </div>
        <div className="pointer-events-none relative mt-10 hidden justify-end sm:mt-0 sm:flex">
          <div className="relative aspect-[4/5] w-60 rotate-3 overflow-hidden rounded-3xl shadow-[0_30px_60px_-20px_rgb(20_10_60/0.6)] ring-4 ring-white/20 lg:w-64">
            <Image src="/photos/cta-halo.webp" alt="Creator lit by a ring light, surrounded by phones filming her" fill sizes="16rem" className="object-cover" />
          </div>
          <div className="force-light absolute bottom-6 left-2 flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-fg shadow-[var(--shadow-float)] lg:left-8">
            <span className="size-2 rounded-full bg-money" /> +$9.10 · 9,100 verified views
          </div>
        </div>
      </div>
    </section>
  );
}
