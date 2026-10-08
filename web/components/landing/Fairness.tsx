/** "Bots earn nothing": the onchain rules as a bento grid with tiny live-looking illustrations. */
function Tile({ title, body, children, className = "" }: { title: string; body: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass flex flex-col overflow-hidden rounded-3xl ${className}`}>
      <div className="dots grid min-h-36 flex-1 place-items-center bg-white/30 p-5 dark:bg-white/[0.02]">{children}</div>
      <div className="p-5">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted">{body}</p>
      </div>
    </div>
  );
}

export function Fairness() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <p className="eyebrow text-center">Fair by default</p>
      <h2 className="mt-3 text-center text-4xl font-bold sm:text-5xl">Bots earn nothing.</h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-muted">Every rule runs in the contract, so neither side has to trust us.</p>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <Tile title="Like-ratio floor" body="Views on a clip with almost no likes don't pay. Real audiences engage; bought views don't." className="md:col-span-2">
          <div className="w-full max-w-md space-y-3">
            {[
              ["Real clip", 6.7, "money"],
              ["Botted clip", 0.14, "danger"],
            ].map(([label, pct, tone]) => (
              <div key={label as string}>
                <div className="flex justify-between text-xs"><span className="font-medium">{label}</span><span className="tabular text-muted">{pct}% likes / views</span></div>
                <div className="relative mt-1.5 h-3 rounded-full bg-line">
                  <div className={`h-3 rounded-full ${tone === "money" ? "bg-money" : "bg-danger"}`} style={{ width: `${Math.min((pct as number) * 10, 100)}%` }} />
                  <span className="absolute top-[-4px] h-5 w-0.5 bg-ink" style={{ left: "5%" }} />
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted">Black line = the brand&apos;s 0.5% floor</p>
          </div>
        </Tile>
        <Tile title="Hold window" body="Earnings wait 24 hours before paying out. Brands can flag a clip during the hold.">
          <div className="text-center">
            <div className="tabular font-display text-4xl font-bold text-holding">23:41:08</div>
            <div className="mt-1 text-xs text-muted">until $2.31 unlocks</div>
          </div>
        </Tile>
        <Tile title="Velocity cap" body="Sudden spikes above the campaign's cap per check aren't paid.">
          <svg viewBox="0 0 200 80" className="w-full max-w-[14rem]">
            <polyline points="0,70 30,62 60,55 90,50 120,44 140,8 160,40 200,34" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinejoin="round" />
            <line x1="0" y1="26" x2="200" y2="26" stroke="var(--color-danger)" strokeDasharray="5 4" strokeWidth="2" />
            <text x="148" y="20" fontSize="9" fill="var(--color-danger)">cap</text>
          </svg>
        </Tile>
        <Tile title="Reputation you own" body="Every paid view builds a record only the escrow can write. Good history unlocks better campaigns." className="md:col-span-2">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {["New", "Tier 1", "Tier 2"].map((t, i) => (
              <span key={t} className={`rounded-full border px-4 py-2 text-sm font-semibold ${i === 2 ? "border-holding/50 bg-holding/10 text-holding" : i === 1 ? "border-accent/40 bg-accent-soft text-accent" : "border-line text-muted"}`}>{t}</span>
            ))}
            <span className="tabular text-xs text-muted">32,400 paid views · 0 rejections</span>
          </div>
        </Tile>
      </div>
    </section>
  );
}
