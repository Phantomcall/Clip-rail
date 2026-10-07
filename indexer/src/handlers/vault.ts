/** CampaignVault → Campaign, Clip, Clipper, Receipt, Payout, Flag, Totals, DailyStat (PRD §5, schema.graphql). */
import { indexer } from "envio";
import { campaignRules } from "../effects";
import { addr, brand, clipper, dailyStat, eventId, id, paidViews, totals } from "../lib";

// ─────────────── campaigns ───────────────

indexer.onEvent({ contract: "CampaignVault", event: "CampaignCreated" }, async ({ event, context }) => {
  const p = event.params;
  const rules = await context.effect(campaignRules, {
    vault: event.srcAddress,
    campaignId: id(p.id),
    blockNumber: event.block.number,
  });
  context.Campaign.set({
    id: id(p.id),
    brand: addr(p.brand),
    token: addr(p.token),
    budget: p.budget,
    reserved: 0n,
    paid: 0n,
    cpm: p.cpm,
    maxPerClip: p.maxPerClip,
    maxViewsPerReport: rules?.maxViewsPerReport ?? 0n,
    minLikeBps: rules?.minLikeBps ?? 0,
    holdSecs: Number(p.holdSecs),
    startsAt: Number(p.startsAt),
    endsAt: Number(p.endsAt),
    minTier: Number(p.minTier),
    briefHash: p.briefHash,
    status: "Active",
    clipsCount: 0,
    verifiedViews: 0n,
    createdAt: event.block.timestamp,
  });
  const t = await totals(context);
  context.Totals.set({ ...t, campaigns: t.campaigns + 1 });
  const b = await brand(context, p.brand);
  context.Brand.set({ ...b, campaigns: b.campaigns + 1 });
});

indexer.onEvent({ contract: "CampaignVault", event: "CampaignToppedUp" }, async ({ event, context }) => {
  const c = await context.Campaign.getOrThrow(id(event.params.id));
  context.Campaign.set({ ...c, budget: c.budget + event.params.amount });
});

indexer.onEvent({ contract: "CampaignVault", event: "CampaignClosed" }, async ({ event, context }) => {
  // The vault settles the budget at close: budget = reserved + paid, and the rest goes back to the brand.
  const c = await context.Campaign.getOrThrow(id(event.params.id));
  context.Campaign.set({ ...c, status: "Closed", budget: c.budget - event.params.refund });
});

/** A reject after close sends the returned earnings on to the refund address; the settled budget shrinks with it. */
indexer.onEvent({ contract: "CampaignVault", event: "CampaignRefunded" }, async ({ event, context }) => {
  const c = await context.Campaign.getOrThrow(id(event.params.id));
  context.Campaign.set({ ...c, budget: c.budget - event.params.amount });
});

// ─────────────── clips ───────────────

indexer.onEvent({ contract: "CampaignVault", event: "ClipRegistered" }, async ({ event, context }) => {
  const p = event.params;
  const c = await context.Campaign.getOrThrow(id(p.campaignId));
  const who = await clipper(context, p.clipper, event.block.timestamp);
  context.Clip.set({
    id: id(p.clipId),
    campaign_id: c.id,
    clipper_id: who.id,
    videoId: p.videoId,
    status: "Pending",
    lastViews: 0n,
    likes: 0n,
    accrued: 0n,
    released: 0n,
    registeredAt: event.block.timestamp,
    flaggedAt: undefined,
    suspectReports: 0,
    releaseFailures: 0,
  });
  context.Campaign.set({ ...c, clipsCount: c.clipsCount + 1 });
});

indexer.onEvent({ contract: "CampaignVault", event: "ClipActivated" }, async ({ event, context }) => {
  const clip = await context.Clip.getOrThrow(id(event.params.clipId));
  context.Clip.set({ ...clip, status: "Active" });
});

indexer.onEvent({ contract: "CampaignVault", event: "ClipRejected" }, async ({ event, context }) => {
  const clip = await context.Clip.getOrThrow(id(event.params.clipId));
  context.Clip.set({ ...clip, status: "Rejected" });
  // Clipper.rejections comes from ReputationUpdated: the contract counts each rejecting brand once (audit V1-3).
});

indexer.onEvent({ contract: "CampaignVault", event: "ClipEnded" }, async ({ event, context }) => {
  const clip = await context.Clip.getOrThrow(id(event.params.clipId));
  context.Clip.set({ ...clip, status: "Ended" });
});

// ─────────────── reports ───────────────

