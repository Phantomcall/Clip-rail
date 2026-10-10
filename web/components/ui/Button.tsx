import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ink" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]";

/** cn only joins classes, so a caller's min-h-* or px-* replaces the default size instead of losing to it. */
function size(className?: string) {
  const c = className ?? "";
  return cn(!/(^|\s)min-h-/.test(c) && "min-h-11", !/(^|\s)px-/.test(c) && "px-5");
}

const variants: Record<Variant, string> = {
  primary: "bg-accent-solid text-accent-fg shadow-[0_6px_16px_-6px_rgb(110_84_255/0.6)] hover:bg-accent-solid-hover",
  ink: "bg-ink text-white hover:bg-black",
  secondary: "border border-line bg-surface text-fg shadow-[var(--shadow-soft)] hover:border-muted/50",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger/10 text-danger hover:bg-danger/15",
};

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean };

export function Button({ variant = "primary", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={cn(base, size(className), variants[variant], className)} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

type LinkButtonProps = React.ComponentProps<typeof Link> & { variant?: Variant };

export function LinkButton({ variant = "primary", className, ...rest }: LinkButtonProps) {
  return <Link className={cn(base, size(className), variants[variant], className)} {...rest} />;
}
