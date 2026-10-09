/**
 * The only place pages get data from.
 * With NEXT_PUBLIC_ENVIO_GRAPHQL_URL set, every function reads the Envio indexer (P-3.2/P-3.3);
 * without it, mocks. Pages don't know the difference.
 */
import { getBrief } from "@/lib/briefs";
import { shortAddress } from "@/lib/format";
import { gql, hasIndexer, num } from "@/lib/graphql";
import { ytMeta } from "@/lib/ytmeta";
import * as Q from "@/lib/queries";
import type { Address, BrandStats, Campaign, Clip, Clipper, Receipt, Tier, Totals } from "@/lib/types";
import * as mock from "@/mocks/data";

export const now = () => (hasIndexer() ? Math.floor(Date.now() / 1000) : mock.NOW);

/* ---------- mapping from indexer rows ---------- */

type Row = Record<string, unknown> & { id: string };
const ref = (r: unknown) => ((r as { id?: string } | null)?.id ?? "") as string;

async function toCampaign(r: Row): Promise<Campaign> {
  const brief = await getBrief(r.id);
  return {
    id: r.id,
    brand: r.brand as Address,
    brandName: brief.brandName || shortAddress(r.brand as string),
    title: brief.title,
    brief: brief.brief,
    sourceVideoId: brief.sourceVideoId,
    token: "USDC",
    budget: num(r.budget as string),
    reserved: num(r.reserved as string),
    paid: num(r.paid as string),
    cpm: num(r.cpm as string),
    maxPerClip: num(r.maxPerClip as string),
    maxViewsPerReport: num(r.maxViewsPerReport as string),
    minLikeBps: num(r.minLikeBps as number),
    holdSecs: num(r.holdSecs as number),
    startsAt: num(r.startsAt as number),
    endsAt: num(r.endsAt as number),
    minTier: num(r.minTier as number) as Tier,
    status: r.status as Campaign["status"],
    clipsCount: num(r.clipsCount as number),
    verifiedViews: num(r.verifiedViews as string),
    createdAt: num(r.createdAt as number),
  };
}

function toClip(r: Row): Clip {
  return {
    id: r.id,
    campaignId: ref(r.campaign),
    clipper: ref(r.clipper) as Address,
    videoId: r.videoId as string,
    title: `Short ${r.videoId as string}`, // placeholder; withTitles() swaps in the real YouTube title
    status: r.status as Clip["status"],
    lastViews: num(r.lastViews as string),
    likes: num(r.likes as string),
    accrued: num(r.accrued as string),
    released: num(r.released as string),
    registeredAt: num(r.registeredAt as number),
  };
}

/** Swap the placeholder titles for the videos' real YouTube titles (best effort; keeps the placeholder on failure). */
async function withTitles(clips: Clip[]): Promise<Clip[]> {
  const metas = await Promise.all(clips.map((c) => ytMeta(c.videoId)));
  return clips.map((c, i) => (metas[i] ? { ...c, title: metas[i].title } : c));
}

function toClipper(r: Row): Clipper {
  return {
    id: r.id as Address,
    paidViews: num(r.paidViews as string),
    earned: num(r.earned as string),
    clipsPaid: num(r.clipsPaid as number),
    rejections: num(r.rejections as number),
    brands: num(r.brands as number),
    firstSeen: num(r.firstSeen as number),
    tier: num(r.tier as number) as Tier,
  };
}

function toReceipt(r: Row, nowSec: number): Receipt {
  const clip = r.clip as { id: string; released: string } | null;
  const unlockAt = num(r.unlockAt as number);
  return {
    id: r.id,
    clipId: clip?.id ?? "",
    campaignId: ref(r.campaign),
    clipper: ref(r.clipper) as Address,
    round: num(r.round as string),
    totalViews: num(r.totalViews as string),
    deltaViews: num(r.deltaViews as string),
    likes: num(r.likes as string),
    amount: num(r.amount as string),
    unlockAt,
    timestamp: num(r.timestamp as number),
    txHash: r.txHash as `0x${string}`,
    // A receipt counts as paid once its unlock time passed and the keeper has released the clip past it.
    released: unlockAt <= nowSec && num(clip?.released) > 0,
  };
}

const emptyClipper = (address: Address): Clipper => ({ id: address, paidViews: 0, earned: 0, clipsPaid: 0, rejections: 0, brands: 0, firstSeen: 0, tier: 0 });

export async function getCampaigns(): Promise<Campaign[]> {
  if (!hasIndexer()) return mock.campaigns;
  const d = await gql<{ Campaign: Row[] }>(Q.Q_CAMPAIGNS);
  return Promise.all(d.Campaign.map(toCampaign));
}

