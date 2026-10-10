import { LoopVideo } from "@/components/ui/LoopVideo";
import Link from "next/link";
import { PageHeader } from "@/components/site/PageHeader";
import { LinkButton } from "@/components/ui/Button";
import { CheckCircle } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";
import { ActivePill } from "@/components/ui/ActivePill";

export const metadata = {
  title: "How it works · Cliprail",
  description: "Step-by-step guides for clippers, brands and judges, and the rules that protect each side.",
};

type Track = "clippers" | "brands" | "judges";
type Step = { title: string; body: string };

const TRACKS: Record<
  Track,
  { label: string; video: string; poster: string; pitch: string; steps: Step[]; rules: [string, string][]; cta: { href: string; label: string } }
> = {
  clippers: {
    label: "Clippers",
    video: "/video/bg-cafe.mp4",
    poster: "/video/bg-cafe.jpg",
    pitch: "Cut Shorts from campaigns that are already funded, and get paid in USDC for every view an oracle can verify.",
    steps: [
      { title: "Sign up with a passkey", body: "Face ID or your fingerprint. No app, no seed phrase, no gas. Your account works on your phone straight away." },
      { title: "Pick a campaign", body: "Every budget is locked in escrow before you start. Check the rate, the per-clip cap, the like floor, the hold window and the brand's reject rate." },
      { title: "Get your claim code", body: "Each campaign gives you a code like CR-3FA9B21C7D02E4A1. It proves the Short is yours, so nobody can claim it." },
      { title: "Post your Short", body: "Upload to YouTube as a public Short, after the campaign started, with your claim code anywhere in the description." },
      { title: "Register the link", body: "Paste the link. We check the code, that it's public and the publish date, then register it for free (we cover the network fee)." },
      { title: "Earn per verified view", body: "The oracle checks views and likes every few minutes. Each check reserves your earnings straight away, then a hold window starts." },
      { title: "Get paid", body: "After the hold, USDC lands in your account automatically. Send it anywhere for free, and every payout builds your public reputation." },
    ],
    rules: [
      ["Real engagement only", "Views on a clip with almost no likes don't pay. That's how bought views are filtered out."],
      ["Spikes are capped", "Each check pays up to the campaign's velocity cap. Sudden jumps above it aren't paid."],
      ["Keep it public", "A clip that's private or deleted three checks in a row stops earning."],
      ["Tiers unlock campaigns", "5k paid views makes you Tier 1. 50k with a clean record makes you Tier 2."],
    ],
    cta: { href: "/campaigns", label: "Find a campaign" },
  },
  brands: {
    label: "Brands",
    video: "/video/guide-brand.mp4",
    poster: "/video/guide-brand.jpg",
    pitch: "Fund a brief once and pay only for views that pass your rules. Whatever isn't earned comes back to you.",
    steps: [
      { title: "Sign in and add USDC", body: "Sign in with a passkey. Your campaign budget is paid in USDC from your account." },
      { title: "Write the brief", body: "Add the source video and tell clippers what makes a good clip: length, style, what to avoid." },
      { title: "Set the rate and caps", body: "A rate per 1M views, a cap per clip so the budget is shared, and an optional minimum clipper tier." },
      { title: "Set the fraud rules", body: "A like-ratio floor against bought views, a velocity cap against spikes, and a hold window before money moves." },
      { title: "Fund escrow", body: "The budget is locked in the vault contract. Clippers can see it's real, which is why good clippers join." },
      { title: "Watch clips arrive", body: "Your console shows every clip, its verified views, what's reserved and what's paid, live." },
      { title: "Flag, or close any time", body: "Flag a clip during its hold if it breaks your brief. Close the campaign whenever you like and get back everything not yet earned." },
    ],
    rules: [
      ["You only pay for verified views", "An oracle reads real view and like counts from YouTube. Nothing else can trigger a payout."],
      ["The budget is never overdrawn", "Payouts stop at your budget and at each clip's cap, enforced by the contract."],
      ["One flag per clip", "Disputes are limited and on the record, so clippers trust your campaign."],
      ["Your reject rate is public", "Clippers see it before they join. Fair brands attract better clippers."],
    ],
    cta: { href: "/brand/new", label: "Launch a campaign" },
  },
  judges: {
    label: "Judges",
    video: "/video/guide-judge.mp4",
    poster: "/video/guide-judge.jpg",
    pitch: "Settle disputes between brands and clippers in an area you know, and build a public record of good calls.",
    steps: [
      { title: "Apply", body: "Tell us the areas you know best, like music, gaming or beauty. Applications open with appointed judging." },
      { title: "Get appointed", body: "Brands appoint you to judge their campaign, or pick you from the network. Clippers see who judges before they join." },
      { title: "Review a flagged clip", body: "You see the evidence: verified views and likes, the claim code, the publish date and the brand's reason." },
      { title: "Decide before the deadline", body: "Accept and the clip keeps earning. Reject and the earnings still in hold return to the budget." },
      { title: "Build your record", body: "Every decision is on chain: how many you made, how fast, and how often they held up." },
    ],
    rules: [
      ["Silence means accept", "If nobody decides by the deadline, the clip is accepted. Clippers are never stuck."],
      ["Only money still in hold", "Earnings that cleared the hold are paid first and can never be taken back."],
      ["One flag per clip", "A clip can only be disputed once."],
      ["Everything is public", "Judges, brands and clippers all build records anyone can check."],
    ],
    cta: { href: "/judges", label: "About judging" },
  },
};

