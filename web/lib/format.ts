/** USDC has 6 decimals. Amounts are kept as integer token units (safe as numbers up to ~$9B). */
export const USDC_DECIMALS = 6;
const UNIT = 10 ** USDC_DECIMALS;

export function usd(units: number, opts: { cents?: boolean } = {}) {
  const value = units / UNIT;
  // cents: false drops cents for big round numbers, but never turns $0.05 into "$0"
  const digits = opts.cents === false && (value >= 100 || Number.isInteger(value)) ? 0 : 2;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function count(n: number) {
  return n.toLocaleString("en-US");
}

export function compact(n: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Rate per 1,000 views, e.g. "$1.00 / 1k views". */
export function cpmLabel(cpmUnits: number) {
  return `${usd(cpmUnits)} / 1k views`;
}

/** Views a remaining budget can still buy at a given CPM. */
export function viewsBuyable(budgetUnits: number, cpmUnits: number) {
  if (cpmUnits <= 0) return 0;
  return Math.floor((budgetUnits / cpmUnits) * 1000);
}

export function percent(bps: number) {
  return `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export function duration(secs: number) {
  if (secs < 3600) return `${Math.round(secs / 60)} min`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h`;
  return `${Math.round(secs / 86400)} d`;
}

/** "3 d left", "5 h left", "ended". `now` is unix seconds. */
export function timeLeft(endsAt: number, now: number) {
  const s = endsAt - now;
  if (s <= 0) return "ended";
  return `${duration(s)} left`;
}

export function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export const EXPLORER = "https://monadvision.com";

export function txUrl(hash: string) {
  return `${EXPLORER}/tx/${hash}`;
}

export function addressUrl(addr: string) {
  return `${EXPLORER}/address/${addr}`;
}
