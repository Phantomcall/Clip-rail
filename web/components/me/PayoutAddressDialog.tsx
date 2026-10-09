"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { ActionDialog } from "@/components/ui/ActionDialog";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useSetPayout } from "@/lib/actions";

/** Optional: send future payouts straight to another address (E6). Gasless via /relay/payout-address. */
export function PayoutAddressDialog() {
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tx = useSetPayout();
  const toast = useToast();

  return (
    <ActionDialog
      open={open}
      onOpenChange={setOpen}
      title="Payout address"
      description="Future payouts go here automatically instead of this account. Leave as is to keep them here."
      trigger={<Button variant="ghost">Payout address</Button>}
    >
      <div className="flex flex-col gap-4">
        <Field label="Address" htmlFor="payout" error={error}>
          <Input id="payout" value={addr} onChange={(e) => setAddr(e.target.value.trim())} placeholder="0x…" className="font-mono" invalid={!!error} />
        </Field>
        <Button
          loading={tx.status === "signing" || tx.status === "pending"}
          onClick={async () => {
            if (!isAddress(addr)) return setError("That isn't a valid address.");
            setError(null);
            const hash = await tx.run(addr as `0x${string}`);
            if (hash) {
              toast({ tone: "success", title: "Payout address saved", txHash: hash });
              setOpen(false);
              tx.reset();
            } else toast({ tone: "error", title: `Couldn't save the address. ${tx.lastError() ?? ""}` });
          }}
        >
          Save
        </Button>
      </div>
    </ActionDialog>
  );
}
