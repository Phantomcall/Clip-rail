import Link from "next/link";
import { Children } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ink" | "secondary" | "ghost" | "danger";

const base =
  "group/btn inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out-soft active:scale-[0.97] active:duration-100 disabled:pointer-events-none disabled:opacity-50";

/** cn only joins classes, so a caller's min-h-* or px-* replaces the default size instead of losing to it. */
function size(className?: string) {
  const c = className ?? "";
  return cn(!/(^|\s)min-h-/.test(c) && "min-h-11", !/(^|\s)px-/.test(c) && "px-5");
}

const variants: Record<Variant, string> = {
  primary:
    "bg-accent-solid text-accent-fg shadow-[0_6px_16px_-6px_rgb(110_84_255/0.6)] hover:-translate-y-px hover:bg-accent-solid-hover hover:shadow-[0_10px_24px_-8px_rgb(110_84_255/0.7)]",
  ink: "bg-ink text-white shadow-[0_6px_16px_-8px_rgb(0_0_0/0.5)] hover:-translate-y-px hover:bg-black hover:shadow-[0_10px_24px_-10px_rgb(0_0_0/0.6)]",
  secondary: "border border-line bg-surface text-fg shadow-[var(--shadow-soft)] hover:-translate-y-px hover:border-muted/50 hover:shadow-[var(--shadow-float)]",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger/10 text-danger hover:bg-danger/15",
};

/** A label ending in "→" gets an arrow that slides forward on hover. */
function withArrow(children: React.ReactNode) {
  const parts = Children.toArray(children);
  const last = parts[parts.length - 1];
  if (typeof last !== "string" || !last.trimEnd().endsWith("→")) return children;
  return (
    <>
      {parts.slice(0, -1)}
      {last.trimEnd().slice(0, -1)}
      <span aria-hidden className="inline-block transition-transform duration-200 ease-out-soft group-hover/btn:translate-x-0.5">
        →
      </span>
    </>
  );
}

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean };

export function Button({ variant = "primary", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={cn(base, size(className), variants[variant], className)} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading && <Spinner />}
      {withArrow(children)}
    </button>
  );
}

type LinkButtonProps = React.ComponentProps<typeof Link> & { variant?: Variant };

export function LinkButton({ variant = "primary", className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={cn(base, size(className), variants[variant], className)} {...rest}>
      {withArrow(children as React.ReactNode)}
    </Link>
  );
}
