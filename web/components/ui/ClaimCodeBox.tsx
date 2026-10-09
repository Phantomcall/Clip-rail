import { CopyButton } from "./CopyButton";

/** The most important UI for clippers: the code that proves they own the Short. */
export function ClaimCodeBox({ code }: { code: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-accent/40 bg-accent/10 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">Your claim code</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <code className="font-mono text-xl font-bold tracking-wide sm:text-3xl sm:tracking-wider">{code}</code>
        <CopyButton text={code} className="shrink-0 bg-surface-2 px-3 py-2 text-sm text-fg" />
      </div>
      <p className="mt-2 text-sm text-muted">Paste this in your Short&apos;s description. It&apos;s how we know the clip is yours.</p>
    </div>
  );
}
