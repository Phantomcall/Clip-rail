import Image from "next/image";
import { LinkButton } from "@/components/ui/Button";
import { CheckCircle } from "@/components/ui/Icons";

/**
 * The claim-code screen drawn into the blank phone in clipper-phone.webp. Position, size and tilt are measured from the
 * photo's white screen (center 31.8% / 71.0%, 20.7% wide, 0.45 aspect, about -3.5deg), so they only hold for that crop.
 * Sizes inside use container-query units, so the screen scales with the photo.
 */
function PhoneScreen() {
  return (
    <div
      aria-hidden
      className="force-light absolute overflow-hidden bg-white text-fg [container-type:inline-size]"
      style={{
        left: "31.8%",
        top: "71%",
        width: "20.7%",
        aspectRatio: "0.45",
        transform: "translate(-50%, -50%) rotate(-3.5deg)",
        borderRadius: "11%/5%",
      }}
    >
      <div className="flex h-full flex-col px-[9cqw] pt-[16cqw] pb-[8cqw]">
        <div className="flex items-center gap-[3cqw] text-[8cqw] font-bold">
          <span className="size-[8cqw] rounded-[2cqw] bg-accent" />
          Cliprail
        </div>
        <div className="mt-[10cqw] text-[6.5cqw] font-medium tracking-wide text-muted uppercase">Your claim code</div>
        <div className="mt-[2cqw] font-mono text-[9.5cqw] leading-tight font-bold">
          CR-3FA9B21C
          <br />
          7D02E4A1
        </div>
        <div className="mt-[6cqw] flex items-center gap-[2cqw] rounded-full bg-money/12 px-[4cqw] py-[2.5cqw] text-[6.5cqw] font-semibold text-money">
          <CheckCircle className="size-[7cqw]" /> Found in description
        </div>
        <div className="mt-auto rounded-[5cqw] bg-surface-2 p-[5cqw]">
          <div className="text-[6cqw] text-muted">Earned</div>
          <div className="tabular font-display text-[15cqw] leading-none font-bold">$12.00</div>
          <div className="mt-[3cqw] h-[2.5cqw] overflow-hidden rounded-full bg-line">
            <div className="h-full w-3/5 rounded-full bg-money" />
          </div>
        </div>
      </div>
    </div>
  );
}

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

/** Clipper section: a real photo with the actual claim-code screen in the phone, then a strip of creators. */
export function ForClippers() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_26rem]">
        <div>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-[11px] font-semibold tracking-wider text-accent uppercase">For clippers</span>
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
          <div className="relative aspect-[900/1476] overflow-hidden rounded-[28px] shadow-[0_30px_80px_-30px_rgb(18_18_22/0.45)]">
            <Image
              src="/photos/clipper-phone.webp"
              alt="Clipper holding up her phone with her Cliprail claim code on screen"
              fill
              sizes="(min-width: 1024px) 26rem, 90vw"
              className="object-cover"
            />
            <PhoneScreen />
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
