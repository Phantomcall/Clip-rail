import Link from "next/link";
import { LoopVideo } from "@/components/ui/LoopVideo";
import { FaqItem } from "@/components/landing/FaqItem";
import { Arrow } from "@/components/ui/Arrow";

type QA = { q: string; a: string };

const GROUPS: { title: string; items: QA[] }[] = [
  {
    title: "Getting started",
    items: [
      { q: "Do I need a crypto wallet?", a: "No. You sign up with Face ID or your fingerprint (a passkey) and your Cliprail account is created for you. No app, no seed phrase, no gas." },
      { q: "Which platforms can I clip for?", a: "YouTube Shorts today. TikTok, Instagram and X are next." },
      { q: "Do I need followers?", a: "No. Earnings follow verified views, not follower counts. Some campaigns ask for a reputation tier, which you earn by getting paid." },
    ],
  },
  {
    title: "Getting paid",
    items: [
      { q: "How do I get paid?", a: "Verified earnings wait out the campaign's hold window (usually 24 hours), then USDC lands in your account automatically. Send it to any exchange that supports USDC on Monad, free." },
      { q: "What if the brand runs out of budget?", a: "It can't disappear: the budget is locked in escrow before you post, and your earnings are reserved the moment they're verified." },
      { q: "Why did my clip earn nothing?", a: "Usually the like ratio was below the campaign's floor, the views spiked above its velocity cap, or the claim code wasn't in the description. Your earnings page shows which." },
    ],
  },
  {
    title: "Trust and disputes",
    items: [
      { q: "How are views verified?", a: "A Chainlink CRE oracle reads each Short's view and like counts from YouTube every few minutes and writes a report on chain. The contract only pays from that report." },
      { q: "Can a brand take back what I earned?", a: "Only earnings still in the hold window, only once per clip, and only before the flag's deadline. Money that cleared the hold is paid first and can never be taken back." },
      { q: "Who decides a dispute?", a: "The brand, or a judge the campaign appoints. Every decision is on chain, and each brand's reject rate shows on its campaigns before you join." },
    ],
  },
];

export function Faq() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="grid gap-10 lg:grid-cols-[20rem_1fr] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <p className="eyebrow">No fine print</p>
          <h2 className="mt-3 text-4xl font-bold">Questions, answered.</h2>
          <p className="mt-3 text-muted">Everything important about Cliprail should be clear before you make a clip or fund a campaign.</p>
          <div className="relative mt-6 hidden aspect-[9/16] w-52 overflow-hidden rounded-3xl shadow-[0_24px_60px_-24px_rgb(10_20_60/0.55)] ring-1 ring-white/30 lg:block">
            <LoopVideo src="/video/filming-loop.mp4" poster="/video/filming-loop.jpg" className="size-full object-cover" />
            <span className="absolute bottom-3 left-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
              Shot on a phone. Paid per view.
            </span>
          </div>
          <Link
            href="/guide"
            className="group mt-6 inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-sm font-semibold text-accent-solid-hover transition-colors duration-200 ease-out-soft hover:bg-accent-solid hover:text-white dark:bg-accent/20 dark:text-[#c9bfff] dark:hover:bg-accent-solid dark:hover:text-white"
          >
            Read the full guide <Arrow />
          </Link>
        </div>

        <div className="flex flex-col gap-4">
          {GROUPS.map((g) => (
            <div key={g.title} className="glass rounded-3xl px-6 pt-5 pb-1">
              <h3 className="eyebrow">{g.title}</h3>
              <div className="mt-1">
                {g.items.map((it) => (
                  <FaqItem key={it.q} {...it} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
