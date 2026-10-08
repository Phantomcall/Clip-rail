import Link from "next/link";
import { Logo } from "@/components/site/Logo";

export function Footer() {
  return (
    <footer className="mt-16 bg-night text-white/70">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo inverted />
          <p className="mt-3 max-w-xs text-sm">Get paid for every verified view. Settled on Monad, verified by Chainlink CRE.</p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <span className="eyebrow !text-white/40">Clippers</span>
          <Link href="/guide" className="hover:text-white">How it works</Link>
          <Link href="/campaigns" className="hover:text-white">Campaigns</Link>
          <Link href="/me" className="hover:text-white">My earnings</Link>
          <Link href="/leaderboard" className="hover:text-white">Leaderboard</Link>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <span className="eyebrow !text-white/40">Brands</span>
          <Link href="/brand/new" className="hover:text-white">Launch a campaign</Link>
          <Link href="/brand" className="hover:text-white">Brand console</Link>
          <Link href="/judges" className="hover:text-white">For judges</Link>
          <Link href="/try" className="hover:text-white">Try the demo</Link>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl justify-between px-4 py-4 text-xs text-white/40">
          <span>© 2026 Cliprail</span>
          <span>Built for Monad Metropolis</span>
        </div>
      </div>
    </footer>
  );
}
