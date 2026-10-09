import { cn } from "@/lib/cn";

/** A person's photo, or their initial on a gradient when there's no photo. */
export function UserAvatar({
  src,
  name,
  size = 32,
  className,
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const initial = (name.replace(/^[@0x]+/, "")[0] ?? "?").toUpperCase();
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a user's own data URL or Google photo
    <img src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[#50c7ff] font-bold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}
