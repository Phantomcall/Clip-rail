import { Avatar } from "@/components/ui/Avatar";
import { ShortsIcon, VerifiedIcon } from "@/components/ui/Icons";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5">
      {children}
    </div>
  );
}

function CampaignMini() {
  return (
    <div className="w-full max-w-[16rem] force-light rounded-2xl bg-white p-4 shadow-xl">
      <div className="flex items-center gap-2">
        <Avatar name="Northwind Games" size={34} />
        <div>
          <div className="flex items-center gap-1 text-sm font-semibold">Northwind Games <VerifiedIcon className="size-3.5" /></div>
          <div className="text-[11px] text-muted">Per view · 8 d left</div>
        </div>
      </div>
      <p className="mt-3 text-xs">Indie trailer cuts for launch week</p>
      <div className="mt-3 flex items-end justify-between">
        <ShortsIcon className="size-5" />
        <div className="text-right">
          <div className="font-display text-xl font-bold">$1,500</div>
          <div className="text-[9px] tracking-wider text-muted uppercase">per 1M views</div>
        </div>
      </div>
    </div>
  );
}

function RegisterMini() {
  return (
    <div className="w-full max-w-[16rem] force-light rounded-2xl bg-white p-4 shadow-xl">
      <div className="text-[10px] font-medium tracking-wider text-muted uppercase">Your claim code</div>
      <div className="mt-1 flex items-center justify-between">
        <code className="font-mono text-lg font-bold">CR-3FA9B21C7D02E4A1</code>
        <span className="rounded-md bg-surface-2 px-2 py-1 text-[10px] font-semibold">Copy</span>
      </div>
      <div className="mt-3 rounded-lg border border-line px-2.5 py-2 text-[11px] text-muted">youtube.com/shorts/Ab3dEf6hIj9</div>
      <ul className="mt-2 space-y-1 text-[11px]">
        <li className="text-money">✓ Code found in description</li>
        <li className="text-money">✓ Posted after the campaign started</li>
      </ul>
      <div className="mt-3 rounded-full bg-ink py-2 text-center text-xs font-semibold text-white">Register clip</div>
    </div>
  );
}

function BalanceMini() {
  return (
    <div className="w-full max-w-[16rem] force-light rounded-2xl bg-white p-5 shadow-xl">
      <div className="text-sm text-muted">Available balance</div>
      <div className="mt-1 flex items-center justify-between">
        <span className="tabular font-display text-3xl font-bold">$41.25</span>
        <span className="rounded-full bg-ink px-3.5 py-2 text-xs font-semibold text-white">Send</span>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-money"><span className="size-1.5 rounded-full bg-money" />+$12.00 paid · 2 min ago</div>
    </div>
  );
}

const steps = [
  { n: "01", title: "Pick a campaign", body: "Every budget is already locked in escrow. See the rate, the rules and what's left before you clip.", ui: <CampaignMini /> },
  { n: "02", title: "Post with your code", body: "Cut a Short, put your claim code in the description and paste the link. Free: we cover the network fee.", ui: <RegisterMini /> },
  { n: "03", title: "Get paid", body: "An oracle checks your real views every few minutes. After a 24-hour hold, USDC lands in your account.", ui: <BalanceMini /> },
];

/** Dark "money" band (Vyro-style), showing each step as a real UI card. */
export function MakeBank() {
  return (
    <section className="px-3">
      <div className="mx-auto max-w-6xl rounded-[32px] bg-night px-5 py-14 text-white sm:px-10 sm:py-20">
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-wider text-white/60 uppercase">How it works</span>
        <h2 className="mt-5 text-4xl font-bold sm:text-5xl">Get views. Get paid.</h2>
        <p className="mt-3 max-w-xl text-white/60">
          The money exists before you post, the views are checked by a decentralized oracle, and the payout is a transaction you can open.
        </p>
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n}>
              <Frame>{s.ui}</Frame>
              <div className="mt-5">
                <span className="rounded-md bg-white/10 px-2 py-1 font-mono text-[11px] text-white/60">{s.n}</span>
                <h3 className="mt-3 text-xl font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-white/60">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
