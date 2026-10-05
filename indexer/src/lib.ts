/** Shared helpers for the handlers. Ids follow schema.graphql: numeric ids as decimal strings, addresses lowercase. */
import type { EvmOnEventContext } from "envio";

export const id = (n: bigint) => n.toString();
export const addr = (a: string) => a.toLowerCase();
export const eventId = (txHash: string, logIndex: number) => `${txHash}-${logIndex}`;

/** RejectReason in ICampaignVault: only a brand reject counts against a clipper's reputation. */
export const REJECT_BRAND = 1;

/** Views a receipt actually paid: the vault's tranche formula (a capped amount pays fewer views than the delta). */
export function paidViews(delta: bigint, amount: bigint, cpm: bigint): bigint {
  if (cpm === 0n) return 0n;
  const full = (delta * cpm) / 1000n;
  return amount === full ? delta : (amount * 1000n) / cpm;
}

/** UTC day key for DailyStat. */
export const day = (unixSecs: number) => new Date(unixSecs * 1000).toISOString().slice(0, 10);

type Ctx = EvmOnEventContext;

export async function totals(context: Ctx) {
  return context.Totals.getOrCreate({ id: "global", campaigns: 0, clippers: 0, verifiedViews: 0n, paid: 0n, payouts: 0 });
}

export async function dailyStat(context: Ctx, unixSecs: number) {
  return context.DailyStat.getOrCreate({ id: day(unixSecs), views: 0n, paid: 0n, receipts: 0 });
}

/** The clipper row, created on first sight (and counted in Totals). */
export async function clipper(context: Ctx, address: string, timestamp: number) {
  const key = addr(address);
  const existing = await context.Clipper.get(key);
  if (existing) return existing;
  const t = await totals(context);
  context.Totals.set({ ...t, clippers: t.clippers + 1 });
  const row = { id: key, paidViews: 0n, earned: 0n, clipsPaid: 0, rejections: 0, brands: 0, tier: 0, firstSeen: timestamp };
  context.Clipper.set(row);
  return row;
}