/** The receipt: accrual moves into the campaign's reserve and onto the clipper's earnings. */
indexer.onEvent(
  { contract: "CampaignVault", event: "ViewsVerified" },
  async ({ event, context }) => {
    const p = event.params;
    const [clip, c] = await Promise.all([
      context.Clip.getOrThrow(id(p.clipId)),
      context.Campaign.getOrThrow(id(p.campaignId)),
    ]);
    const who = await context.Clipper.getOrThrow(addr(p.clipper));
    const views = paidViews(p.deltaViews, p.amount, c.cpm);
    const ts = event.block.timestamp;

    context.Receipt.set({
      id: eventId(event.transaction.hash, event.logIndex),
      clip_id: clip.id,
      campaign_id: c.id,
      clipper_id: who.id,
      round: p.round,
      totalViews: p.totalViews,
      deltaViews: p.deltaViews,
      paidViews: views,
      likes: p.likes,
      amount: p.amount,
      unlockAt: Number(p.unlockAt),
      timestamp: ts,
      txHash: event.transaction.hash,
    });
    context.Clip.set({ ...clip, lastViews: p.totalViews, likes: p.likes, accrued: clip.accrued + p.amount });
    context.Campaign.set({ ...c, reserved: c.reserved + p.amount, verifiedViews: c.verifiedViews + views });

    // First earnings from this brand → one more brand; first earnings on this clip → one more clip paid.
    const pair = `${who.id}-${c.brand}`;
    const newBrand = !(await context.ClipperBrand.get(pair));
    if (clip.accrued === 0n) {
      const b = await brand(context, c.brand);
      context.Brand.set({ ...b, clipsEarning: b.clipsEarning + 1 });
    }
    if (newBrand) context.ClipperBrand.set({ id: pair });
    context.Clipper.set({
      ...who,
      paidViews: who.paidViews + views,
      earned: who.earned + p.amount,
      clipsPaid: who.clipsPaid + (clip.accrued === 0n ? 1 : 0),
      brands: who.brands + (newBrand ? 1 : 0),
    });

    const t = await totals(context);
    context.Totals.set({ ...t, verifiedViews: t.verifiedViews + views });
    const d = await dailyStat(context, ts);
    context.DailyStat.set({ ...d, views: d.views + views, receipts: d.receipts + 1 });
  },
);

/** The like floor: the vault still moves lastViews/likes, but nothing accrues. */
indexer.onEvent({ contract: "CampaignVault", event: "SuspectReport" }, async ({ event, context }) => {
  const clip = await context.Clip.getOrThrow(id(event.params.clipId));
  context.Clip.set({
    ...clip,
    lastViews: event.params.views,
    likes: event.params.likes,
    suspectReports: clip.suspectReports + 1,
  });
});

// ─────────────── flags and payouts ───────────────

indexer.onEvent({ contract: "CampaignVault", event: "Flagged" }, async ({ event, context }) => {
  const p = event.params;
  const clip = await context.Clip.getOrThrow(id(p.clipId));
  context.Clip.set({ ...clip, status: "Flagged", flaggedAt: event.block.timestamp });
  context.Flag.set({
    id: clip.id,
    clip_id: clip.id,
    brand: addr(p.brand),
    statusBefore: clip.status === "Ended" ? "Ended" : "Active",
    reasonHash: p.reasonHash,
    deadline: Number(p.deadline),
    resolved: false,
    rejected: undefined,
    returned: undefined,
  });
  const b = await brand(context, p.brand);
  context.Brand.set({ ...b, flags: b.flags + 1 });
});

/** Rejected: the returned amount leaves the reserve and the clipper's earnings. Status comes from ClipRejected. */
indexer.onEvent({ contract: "CampaignVault", event: "Resolved" }, async ({ event, context }) => {
  const p = event.params;
  const clip = await context.Clip.getOrThrow(id(p.clipId));
  const flag = await context.Flag.get(clip.id);
  if (flag) context.Flag.set({ ...flag, resolved: true, rejected: p.rejected, returned: p.returned });
  if (!p.rejected) {
    // Accept restores the pre-flag status. Known gap: sweeping a flagged clip makes it resolve to Ended without an
    // event, so that case shows Active until the vault emits the restored status (asked on PR #14).
    context.Clip.set({ ...clip, status: flag?.statusBefore ?? "Active" });
    return;
  }
  const [c, who] = await Promise.all([
    context.Campaign.getOrThrow(clip.campaign_id),
    context.Clipper.getOrThrow(clip.clipper_id),
  ]);
  context.Clip.set({ ...clip, accrued: clip.accrued - p.returned });
  context.Campaign.set({ ...c, reserved: c.reserved - p.returned });
  context.Clipper.set({ ...who, earned: who.earned - p.returned });
  const b = await brand(context, c.brand);
  context.Brand.set({ ...b, rejects: b.rejects + 1, returned: b.returned + p.returned });
});

/** A payout that bounced stays owed and is retried on the next release. */
indexer.onEvent({ contract: "CampaignVault", event: "ReleaseFailed" }, async ({ event, context }) => {
  const clip = await context.Clip.getOrThrow(id(event.params.clipId));
  context.Clip.set({ ...clip, releaseFailures: clip.releaseFailures + 1 });
});

indexer.onEvent(
  { contract: "CampaignVault", event: "Released" },
  async ({ event, context }) => {
    const p = event.params;
    const clip = await context.Clip.getOrThrow(id(p.clipId));
    const c = await context.Campaign.getOrThrow(clip.campaign_id);
    const ts = event.block.timestamp;
    context.Payout.set({
      id: eventId(event.transaction.hash, event.logIndex),
      clip_id: clip.id,
      clipper_id: addr(p.clipper),
      amount: p.amount,
      timestamp: ts,
      txHash: event.transaction.hash,
    });
    context.Clip.set({ ...clip, released: clip.released + p.amount });
    context.Campaign.set({ ...c, reserved: c.reserved - p.amount, paid: c.paid + p.amount });
    const t = await totals(context);
    context.Totals.set({ ...t, paid: t.paid + p.amount, payouts: t.payouts + 1 });
    const d = await dailyStat(context, ts);
    context.DailyStat.set({ ...d, paid: d.paid + p.amount });
  },
);
