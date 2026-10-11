import { InboxIcon } from "@/components/ui/Icons";

export function EmptyState({ title, action, icon = <InboxIcon /> }: { title: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line px-6 py-10 text-center">
      <span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</span>
      <p className="max-w-sm text-sm text-muted">{title}</p>
      {action}
    </div>
  );
}
