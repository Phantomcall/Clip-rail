import { count, duration, usd } from "@/lib/format";
import type { Receipt } from "@/lib/types";
import { TxLink } from "./TxLink";

export function ReceiptRow({ receipt, now }: { receipt: Receipt; now: number }) {
  const unlocked = receipt.unlockAt <= now;
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-line py-3 last:border-0 sm:grid-cols-[5rem_1fr_auto_auto] sm:items-center">
      <span className="tabular text-xs text-muted">Round {receipt.round}</span>
      <span className="tabular text-sm">
        +{count(receipt.deltaViews)} views <span className="text-muted">({count(receipt.totalViews)} total)</span>
      </span>
      <span className="tabular text-sm font-semibold">
        {receipt.released ? (
          <span className="text-money">{usd(receipt.amount)} paid</span>
        ) : (
          <span className="text-holding">
            {usd(receipt.amount)} · {unlocked ? "releasing" : `unlocks in ${duration(receipt.unlockAt - now)}`}
          </span>
        )}
      </span>
      <TxLink hash={receipt.txHash} />
    </li>
  );
}
