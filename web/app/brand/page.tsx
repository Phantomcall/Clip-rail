"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { BrandConsole } from "@/components/brand/BrandConsole";
import { LinkButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/site/PageHeader";
import { useAuth } from "@/lib/auth";

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
      <RequireAuth title="Brand console">{(address) => <BrandConsole address={address} />}</RequireAuth>
    </div>
    </>
  );
}