export async function getCampaign(id: string): Promise<Campaign | undefined> {
  if (!hasIndexer()) return mock.getCampaign(id);
  const d = await gql<{ Campaign_by_pk: Row | null }>(Q.Q_CAMPAIGN, { id });
  return d.Campaign_by_pk ? toCampaign(d.Campaign_by_pk) : undefined;
}

export async function getCampaignsByBrand(brand: Address): Promise<Campaign[]> {
  if (!hasIndexer()) return mock.campaigns.filter((c) => c.brand.toLowerCase() === brand.toLowerCase());
  const d = await gql<{ Campaign: Row[] }>(Q.Q_CAMPAIGNS_BY_BRAND, { brand: brand.toLowerCase() });
  return Promise.all(d.Campaign.map(toCampaign));
}

export async function getClipsForCampaign(id: string): Promise<Clip[]> {
  if (!hasIndexer()) return mock.clipsForCampaign(id);
  const d = await gql<{ Clip: Row[] }>(Q.Q_CLIPS_BY_CAMPAIGN, { id });
  return withTitles(d.Clip.map(toClip));
}

export async function getClipsByClipper(clipper: Address): Promise<Clip[]> {
  if (!hasIndexer()) return mock.clips.filter((c) => c.clipper.toLowerCase() === clipper.toLowerCase());
  const d = await gql<{ Clip: Row[] }>(Q.Q_CLIPS_BY_CLIPPER, { c: clipper.toLowerCase() });
  return withTitles(d.Clip.map(toClip));
}

export async function getReceiptsByClipper(clipper: Address): Promise<Receipt[]> {
  if (!hasIndexer()) {
    return mock.receipts.filter((r) => r.clipper.toLowerCase() === clipper.toLowerCase()).sort((a, b) => b.timestamp - a.timestamp);
  }
  const d = await gql<{ Receipt: Row[] }>(Q.Q_RECEIPTS_BY_CLIPPER, { c: clipper.toLowerCase() });
  const t = now();
  return d.Receipt.map((r) => toReceipt(r, t));
}

export async function getClipper(address: Address): Promise<Clipper> {
  if (!hasIndexer()) return mock.clipperProfiles.find((c) => c.id.toLowerCase() === address.toLowerCase()) ?? emptyClipper(address);
  const d = await gql<{ Clipper_by_pk: Row | null }>(Q.Q_CLIPPER, { c: address.toLowerCase() });
  return d.Clipper_by_pk ? toClipper(d.Clipper_by_pk) : emptyClipper(address);
}

export async function getLeaderboard(limit = 20): Promise<Clipper[]> {
  if (!hasIndexer()) return [...mock.clipperProfiles].sort((a, b) => b.paidViews - a.paidViews).slice(0, limit);
  const d = await gql<{ Clipper: Row[] }>(Q.Q_LEADERBOARD, { limit });
  return d.Clipper.map(toClipper);
}

export async function getBrandStats(brand: Address): Promise<BrandStats> {
  if (!hasIndexer()) {
    const ids = new Set(mock.campaigns.filter((c) => c.brand.toLowerCase() === brand.toLowerCase()).map((c) => c.id));
    const mine = mock.clips.filter((c) => ids.has(c.campaignId));
    return {
      brand,
      campaigns: ids.size,
      clipsEarning: mine.filter((c) => c.accrued > 0 || c.status === "Rejected").length,
      flags: mine.filter((c) => c.status === "Flagged" || c.status === "Rejected").length,
      rejects: mine.filter((c) => c.status === "Rejected").length,
      returned: 0,
    };
  }
  const d = await gql<{ Brand_by_pk: Record<string, string | number> | null }>(Q.Q_BRAND, { b: brand.toLowerCase() });
  const b = d.Brand_by_pk;
  return {
    brand,
    campaigns: num(b?.campaigns),
    clipsEarning: num(b?.clipsEarning),
    flags: num(b?.flags),
    rejects: num(b?.rejects),
    returned: num(b?.returned),
  };
}

export async function getTotals(): Promise<Totals> {
  if (!hasIndexer()) return mock.totals;
  const d = await gql<{ Totals_by_pk: Record<string, string | number> | null }>(Q.Q_TOTALS);
  const t = d.Totals_by_pk;
  return {
    campaigns: num(t?.campaigns),
    clippers: num(t?.clippers),
    verifiedViews: num(t?.verifiedViews),
    paid: num(t?.paid),
    payouts: num(t?.payouts),
  };
}

/** Earnings split for a clipper: verified (accrued), holding (accrued, not released), paid (released). */
export function earningsSummary(clips: Clip[]) {
  const verified = clips.reduce((s, c) => s + c.accrued, 0);
  const paid = clips.reduce((s, c) => s + c.released, 0);
  return { verified, paid, holding: verified - paid };
}
