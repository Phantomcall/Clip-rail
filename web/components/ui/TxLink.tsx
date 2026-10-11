import { shortAddress, txUrl } from "@/lib/format";
import { ExternalIcon } from "@/components/ui/Icons";

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-accent-hover hover:underline">
      {label ?? shortAddress(hash)} <ExternalIcon />
    </a>
  );
}
