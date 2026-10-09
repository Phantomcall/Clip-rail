"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SignInButton } from "@/components/auth/SignInButton";
import { Logo } from "@/components/site/Logo";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/guide", label: "How it works", match: (p: string) => p.startsWith("/guide"), show: "lg:block" },
  { href: "/campaigns", label: "Campaigns", match: (p: string) => p.startsWith("/campaigns") || p.startsWith("/clip"), show: "sm:block" },
  { href: "/brand", label: "Brands", match: (p: string) => p.startsWith("/brand"), show: "md:block" },
  { href: "/judges", label: "Judges", match: (p: string) => p.startsWith("/judges"), show: "md:block" },
  { href: "/leaderboard", label: "Leaderboard", match: (p: string) => p.startsWith("/leaderboard") || p.startsWith("/u/"), show: "xl:block" },
];

/** Floating glass navbar: light over the sky at the top, firmer once the page scrolls. */
export function Header() {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-3 z-30 px-3 sm:top-4">
      <div
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 rounded-full border pr-2 pl-4 backdrop-blur-xl transition-[background-color,box-shadow,border-color] duration-300 sm:pl-5",
          scrolled
            ? "border-white/80 bg-white/85 shadow-[0_10px_30px_-12px_rgb(20_50_110/0.35)] dark:border-white/10 dark:bg-[#141830]/85"
            : "border-white/50 bg-white/55 shadow-[0_4px_20px_-12px_rgb(20_50_110/0.25)] dark:border-white/10 dark:bg-[#141830]/45",
        )}
      >
        <Link href="/" aria-label="Cliprail home" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-0.5 text-sm">
          {/* On phones the bottom TabBar carries the navigation */}
          {LINKS.map((l) => {
            const on = l.match(path);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "hidden rounded-full px-3 py-2 font-medium transition",
                  l.show,
                  on ? "bg-accent-soft text-accent dark:bg-accent/20 dark:text-[#c9bfff]" : "text-fg/65 hover:bg-white/60 hover:text-fg dark:hover:bg-white/10",
                )}
              >
                {l.label}
              </Link>
            );
          })}
          <Link
            href="/try"
            className={cn(
              "ml-1 hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition xl:inline-flex",
              path.startsWith("/try")
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-accent/25 text-accent hover:bg-accent-soft dark:text-[#c9bfff]",
            )}
          >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-money/60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-money" />
            </span>
            Try the demo
          </Link>
          <span className="mx-1 hidden h-5 w-px bg-fg/10 sm:block" aria-hidden />
          <ThemeToggle />
          <div className="ml-1">
            <SignInButton />
          </div>
        </nav>
      </div>
    </header>
  );
}
