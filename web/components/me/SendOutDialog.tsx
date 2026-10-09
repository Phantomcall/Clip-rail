"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { ActionDialog } from "@/components/ui/ActionDialog";
import { Button } from "@/components/ui/Button";
import { AffixInput, Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useSendOut } from "@/lib/actions";
import { usd } from "@/lib/format";
import { parseUsd } from "@/lib/units";

/** Gasless USDC send-out (F10): signs TransferWithAuthorization, relayed by /relay/transfer. */
export function SendOutDialog({ balance }: { balance: number }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<{ to?: string; amount?: string }>({});
  const tx = useSendOut();
  const toast = useToast();

  const submit = async () => {
    const e: typeof errors = {};
    if (!isAddress(to)) e.to = "That isn't a valid address. Copy it again from your exchange or wallet.";
    const units = parseUsd(amount);
    if (!units || units <= 0n) e.amount = "Enter an amount.";
    else if (units > BigInt(balance)) e.amount = `You have ${usd(balance)}.`;
    setErrors(e);
    if (Object.keys(e).length) return;
    const hash = await tx.run(to as `0x${string}`, units!);
    if (hash) {
      toast({ tone: "success", title: `Sent ${usd(Number(units))}`, txHash: hash });
      setOpen(false);
      setTo("");
      setAmount("");
      tx.reset();
    } else toast({ tone: "error", title: `Send failed: ${tx.lastError() ?? "try again"}. Your USDC is still in your account.` });
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={setOpen}
      title="Send USDC"
      description="To an exchange or any wallet on the Monad network. No fee to you."
      trigger={<Button variant="secondary" disabled={balance <= 0}>Send USDC</Button>}
    >
      <div className="flex flex-col gap-4">
        <Field label="To address" htmlFor="to" error={errors.to} hint="Make sure it supports USDC on Monad.">
          <Input id="to" value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x…" className="font-mono" invalid={!!errors.to} />
        </Field>
        <Field label="Amount" htmlFor="amount" error={errors.amount} hint={`Available: ${usd(balance)}`}>
          <div className="flex gap-2">
            <AffixInput id="amount" prefix="$" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!errors.amount} />
            <Button variant="ghost" onClick={() => setAmount((balance / 1e6).toFixed(2))}>Max</Button>
          </div>
        </Field>
        <Button onClick={submit} loading={tx.status === "signing" || tx.status === "pending"}>
          {tx.status === "signing" ? "Confirm with passkey…" : tx.status === "pending" ? "Sending…" : "Send"}
        </Button>
      </div>
    </ActionDialog>
  );
}
