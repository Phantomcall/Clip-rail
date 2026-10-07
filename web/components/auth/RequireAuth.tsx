"use client";

import { SignInButton } from "@/components/auth/SignInButton";
import { CheckCircle } from "@/components/ui/Icons";
import { useAuth } from "@/lib/auth";
import type { Address } from "@/lib/types";

const PERKS = ["Face ID or fingerprint, nothing to install", "No seed phrase, no password", "We cover the network fees"];

/** Renders children with the signed-in address, or a sign-in card. */
export function RequireAuth({ title, children }: { title: string; children: (address: Address) => React.ReactNode }) {
  const { address } = useAuth();
  if (!address) {
    return (
      <div className="mx-auto max-w-md py-10 sm:py-16">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-7 text-center shadow-[var(--shadow-float)] sm:p-9">
          <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-2xl">
            🔑
          </span>
          <h2 className="mt-4 text-2xl font-bold">{title}</h2>
          <p className="mt-1.5 text-sm text-muted">Sign in with your passkey to continue.</p>
          <ul className="mx-auto mt-5 flex max-w-xs flex-col gap-2 text-left text-sm">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <span className="text-money">
                  <CheckCircle />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex justify-center">
            <SignInButton />
          </div>
        </div>
      </div>
    );
  }
  return <>{children(address)}</>;
}
