import { cn } from "@/lib/cn";

export function Card({ className, interactive, ...rest }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "glass rounded-[var(--radius-card)] p-4 sm:p-6",
        interactive && "transition-[transform,box-shadow,border-color] duration-300 ease-out-soft hover:-translate-y-1 hover:shadow-[var(--shadow-float)] active:translate-y-0 active:duration-100",
        className,
      )}
      {...rest}
    />
  );
}
