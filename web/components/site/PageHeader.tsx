/**
 * Page title on the live sky (drawn behind every inner page by PageSky in app/layout.tsx). Text is white because the
 * sky is at full strength behind the title in every phase.
 */
export function PageHeader({
  eyebrow,
  title,
  actions,
  children,
  width = "max-w-6xl",
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  width?: string;
}) {
  return (
    <section className="relative isolate pt-14 pb-16 sm:pt-20 sm:pb-20 [&_[data-badge]]:bg-white [&_[data-badge]]:text-sm dark:[&_[data-badge]]:bg-white/10">
      {/* soft tint behind the text so white stays readable on the bright morning / afternoon skies */}
      <div className="absolute inset-x-0 -top-[4.5rem] bottom-0 -z-[1] bg-[linear-gradient(100deg,rgb(6_22_60/0.45)_0%,rgb(6_22_60/0.2)_45%,transparent_75%)] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]" />
      <div className={`relative mx-auto ${width} px-4 text-white`}>
        {eyebrow && <div className="mb-2 flex flex-wrap items-center gap-3 text-sm font-medium text-white/80">{eyebrow}</div>}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-bold drop-shadow-[0_2px_18px_rgb(5_30_80/0.3)] sm:text-4xl">{title}</h1>
          {actions}
        </div>
        {children && <div className="mt-3 max-w-2xl text-white/85">{children}</div>}
      </div>
    </section>
  );
}
