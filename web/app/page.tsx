import { LiveRefresh } from "@/lib/live";
import Link from "next/link";
import { BriefFlow } from "@/components/landing/BriefFlow";
import { ClipWall } from "@/components/landing/ClipWall";
import { Fairness } from "@/components/landing/Fairness";
import { ForClippers } from "@/components/landing/ForClippers";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { Hero } from "@/components/landing/Hero";
import { SkyBackdrop } from "@/components/landing/SkyBackdrop";
import { MakeBank } from "@/components/landing/MakeBank";
import { StatStrip } from "@/components/landing/StatStrip";
import { TrustBar } from "@/components/landing/TrustBar";
import { CampaignCard } from "@/components/site/CampaignCard";
import { getCampaigns, getTotals, now } from "@/lib/data";

export default async function Home() {
  const [campaigns, totals] = await Promise.all([getCampaigns(), getTotals()]);
  const NOW = now();
  const live = campaigns.filter((c) => c.status === "Active").slice(0, 3);
  return (
    <>
      {/* the sky sits behind the hero and keeps going down through the next few sections */}
      <div className="relative isolate -mt-[4.5rem]">
        <SkyBackdrop />
      <LiveRefresh />
      <Hero totals={totals} />
      <TrustBar />
      <div className="px-4 pt-12"><StatStrip totals={totals} /></div>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Open now</p>
            <h2 className="mt-2 text-4xl font-bold">Live campaigns</h2>
          </div>
          <Link href="/campaigns" className="shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium shadow-[var(--shadow-soft)] hover:border-muted/50">See all →</Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((c) => <CampaignCard key={c.id} campaign={c} now={NOW} />)}
        </div>
      </section>
      </div>

      <MakeBank />
      <ForClippers />
      <BriefFlow />
      <Fairness />
      <ClipWall />
      <Faq />
      <FinalCta />
    </>
  );
}