export default async function GuidePage({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const { for: f } = await searchParams;
  const track: Track = f === "brands" || f === "judges" ? f : "clippers";
  const t = TRACKS[track];

  return (
    <>
      <PageHeader eyebrow="How it works" title="Everything you need, step by step." width="max-w-5xl">
        Pick who you are. Each guide walks through the whole flow and the rules that matter to you.
      </PageHeader>

      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
        <nav aria-label="Guides" className="glass inline-flex self-start rounded-full p-1">
          {(Object.keys(TRACKS) as Track[]).map((k) => (
            <Link
              key={k}
              href={`/guide?for=${k}`}
              scroll={false}
              aria-current={k === track ? "page" : undefined}
              className={cn(
                "relative isolate rounded-full px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors duration-200 sm:px-4 sm:text-sm",
                k === track ? "text-accent-fg" : "text-muted hover:text-fg",
              )}
            >
              {k === track && <ActivePill id="guide-track" className="bg-accent-solid shadow-[var(--shadow-soft)]" />}
              For {TRACKS[k].label.toLowerCase()}
            </Link>
          ))}
        </nav>

        <section className="glass grid overflow-hidden rounded-[2rem] md:grid-cols-[1fr_1.1fr]">
          <div className="relative min-h-56">
            <LoopVideo key={t.video} src={t.video} poster={t.poster} className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent md:bg-gradient-to-r md:from-transparent md:to-black/10" />
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-8">
            <p className="eyebrow">For {t.label.toLowerCase()}</p>
            <h2 className="mt-2 text-3xl font-bold">{t.steps.length} steps, start to finish.</h2>
            <p className="mt-3 text-muted">{t.pitch}</p>
            <div className="mt-6">
              <LinkButton href={t.cta.href}>{t.cta.label} →</LinkButton>
            </div>
          </div>
        </section>

        <ol className="relative grid gap-3 sm:grid-cols-2">
          {t.steps.map((s, i) => (
            <li key={s.title} className="glass flex gap-4 rounded-[var(--radius-card)] p-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-solid text-sm font-bold text-accent-fg">{i + 1}</span>
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="glass rounded-[2rem] p-6 sm:p-8">
          <h2 className="text-xl font-bold">The rules that matter to {t.label.toLowerCase()}</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {t.rules.map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 text-money">
                  <CheckCircle />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
