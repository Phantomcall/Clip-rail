import { cn } from "@/lib/cn";
import { CheckIcon } from "@/components/ui/Icons";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full border font-semibold",
              i < current && "border-accent-solid bg-accent-solid text-accent-fg",
              i === current && "border-accent text-accent-hover",
              i > current && "border-line text-muted",
            )}
            aria-current={i === current ? "step" : undefined}
          >
            {i < current ? <CheckIcon className="size-3.5" /> : i + 1}
          </span>
          <span className={cn("hidden sm:inline", i === current ? "text-fg" : "text-muted")}>{s}</span>
          {i < steps.length - 1 && <span aria-hidden className="h-px w-4 bg-line sm:w-8" />}
        </li>
      ))}
    </ol>
  );
}
