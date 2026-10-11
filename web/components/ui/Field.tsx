import { cn } from "@/lib/cn";

const control =
  "min-h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-out-soft hover:border-muted/40 focus:border-accent focus:bg-surface focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-accent)_16%,transparent)] aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-danger)_14%,transparent)]";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, invalid, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn(control, className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function TextArea({ className, invalid, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={cn(control, "min-h-28 py-2.5", className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "appearance-none", className)} {...rest} />;
}

/** Input with a fixed prefix/suffix like "$" or "views". */
export function AffixInput({
  prefix,
  suffix,
  invalid,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { prefix?: string; suffix?: string; invalid?: boolean }) {
  return (
    <div
      className="flex min-h-11 items-center rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-sm transition-[border-color,box-shadow,background-color] duration-200 ease-out-soft hover:border-muted/40 focus-within:border-accent focus-within:bg-surface focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-accent)_16%,transparent)] aria-[invalid=true]:border-danger"
      aria-invalid={invalid || undefined}
    >
      {prefix && <span className="mr-1 text-muted">{prefix}</span>}
      <input className="tabular h-11 w-full bg-transparent outline-none" {...rest} />
      {suffix && <span className="ml-2 whitespace-nowrap text-muted">{suffix}</span>}
    </div>
  );
}
