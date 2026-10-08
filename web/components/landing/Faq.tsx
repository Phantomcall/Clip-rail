import Link from "next/link";
const qa = [
  ["Do I need a crypto wallet?", "No. You sign up with Face ID or your fingerprint (a passkey). Your Cliprail account is created for you. No app, no seed phrase."],
  ["How do I get paid?", "Verified earnings wait for the campaign's hold window (usually 24 hours), then USDC is sent to your account automatically. Send it to any exchange that supports USDC on Monad, with no fee."],
  ["How are views verified?", "A Chainlink CRE oracle network reads your Short's view and like counts from YouTube every few minutes and writes a signed report onchain. The contract pays from that."],
  ["Why did my clip earn nothing?", "Usually the like ratio is below the campaign's floor, the views spiked above the velocity cap, or the claim code isn't in the description. Check your clip on My earnings."],
  ["What if the brand runs out of budget?", "It can't vanish: the budget is locked before you post, and your earnings are reserved the moment they're verified."],
  ["Which platforms?", "YouTube Shorts today. TikTok, Instagram and X are next."],
];

export function Faq() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20">
      <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
        <div>
          <p className="eyebrow">No fine print</p>
          <h2 className="mt-3 text-4xl font-bold">Questions, answered.</h2>
          <p className="mt-4 max-w-sm text-muted">The important parts of Cliprail should be clear before you make a clip or fund a campaign.</p>
          <Link href="/#how-it-works" className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-sm font-semibold text-accent hover:bg-accent hover:text-white">See how it works <span>→</span></Link>
        </div>
      <div className="divide-y divide-line rounded-3xl border border-line bg-surface px-5 shadow-[var(--shadow-soft)]">
        {qa.map(([q, a]) => (
          <details key={q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {q}
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 pr-8 text-sm text-muted">{a}</p>
          </details>
        ))}
      </div>
      </div>
    </section>
  );
}
