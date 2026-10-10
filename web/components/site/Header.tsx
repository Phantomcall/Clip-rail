"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SignInButton } from "@/components/auth/SignInButton";
import { Logo } from "@/components/site/Logo";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { cn } from "@/lib/cn";
import { ActivePill } from "@/components/ui/ActivePill";

const LINKS = [
  { href: "/guide", label: "How it works", match: (p: string) => p.startsWith("/guide"), show: "lg:block" },
  { href: "/campaigns", label: "Campaigns", match: (p: string) => p.startsWith("/campaigns") || p.startsWith("/clip"), show: "sm:block" },
  { href: "/brand", label: "Brands", match: (p: string) => p.startsWith("/brand"), show: "md:block" },
  { href: "/judges", label: "Judges", match: (p: string) => p.startsWith("/judges"), show: "md:block" },
  { href: "/leaderboard", label: "Leaderboard", match: (p: string) => p.startsWith("/leaderboard") || p.startsWith("/u/"), show: "xl:block" },
];

/** Scroll distance in one direction before the bar hides or comes back, so small jitters don't flicker it. */
const SLACK = 10;
/** Always shown this close to the top. */
const TOP_ZONE = 80;

/**
 * Floating glass navbar. It slides away while you scroll down and comes back as soon as you scroll up; it stays
 * put near the top, while one of its menus is open, and while it has keyboard focus.
 */
export function Header() {
  const path = usePathname();
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let anchor = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 24);
      const busy = !!ref.current?.querySelector('[aria-expanded="true"]') || !!ref.current?.contains(document.activeElement);
      if (y < TOP_ZONE || busy) {
        setHidden(false);
        anchor = y;
      } else if (y - anchor > SLACK) {
        setHidden(true);
        anchor = y;
      } else if (anchor - y > SLACK) {
        setHidden(false);
        anchor = y;
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // A new page starts with the bar in view (adjusting state during render, as React recommends over an effect).
  const [pagePath, setPagePath] = useState(path);
  if (pagePath !== path) {
    setPagePath(path);
    setHidden(false);
  }

  return (
    <header
      ref={ref}
      onFocusCapture={() => setHidden(false)}
      className={cn(
        "sticky top-3 z-30 px-3 transition-transform duration-300 ease-out motion-reduce:transition-none sm:top-4",
        hidden && "-translate-y-[calc(100%+1.5rem)]",
      )}
    >
      <div
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center gap-2 rounded-full pr-2 pl-4 ring-1 backdrop-blur-xl backdrop-saturate-150 transition-[background-color,box-shadow] duration-300 sm:pl-5",
          "shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_10px_30px_-18px_rgb(15_30_80/0.5)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_10px_30px_-18px_rgb(0_0_0/0.8)]",
          scrolled ? "bg-white/90 ring-black/[0.06] dark:bg-[#11142a]/85 dark:ring-white/10" : "bg-white/80 ring-white/70 dark:bg-[#11142a]/60 dark:ring-white/10",
        )}
      >
        <Link href="/" aria-label="Cliprail home" className="shrink-0">
          <Logo />
        </Link>

        {/* On phones the bottom TabBar carries the navigation */}
        <nav aria-label="Main" className="mx-auto flex items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const on = l.match(path);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative isolate hidden rounded-full px-3.5 py-2 font-medium transition-colors duration-200",
                  l.show,
                  on
                    ? "text-accent-solid-hover dark:text-white"
                    : "text-fg/70 hover:bg-black/[0.04] hover:text-fg dark:text-white/65 dark:hover:bg-white/[0.06] dark:hover:text-white",
                )}
              >
                {on && <ActivePill id="nav-active" className="bg-accent-soft dark:bg-white/10" />}
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/try"
            className={cn(
              "hidden items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors xl:inline-flex",
              path.startsWith("/try")
                ? "bg-accent-soft text-accent-solid-hover dark:bg-white/10 dark:text-white"
                : "text-fg/70 hover:bg-black/[0.04] hover:text-fg dark:text-white/65 dark:hover:bg-white/[0.06] dark:hover:text-white",
            )}
          >
            <span className="relative flex size-1.5" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-money/60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-1.5 rounded-full bg-money" />
            </span>
            Try the demo
          </Link>
          <span className="hidden h-5 w-px bg-fg/10 xl:block dark:bg-white/10" aria-hidden />
          <ThemeToggle />
          <SignInButton />
        </div>
      </div>
    </header>
  );
}
