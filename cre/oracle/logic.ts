/**
 * Pure oracle logic (playbook D-2.2 to D-2.5): no CRE imports, so it runs under `node --test` and inside
 * the WASM workflow alike. main.ts does the I/O; this file decides what the report says.
 */
import { encodeAbiParameters, type Hex } from "viem";
import { claimCode, descriptionHasCode, FLAG_OWNERSHIP_OK, FLAG_UNAVAILABLE } from "@cliprail/shared/claim";

/** ICampaignVault.ClipStatus, in declaration order. logic.test.ts checks this against the Solidity enum. */
export const ClipStatus = { None: 0, Pending: 1, Active: 2, Flagged: 3, Rejected: 4, Ended: 5 } as const;

/** One row of CampaignVault.activeClips(offset, limit). */
export interface ActiveClip {
  clipId: bigint;
  campaignId: bigint;
  clipper: `0x${string}`;
  videoId: string;
  status: number;
  lastViews: bigint;
  lastLikes: bigint;
}

/** PRD §5.2: struct ClipUpdate { uint256 clipId; uint64 views; uint64 likes; uint64 publishedAt; uint8 flags } */
export interface ClipUpdate {
  clipId: bigint;
  views: bigint;
  likes: bigint;
  publishedAt: bigint;
  flags: number;
}

/** The subset of a YouTube videos.list item we request (see YT_FIELDS). */
export interface YtItem {
  id: string;
  snippet?: { publishedAt?: string; description?: string };
  statistics?: { viewCount?: string; likeCount?: string };
  status?: { privacyStatus?: string; uploadStatus?: string };
}

/** Trims each response to what we use, keeping 50 items well under CRE's 250 KB response limit. */
export const YT_FIELDS =
  "items(id,snippet(publishedAt,description),statistics(viewCount,likeCount),status(privacyStatus,uploadStatus))";

export function videosUrl(ids: readonly string[], apiKey: string): string {
  const q = [
    "part=snippet,statistics,status",
    `id=${ids.join(",")}`,
    `fields=${encodeURIComponent(YT_FIELDS)}`,
    `key=${encodeURIComponent(apiKey)}`,
  ];
  return `https://www.googleapis.com/youtube/v3/videos?${q.join("&")}`;
}

export function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/**
 * Consensus rounding (D-2.3, see cre/README.md). Nodes call YouTube seconds apart, so raw counts can
 * differ by a few. Rounding down to coarse steps lets identical-aggregation agree; the steps cost at most
 * 49 views and 4 likes per report, and the remainder is paid on a later report.
 */
export const VIEW_STEP = 50n;
export const LIKE_STEP = 5n;
const floorTo = (n: bigint, step: bigint) => (n / step) * step;

function toUnix(iso: string | undefined): bigint {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? BigInt(Math.floor(ms / 1000)) : 0n;
}

function toCount(s: string | undefined): bigint {
  // Hidden like counts are missing: treat as 0 so the like floor marks the clip suspect (PRD §13).
  return s && /^\d+$/.test(s) ? BigInt(s) : 0n;
}

/**
 * Turns the vault's clip list plus YouTube's answers into report entries (D-2.4).
 * - UNAVAILABLE when the video is missing, private/unlisted, or not processed.
 * - OWNERSHIP_OK when the description contains the clipper's claim code.
 * - Active clips with no change since the last report are skipped. Pending clips are always sent, so the
 *   vault can activate them or reject them after its 48 h window.
 */
export function buildUpdates(clips: readonly ActiveClip[], items: readonly YtItem[]): ClipUpdate[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  const out: ClipUpdate[] = [];
  for (const clip of clips) {
    const it = byId.get(clip.videoId);
    const available = !!it && it.status?.privacyStatus === "public" && (it.status.uploadStatus ?? "processed") === "processed";
    if (!available) {
      out.push({ clipId: clip.clipId, views: clip.lastViews, likes: clip.lastLikes, publishedAt: 0n, flags: FLAG_UNAVAILABLE });
      continue;
    }
    const views = floorTo(toCount(it.statistics?.viewCount), VIEW_STEP);
    const likes = floorTo(toCount(it.statistics?.likeCount), LIKE_STEP);
    const owned = descriptionHasCode(it.snippet?.description ?? "", claimCode(clip.campaignId, clip.clipper));
    const pending = clip.status === ClipStatus.Pending;
    if (!pending && views === clip.lastViews && likes === clip.lastLikes) continue;
    out.push({
      clipId: clip.clipId,
      views,
      likes,
      publishedAt: toUnix(it.snippet?.publishedAt),
      flags: owned ? FLAG_OWNERSHIP_OK : 0,
    });
  }
  return out;
}

