import { cn } from "@/lib/cn";

export function Card({ className, interactive, ...rest }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "glass rounded-[var(--radius-card)] p-4 sm:p-6",
        interactive && "transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]",
        className,
      )}
      {...rest}
    />
  );
}
