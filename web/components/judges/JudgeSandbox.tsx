"use client";

import Link from "next/link";
import { SignInButton } from "@/components/auth/SignInButton";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useSandboxFund } from "@/lib/actions";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { addressUrl } from "@/lib/format";
import { ADDR, NETWORK } from "@/lib/network";

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <Card className={cn("flex gap-4", done && "border-money/30")}>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold", done ? "bg-money/20 text-money" : "bg-accent/15 text-accent-hover")}>
        {done ? "✓" : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 className="font-semibold">{title}</h2>
        {children}
      </div>
    </Card>
  );
}

export function JudgeSandbox() {
  const { address } = useAuth();
  const fund = useSandboxFund();
  const toast = useToast();
  const sandboxReady = Boolean(process.env.NEXT_PUBLIC_OPS_URL);
  const funded = fund.status === "success";

  return (
    <div className="flex flex-col gap-4">
      <Step n={1} title="Create an account with a passkey" done={!!address}>
        <p className="text-sm text-muted">Takes 5 seconds. Testnet only, so nothing here costs real money.</p>
        {!address && <div><SignInButton /></div>}
      </Step>

      <Step n={2} title="Get sandbox funds" done={funded}>
        <p className="text-sm text-muted">The testnet relayer sends your new account 0.1 testnet MON and 1,000 test USDC so you can try the brand side too. It takes a few seconds.</p>
        {!sandboxReady ? (
          <p className="rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-xs text-muted">Sandbox funding is being connected to the testnet relayer. You can still inspect the demo campaign and the contracts below.</p>
        ) : address && !funded && (
          <Button
            className="self-start"
            loading={fund.status === "signing" || fund.status === "pending"}
            onClick={async () => {
              const h = await fund.run();
              toast(h ? { tone: "success", title: "Sandbox funded", txHash: h } : { tone: "error", title: fund.lastError() ?? "Funding failed. Try again in a minute." });
            }}
          >
            Fund my sandbox
          </Button>
        )}
      </Step>

      <Step n={3} title="Try both sides" done={false}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--radius-control)] border border-line p-3">
            <div className="text-sm font-semibold">As a clipper</div>
            <p className="mt-1 text-xs text-muted">{sandboxReady ? "Join the demo campaign with our pre-registered Short and watch verified earnings arrive." : "Demo registration opens when sandbox funding and the gasless relayer are online."}</p>
            {sandboxReady ? <LinkButton href="/clip/new?c=1" variant="secondary" className="mt-3 min-h-9 w-full text-xs">Join demo campaign</LinkButton> : <span className="mt-3 block rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-center text-xs font-semibold text-muted">Demo registration unavailable</span>}
          </div>
          <div className="rounded-[var(--radius-control)] border border-line p-3">
            <div className="text-sm font-semibold">As a brand</div>
            <p className="mt-1 text-xs text-muted">{sandboxReady ? "Launch a campaign with test USDC and a 5-minute hold window, then flag or accept clips." : "Campaign creation is available once your account has test funds from the relayer."}</p>
            {sandboxReady ? <LinkButton href="/brand/new" variant="secondary" className="mt-3 min-h-9 w-full text-xs">Launch a test campaign</LinkButton> : <span className="mt-3 block rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-center text-xs font-semibold text-muted">Test funds required</span>}
          </div>
        </div>
      </Step>

      <Card>
        <h2 className="font-semibold">Proof on {NETWORK}</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          <li>Campaign #1: <Link href="/campaigns/1" className="text-accent-hover hover:underline">view the campaign and its onchain rules</Link></li>
          <li>
            Vault contract ({NETWORK}):{" "}
            {ADDR.vault ? <a href={addressUrl(ADDR.vault)} target="_blank" rel="noreferrer" className="font-mono break-all text-accent-hover hover:underline">{ADDR.vault}</a> : <span className="text-muted">deploying soon</span>}
          </li>
          <li>Code: <a href="https://github.com/Phantomcall/Clip-rail" target="_blank" rel="noreferrer" className="text-accent-hover hover:underline">github.com/Phantomcall/Clip-rail</a></li>
        </ul>
      </Card>
    </div>
  );
}
