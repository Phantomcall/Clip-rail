import Link from "next/link";
import { SignInButton } from "@/components/auth/SignInButton";
import { Logo } from "@/components/site/Logo";
import { ThemeToggle } from "@/components/site/ThemeToggle";

/** Floating pill navbar. */
export function Header() {
  return (
    <header className="sticky top-3 z-30 px-3 sm:top-4">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 rounded-full border border-white/70 bg-white/80 pr-2 pl-5 dark:border-white/10 dark:bg-surface/70 shadow-[var(--shadow-soft)] backdrop-blur-xl">
        <Link href="/" aria-label="Cliprail home"><Logo /></Link>
        <nav className="flex items-center gap-1 text-sm">
          {/* On phones the bottom TabBar carries the navigation */}
          <Link href="/campaigns" className="hidden rounded-full px-3 py-2 text-muted hover:bg-surface-2 hover:text-fg sm:block">Campaigns</Link>
          <Link href="/leaderboard" className="hidden rounded-full px-3 py-2 text-muted hover:bg-surface-2 hover:text-fg sm:block">Leaderboard</Link>
          <Link href="/brand/new" className="hidden rounded-full px-3 py-2 text-muted hover:bg-surface-2 hover:text-fg md:block">For brands</Link>
          <ThemeToggle />
          <div className="ml-1"><SignInButton /></div>
        </nav>
      </div>
    </header>
  );
}