export interface GasPlan {
  gasBase: bigint;
  gasPerEntry: bigint;
  gasCap: bigint;
}

/** How many entries fit under the gas cap. */
export function maxEntries({ gasBase, gasPerEntry, gasCap }: GasPlan): number {
  return Number((gasCap - gasBase) / gasPerEntry);
}

export function gasLimitFor(n: number, { gasBase, gasPerEntry, gasCap }: GasPlan): bigint {
  const g = gasBase + gasPerEntry * BigInt(n);
  return g > gasCap ? gasCap : g;
}

/**
 * Picks what goes into this round when there are more updates than fit: status changes first
 * (unavailable, pending), then the biggest view gains. The rest go out next round.
 */
export function prioritize(updates: readonly ClipUpdate[], clips: readonly ActiveClip[], limit: number): ClipUpdate[] {
  if (updates.length <= limit) return [...updates];
  const last = new Map(clips.map((c) => [c.clipId, c]));
  const rank = (u: ClipUpdate) => {
    const c = last.get(u.clipId);
    if (u.flags & FLAG_UNAVAILABLE) return 3n << 64n;
    if (c?.status === ClipStatus.Pending) return 2n << 64n;
    return u.views - (c?.lastViews ?? 0n);
  };
  return [...updates]
    .sort((a, b) => {
      const d = rank(b) - rank(a);
      return d > 0n ? 1 : d < 0n ? -1 : a.clipId < b.clipId ? -1 : 1;
    })
    .slice(0, limit)
    .sort((a, b) => (a.clipId < b.clipId ? -1 : 1));
}

/** WriteReportReply.receiverContractExecutionStatus value for a vault revert (not exported by the SDK). */
export const RECEIVER_REVERTED = 1;

/**
 * Did the vault really apply the report? On testnet the mock forwarder catches a vault revert (for example
 * out of gas) and still succeeds, so a green transaction proves nothing. Returns an error message, or null.
 */
export function reportNotApplied(round: bigint, lastRoundAfter: bigint, receiverStatus: number | undefined): string | null {
  if (receiverStatus === RECEIVER_REVERTED) {
    return `the vault reverted inside the forwarder (round ${round}); often out of gas, check gasBase/gasPerEntry`;
  }
  if (lastRoundAfter !== round) {
    return `the report transaction succeeded but vault lastRound is ${lastRoundAfter}, expected ${round}: the vault did not apply it (often out of gas)`;
  }
  return null;
}

/** report = abi.encode(uint64 round, ClipUpdate[] u) (PRD §5.2). */
export function encodeReport(round: bigint, updates: readonly ClipUpdate[]): Hex {
  return encodeAbiParameters(
    [
      { name: "round", type: "uint64" },
      {
        name: "u",
        type: "tuple[]",
        components: [
          { name: "clipId", type: "uint256" },
          { name: "views", type: "uint64" },
          { name: "likes", type: "uint64" },
          { name: "publishedAt", type: "uint64" },
          { name: "flags", type: "uint8" },
        ],
      },
    ],
    [round, updates.map((u) => ({ ...u }))],
  );
}

// Node-mode results cross the consensus boundary as one canonical string (identical aggregation).

export function serializeUpdates(updates: readonly ClipUpdate[]): string {
  return JSON.stringify(updates.map((u) => [u.clipId.toString(), u.views.toString(), u.likes.toString(), u.publishedAt.toString(), u.flags]));
}

export function deserializeUpdates(s: string): ClipUpdate[] {
  return (JSON.parse(s) as [string, string, string, string, number][]).map(([clipId, views, likes, publishedAt, flags]) => ({
    clipId: BigInt(clipId),
    views: BigInt(views),
    likes: BigInt(likes),
    publishedAt: BigInt(publishedAt),
    flags,
  }));
}
