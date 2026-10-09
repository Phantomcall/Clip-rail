"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; match: (p: string) => boolean; icon: React.ReactNode };

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const TABS: Tab[] = [
  {
    href: "/",
    label: "Home",
    match: (p) => p === "/",
    icon: <path {...stroke} d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />,
  },
  {
    href: "/campaigns",
    label: "Campaigns",
    match: (p) => p.startsWith("/campaigns") || p.startsWith("/clip"),
    icon: (
      <>
        <rect {...stroke} x="4" y="4" width="7" height="7" rx="1.5" />
        <rect {...stroke} x="13" y="4" width="7" height="7" rx="1.5" />
        <rect {...stroke} x="4" y="13" width="7" height="7" rx="1.5" />
        <rect {...stroke} x="13" y="13" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  {
    href: "/leaderboard",
    label: "Ranks",
    match: (p) => p.startsWith("/leaderboard") || p.startsWith("/u/"),
    icon: <path {...stroke} d="M5 20v-6h4v6M10 20V9h4v11M15 20v-9h4v9M3 20h18" />,
  },
  {
    href: "/judges",
    label: "Judges",
    match: (p) => p.startsWith("/judges"),
    icon: <path {...stroke} d="M12 4v16M6 20h12M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z" />,
  },
  {
    href: "/me",
    label: "Earnings",
    match: (p) => p.startsWith("/me"),
    icon: (
      <>
        <rect {...stroke} x="3" y="6" width="18" height="13" rx="2.5" />
        <path {...stroke} d="M16 12.5h2M3 10h18" />
      </>
    ),
  },
  {
    href: "/brand",
    label: "Brands",
    match: (p) => p.startsWith("/brand"),
    icon: <path {...stroke} d="M4 10v4h3l6 4V6L7 10zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />,
  },
];

/** Bottom navigation on phones (hidden from sm up, where the header has room). Sits above the home indicator. */
export function TabBar() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-6 rounded-[1.4rem] border border-white/70 bg-white/85 p-1 shadow-[0_10px_40px_-10px_rgb(18_18_22/0.35)] backdrop-blur-xl sm:hidden dark:border-white/10 dark:bg-surface/80"
    >
      {TABS.map((t) => {
        const on = t.match(path);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[9.5px] font-semibold transition ${on ? "bg-accent-soft text-accent-solid-hover dark:bg-accent/20 dark:text-accent" : "text-muted"}`}
          >
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
              {t.icon}
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
