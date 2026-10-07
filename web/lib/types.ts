/**
 * Shapes mirror the planned Envio entities (PRD §5.3, playbook P-2.4).
 * Token amounts are integer USDC units (6 decimals); times are unix seconds.
 * When the indexer lands (P-3.2), GraphQL BigInt strings are converted into these types in one place.
 */
export type Address = `0x${string}`;

export type CampaignStatus = "Active" | "Closed";
export type ClipStatus = "Pending" | "Active" | "Flagged" | "Rejected" | "Ended";
export type Tier = 0 | 1 | 2;

export interface Campaign {
  id: string;
  brand: Address;
  brandName: string; // from the off-chain brief
  title: string; // from the off-chain brief
  brief: string;
  sourceVideoId: string;
  token: "USDC" | "AUSD";
  budget: number;
  reserved: number;
  paid: number;
  cpm: number;
  maxPerClip: number;
  maxViewsPerReport: number;
  minLikeBps: number;
  holdSecs: number;
  startsAt: number;
  endsAt: number;
  minTier: Tier;
  status: CampaignStatus;
  clipsCount: number;
  verifiedViews: number;
  createdAt: number;
}

export interface Clip {
  id: string;
  campaignId: string;
  clipper: Address;
  clipperHandle?: string;
  videoId: string;
  title: string;
  status: ClipStatus;
  lastViews: number;
  likes: number;
  accrued: number;
  released: number;
  registeredAt: number;
}

export interface Clipper {
  id: Address;
  handle?: string;
  paidViews: number;
  earned: number;
  clipsPaid: number;
  rejections: number;
  brands: number;
  firstSeen: number;
  tier: Tier;
}

/** A VerifiedView receipt: one `ViewsVerified` event. */
export interface Receipt {
  id: string;
  clipId: string;
  campaignId: string;
  clipper: Address;
  round: number;
  totalViews: number;
  deltaViews: number;
  likes: number;
  amount: number;
  unlockAt: number;
  timestamp: number;
  txHash: `0x${string}`;
  released: boolean;
}

/** How a brand has treated clips: shown to clippers before they join (audit R-4: brands judge their own flags). */
export interface BrandStats {
  brand: Address;
  campaigns: number;
  /** Distinct clips that earned in this brand's campaigns. */
  clipsEarning: number;
  flags: number;
  rejects: number;
  /** USDC units taken back by rejects. */
  returned: number;
}

export interface Totals {
  campaigns: number;
  clippers: number;
  verifiedViews: number;
  paid: number;
  payouts: number;
}
