/** Handler tests on simulated events (no chain, no database). Run with `pnpm test`. */
import { createTestIndexer } from "envio";
import { describe, expect, it } from "vitest";

const BRAND = "0x00000000000000000000000000000000000000b1";
const CLIPPER = "0x00000000000000000000000000000000000000C1";
const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const tx = (n: number) => ({ hash: `0x${n.toString(16).padStart(64, "0")}` });
// Blocks sit just after the configured start block (testnet v0 deploy), or Envio skips them.
const START = Number(process.env.ENVIO_START_BLOCK_10143 ?? 0);
const at = (n: number) => ({ number: START + n, timestamp: 1_760_000_000 + n * 60 });

/** Campaign 1: $150 budget, $1.00 per 1,000 views ($1,000 per 1M), $20 per clip. */
const created = {
  contract: "CampaignVault",
  event: "CampaignCreated",
  block: at(1),
  transaction: tx(1),
  params: {
    id: 1n,
    brand: BRAND,
    token: USDC,
    budget: 150_000_000n,
    cpm: 1_000_000n,
    maxPerClip: 20_000_000n,
    holdSecs: 86_400n,
    startsAt: 1_760_000_000n,
    endsAt: 1_762_000_000n,
    minTier: 0n,
    briefHash: `0x${"ab".repeat(32)}`,
  },
} as const;

const registered = (clipId: bigint, block: number) =>
  ({
    contract: "CampaignVault",
    event: "ClipRegistered",
    block: at(block),
    transaction: tx(block),
    params: { clipId, campaignId: 1n, clipper: CLIPPER, videoId: `vid${clipId}xxxxxx`.slice(0, 11) },
  }) as const;

const verified = (clipId: bigint, round: bigint, totalViews: bigint, deltaViews: bigint, amount: bigint, block: number) =>
  ({
    contract: "CampaignVault",
    event: "ViewsVerified",
    block: at(block),
    transaction: tx(block),
    params: { clipId, campaignId: 1n, clipper: CLIPPER, round, totalViews, deltaViews, likes: totalViews / 20n, amount, unlockAt: 1_760_100_000n },
  }) as const;

describe("CampaignVault handlers", () => {
  it("follows the live-campaign worked example: $12, then $8 capped by maxPerClip", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            created,
            registered(1n, 2),
            registered(2n, 3),
            { contract: "CampaignVault", event: "ClipActivated", block: at(4), transaction: tx(4), params: { clipId: 1n } },
            verified(1n, 1n, 12_000n, 12_000n, 12_000_000n, 5),
            // 20,000 more views would be $20, but the clip can only earn $8 more: 8,000 views actually paid.
            verified(1n, 2n, 32_000n, 20_000n, 8_000_000n, 6),
            { contract: "CampaignVault", event: "SuspectReport", block: at(7), transaction: tx(7), params: { clipId: 2n, round: 2n, views: 5_000n, likes: 0n } },
            { contract: "CampaignVault", event: "ClipRejected", block: at(8), transaction: tx(8), params: { clipId: 2n, reason: 0n } },
            { contract: "CreatorReputation", event: "ReputationUpdated", block: at(9), transaction: tx(9), params: { clipper: CLIPPER, paidViews: 20_000n, earned: 20_000_000n, rejections: 0n, tier: 1n } },
          ],
        },
      },
    });

    const campaign = await indexer.Campaign.getOrThrow("1");
    expect(campaign).toMatchObject({ brand: BRAND, reserved: 20_000_000n, paid: 0n, verifiedViews: 20_000n, clipsCount: 2, status: "Active" });

    const clip1 = await indexer.Clip.getOrThrow("1");
    expect(clip1).toMatchObject({ status: "Active", lastViews: 32_000n, accrued: 20_000_000n });
    const clip2 = await indexer.Clip.getOrThrow("2");
    expect(clip2).toMatchObject({ status: "Rejected", lastViews: 5_000n, suspectReports: 1, accrued: 0n });

    const who = await indexer.Clipper.getOrThrow(CLIPPER.toLowerCase());
    // A missing claim code (reason 0) is not a reputation rejection.
    expect(who).toMatchObject({ earned: 20_000_000n, paidViews: 20_000n, clipsPaid: 1, brands: 1, rejections: 0, tier: 1 });

    const receipts = await indexer.Receipt.getAll();
    expect(receipts.map((r) => r.paidViews).sort()).toEqual([12_000n, 8_000n].sort());

    expect(await indexer.Totals.getOrThrow("global")).toMatchObject({ campaigns: 1, clippers: 1, verifiedViews: 20_000n, paid: 0n, payouts: 0 });
  });

  it("brand reject returns the accrual and counts against reputation; release moves reserve to paid", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            created,
            registered(1n, 2),
            registered(2n, 3),
            { contract: "CampaignVault", event: "ClipActivated", block: at(4), transaction: tx(4), params: { clipId: 1n } },
            { contract: "CampaignVault", event: "ClipActivated", block: at(4), transaction: tx(40), params: { clipId: 2n } },
            verified(1n, 1n, 5_000n, 5_000n, 5_000_000n, 5),
            verified(2n, 1n, 3_000n, 3_000n, 3_000_000n, 5),
            { contract: "CampaignVault", event: "Flagged", block: at(6), transaction: tx(6), params: { clipId: 2n, brand: BRAND, reasonHash: `0x${"cd".repeat(32)}`, deadline: 1_760_200_000n } },
            { contract: "CampaignVault", event: "Resolved", block: at(7), transaction: tx(7), params: { clipId: 2n, rejected: true, returned: 3_000_000n } },
            { contract: "CampaignVault", event: "ClipRejected", block: at(7), transaction: tx(70), params: { clipId: 2n, reason: 1n } },
            { contract: "CampaignVault", event: "Released", block: at(8), transaction: tx(8), params: { clipId: 1n, clipper: CLIPPER, amount: 5_000_000n } },
          ],
        },
      },
    });

    expect(await indexer.Campaign.getOrThrow("1")).toMatchObject({ reserved: 0n, paid: 5_000_000n });
    expect(await indexer.Clip.getOrThrow("1")).toMatchObject({ released: 5_000_000n, accrued: 5_000_000n });
    expect(await indexer.Clip.getOrThrow("2")).toMatchObject({ status: "Rejected", accrued: 0n });
    expect(await indexer.Flag.getOrThrow("2")).toMatchObject({ resolved: true, rejected: true, returned: 3_000_000n });
    expect(await indexer.Clipper.getOrThrow(CLIPPER.toLowerCase())).toMatchObject({ earned: 5_000_000n, rejections: 1, clipsPaid: 2 });
    expect(await indexer.Totals.getOrThrow("global")).toMatchObject({ paid: 5_000_000n, payouts: 1 });
    expect((await indexer.Payout.getAll()).length).toBe(1);
  });
});
