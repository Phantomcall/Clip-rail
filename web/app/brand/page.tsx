"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { BrandConsole } from "@/components/brand/BrandConsole";
import { LinkButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/site/PageHeader";
import { useAuth } from "@/lib/auth";
import Image from "next/image";

function DevSwitch() {
  const { mockAs } = useAuth();
  if (!mockAs || process.env.NODE_ENV === "production") return null;
  return (
    <p className="mb-6 rounded-md border border-dashed border-line p-3 text-xs text-muted">
      Dev mock: <button className="underline" onClick={() => mockAs("brand")}>act as the mock brand</button> ·{" "}
      <button className="underline" onClick={() => mockAs("clipper")}>act as the mock clipper</button>
    </p>
  );
}

export default function BrandPage() {
  return (
    <>
    <PageHeader eyebrow="For brands" title="Turn attention into accountable growth." width="max-w-5xl" actions={<LinkButton href="/brand/new">New campaign</LinkButton>}>
      Fund a brief once. Pay only as real people watch, with every rule and payout visible from this console.
    </PageHeader>
    <div className="mx-auto max-w-5xl px-4 py-10">
      <DevSwitch />
      <section className="relative mb-8 overflow-hidden rounded-[2rem] border border-line bg-surface p-6 shadow-[var(--shadow-float)] sm:p-8">
        <div aria-hidden className="absolute inset-y-0 right-0 hidden w-[42%] sm:block">
          <Image src="/photos/creator-studio.webp" alt="" fill sizes="(min-width: 640px) 24rem, 0px" className="object-cover object-center opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/75 to-transparent" />
        </div>
        <div className="relative max-w-xl">
          <span className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent">The Cliprail advantage</span>
          <h2 className="mt-4 text-2xl font-bold">Pay for proof, not promises.</h2>
          <p className="mt-2 text-sm text-muted">Your budget stays in escrow. An oracle verifies views against the rules you set, and only then can it become a payout.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full border border-line bg-surface-2 px-3 py-1.5">Budget protected</span><span className="rounded-full border border-line bg-surface-2 px-3 py-1.5">Bot-resistant rules</span><span className="rounded-full border border-line bg-surface-2 px-3 py-1.5">Public receipts</span></div>
        </div>
      </section>
      <RequireAuth title="Brand console">{(address) => <BrandConsole address={address} />}</RequireAuth>
    </div>
    </>
  );
}
