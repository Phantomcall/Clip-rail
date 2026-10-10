import Link from "next/link";
import Image from "next/image";
import { LoopVideo } from "@/components/ui/LoopVideo";
import { Avatar } from "@/components/ui/Avatar";
import { ShortsIcon, VerifiedIcon, CheckIcon } from "@/components/ui/Icons";
import { Arrow } from "@/components/ui/Arrow";

/** A real photo of the step, with the step's UI card floating over its lower half. */
function Frame({ photo, alt, children }: { photo: string; alt: string; children: React.ReactNode }) {
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-white/10">
      <Image src={photo} alt={alt} fill sizes="(min-width: 768px) 22rem, 90vw" className="object-cover object-[50%_25%]" />
      <div className="absolute inset-0 bg-gradient-to-t from-night via-night/30 to-transparent" />
      <div className="absolute inset-x-5 bottom-5 flex justify-center">{children}</div>
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
        <code className="font-mono text-sm font-bold tracking-tight whitespace-nowrap">CR-3FA9B21C7D02E4A1</code>
        <span className="rounded-md bg-surface-2 px-2 py-1 text-[10px] font-semibold">Copy</span>
      </div>
      <div className="mt-3 rounded-lg border border-line px-2.5 py-2 text-[11px] text-muted">youtube.com/shorts/Ab3dEf6hIj9</div>
      <ul className="mt-2 space-y-1 text-[11px]">
        <li className="flex items-center gap-1 text-money"><CheckIcon className="size-3" /> Code found in description</li>
        <li className="flex items-center gap-1 text-money"><CheckIcon className="size-3" /> Posted after the campaign started</li>
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
  { n: "01", title: "Pick a campaign", body: "Every budget is already locked in escrow. See the rate, the rules and what's left before you clip.", ui: <CampaignMini />, photo: "/photos/step-browse.webp", alt: "Clipper smiling while browsing campaigns on her phone" },
  { n: "02", title: "Post with your code", body: "Cut a Short, put your claim code in the description and paste the link. Free: we cover the network fee.", ui: <RegisterMini />, photo: "/photos/step-post.webp", alt: "Phone on a gimbal recording dancers for a Short" },
  { n: "03", title: "Get paid", body: "An oracle checks your real views every few minutes. After a 24-hour hold, USDC lands in your account.", ui: <BalanceMini />, photo: "/photos/step-paid.webp", alt: "Clipper delighted at a payout on her phone" },
];

/** "How it works": each step as a real UI card, over a full-width darkened photo. */
export function MakeBank() {
  return (
    <section id="how-it-works" className="relative isolate -mt-56 overflow-hidden text-white">
      {/* Full-bleed photo backdrop, darkened for readable text, fading in and out at the edges so it blends with
          the sections above and below in every theme */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {/* The band's own sky: it starts at the exact colour of the sky above (which fades out over it), deepens to
            navy behind the steps, then lands on the ambient sky below, never passing through grey. One layer per sky
            phase (the hero sky has four), cross-fading with the theme like the rest of the sky. */}
        <div className="cr-band-morning absolute inset-0 opacity-0 transition-opacity duration-[1400ms] sky-morning:opacity-100" />
        <div className="cr-band-day absolute inset-0 opacity-0 transition-opacity duration-[1400ms] sky-afternoon:opacity-100" />
        <div className="cr-band-evening absolute inset-0 opacity-0 transition-opacity duration-[1400ms] sky-evening:opacity-100" />
        <div className="cr-band-night absolute inset-0 opacity-0 transition-opacity duration-[1400ms] sky-night:opacity-100" />
        {/* the video fades in below the campaign cards and dissolves before the band ends (cr-band-media mask) */}
        <div className="cr-band-media absolute inset-0">
          {/* tablet and desktop: a clipper checking her phone, a landscape cut mirrored so she sits on the right */}
          <LoopVideo src="/video/band-texting2.mp4" poster="/video/band-texting2.jpg" className="absolute inset-0 hidden size-full object-cover object-[50%_40%] md:block" />
          {/* phones: the band is ~2,500 px tall there, so a landscape clip stretched over it is blown up ~6x. Instead the
              same clipper, filmed vertically, sits behind the heading at its natural 9:16 and fades into the navy the
              step cards sit on. Hidden videos never load (LoopVideo waits until it's on screen). */}
          <div className="absolute inset-x-0 top-0 aspect-[9/16] md:hidden">
            <LoopVideo src="/video/band-portrait.mp4" poster="/video/band-portrait.jpg" className="size-full object-cover object-[40%_30%]" />
            {/* her face stays clear above the heading; the text area below gets a deeper wash so it reads cleanly */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent from-35% via-[#0b1840]/60 via-60% to-[#0b1840] dark:via-[#080f26]/60 dark:to-[#080f26]" />
          </div>
          {/* darken the photo so white text reads on it */}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(11_40_110/0.35)_0%,rgb(10_30_85/0.3)_35%,rgb(8_20_60/0.7)_75%,rgb(8_15_40/0.85)_100%)] transition-[background] duration-[1400ms] dark:bg-[linear-gradient(180deg,rgb(8_21_48/0.55)_0%,rgb(8_21_48/0.4)_35%,rgb(8_14_34/0.78)_75%,rgb(8_11_24/0.9)_100%)]" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-5 pt-80 pb-40 sm:px-10">
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-wider text-white/60 uppercase">How it works</span>
        <h2 className="mt-5 text-4xl font-bold sm:text-5xl">Get views. Get paid.</h2>
        <p className="mt-3 max-w-xl text-white/60">
          The money exists before you post, the views are checked by a Chainlink CRE oracle, and the payout is a transaction you can open.
        </p>
        <Link href="/guide" className="group mt-4 inline-block text-sm font-semibold text-white/85 underline-offset-4 transition-colors duration-200 hover:text-white hover:underline">
          Read the full guide for clippers, brands and <span className="whitespace-nowrap">judges <Arrow /></span>
        </Link>
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n}>
              <Frame photo={s.photo} alt={s.alt}>{s.ui}</Frame>
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
