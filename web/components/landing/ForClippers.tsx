import Image from "next/image";
import { LinkButton } from "@/components/ui/Button";
import { LoopVideo } from "@/components/ui/LoopVideo";
import { CheckCircle } from "@/components/ui/Icons";
import { Reveal } from "@/components/ui/Reveal";

const CREATORS = [
  { src: "/photos/creator-viral.webp", caption: "Your clip takes off", alt: "Woman reacting with surprise as phones show her clip" },
  { src: "/photos/creator-ringlight.webp", caption: "Shoot at home", alt: "Man recording himself through a ring light" },
  { src: "/photos/creator-gele.webp", caption: "Any niche, any style", alt: "Woman in a gele and embroidered dress" },
  { src: "/photos/creator-studio.webp", caption: "Talk to your audience", alt: "Man filming with a phone on a ring light stand" },
];

const POINTS = [
  "Sign up with Face ID or your fingerprint. No app, no seed phrase.",
  "Every campaign's budget is locked before you clip, so the money is real.",
  "Paid in USDC per verified view, straight to your account.",
];

/** Clipper section: a clipper scrolling Cliprail on her phone (video), the pitch, then a strip of creators. */
export function ForClippers() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      {/* phones and tablets: the heading sits in the empty sky beside her head, the pitch and button over the bottom
          of the video, and the checklist right under it. Only one layout's video loads (LoopVideo waits until
          it's on screen, and hidden elements never are). */}
      <div className="mx-auto max-w-[26rem] lg:hidden">
        <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] shadow-[0_30px_80px_-30px_rgb(18_18_22/0.45)]">
          <LoopVideo src="/video/clipper-scroll.mp4" poster="/video/clipper-scroll.jpg" className="absolute inset-0 size-full object-cover" />
          {/* scrims so white text reads over the bright backdrop */}
          <div className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-black/60 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/55 to-transparent" />
          <Reveal stagger className="absolute top-0 left-0 w-[60%] p-5 text-white">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold tracking-wider uppercase backdrop-blur">For clippers</span>
            <h2 className="mt-3 text-[1.75rem] leading-[1.1] font-bold text-balance">Your phone is the whole studio.</h2>
          </Reveal>
          <Reveal stagger className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-6 text-center text-white">
            <p className="text-sm text-balance text-white/85">
              Grab a campaign, cut the best moment, put your code in the description. The oracle does the counting and the escrow does
              the paying.
            </p>
            <div className="mt-4">
              <LinkButton href="/campaigns">Find a campaign →</LinkButton>
            </div>
          </Reveal>
        </div>
        <ul className="mt-6 flex flex-col gap-3">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 text-money">
                <CheckCircle />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>

      {/* desktop: copy beside the video */}
      <div className="hidden items-center gap-12 lg:grid lg:grid-cols-[1fr_26rem]">
        <div>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-[11px] font-semibold tracking-wider text-accent-solid-hover uppercase dark:text-[#c9bfff]">For clippers</span>
          <h2 className="mt-4 max-w-lg text-4xl font-bold sm:text-5xl">Your phone is the whole studio.</h2>
          <p className="mt-3 max-w-lg text-muted">
            Grab a campaign, cut the best moment, put your code in the description. The oracle does the counting and the escrow does the
            paying.
          </p>
          <ul className="mt-6 flex max-w-lg flex-col gap-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 text-money">
                  <CheckCircle />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <LinkButton href="/campaigns">Find a campaign →</LinkButton>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[26rem]">
          <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] shadow-[0_30px_80px_-30px_rgb(18_18_22/0.45)]">
            {/* the claim-code screen is tracked into the real phone frame by frame (see the commit for how it was made) */}
            <LoopVideo src="/video/clipper-scroll.mp4" poster="/video/clipper-scroll.jpg" className="absolute inset-0 size-full object-cover" />
          </div>
          <div className="force-light absolute -right-3 bottom-10 hidden items-center gap-2 rounded-full bg-white px-3.5 py-2 text-xs font-semibold shadow-[var(--shadow-float)] sm:flex">
            <span className="size-2 rounded-full bg-money" /> +$12.00 paid · 2 min ago
          </div>
        </div>
      </div>

      <div className="mt-14 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {CREATORS.map((c) => (
          <figure key={c.src} className="group relative aspect-[4/5] overflow-hidden rounded-3xl">
            <Image src={c.src} alt={c.alt} fill sizes="(min-width: 1024px) 18rem, 45vw" className="object-cover transition duration-700 group-hover:scale-105" />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12 text-sm font-semibold text-white">
              {c.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
