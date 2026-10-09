/**
 * Pure rules for the ops Worker: request schemas, gas limits, the YouTube preview shape, keeper back-off and CORS.
 * No Worker or network globals here, so `node --test` covers all of it.
 */
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { z } from "zod";
import { YT_ID } from "@cliprail/shared";
import { descriptionHasCode } from "@cliprail/shared/claim";

// ─────────────────────────── Request bodies (bigints arrive as decimal strings) ───────────────────────────

const uint = z
  .string()
  .regex(/^\d{1,78}$/, "expected a decimal integer string")
  .transform((s) => BigInt(s));
const address = z
  .string()
  .refine((s) => isAddress(s, { strict: false }), "expected an address")
  .transform((s) => getAddress(s));
/** 65-byte EOA signatures, or longer ERC-1271 / ERC-6492 ones; capped so a body can't be huge. */
const sig = z
  .string()
  .regex(/^0x([0-9a-fA-F]{2}){65,2048}$/, "expected a hex signature")
  .transform((s) => s as Hex);
const bytes32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected 32 bytes of hex")
  .transform((s) => s as Hex);

export const registerBody = z.object({
  campaignId: uint,
  videoId: z.string().regex(YT_ID, "expected an 11-character YouTube video id"),
  clipper: address,
  nonce: uint,
  deadline: uint,
  sig,
});

export const payoutBody = z.object({
  clipper: address,
  /** The zero address resets payouts to the clipper. */
  payout: address,
  nonce: uint,
  deadline: uint,
  sig,
});

export const transferBody = z.object({
  from: address,
  to: address,
  value: uint,
  validAfter: uint,
  validBefore: uint,
  nonce: bytes32,
  sig,
});

/** POST /sandbox/fund: the judge's fresh account. */
export const sandboxBody = z.object({ address });

/**
 * Monad's reserve balance: a transaction that sends MON as value reverts if the sender ends below 10 MON, unless it
 * is the sender's first transaction in the last 3 blocks. Above this, a transfer needs no special handling.
 */
export const MONAD_USER_RESERVE = 10n * 10n ** 18n;
export function needsEmptyingSlot(senderBalance: bigint, value: bigint, gasCost: bigint): boolean {
  return senderBalance < MONAD_USER_RESERVE + value + gasCost;
}

/** No transaction from the sender mined in the last 3 blocks and none pending: the next one is "emptying". */
export function noInflight(nonceNow: number, nonce3BlocksAgo: number, noncePending: number): boolean {
  return nonceNow === nonce3BlocksAgo && noncePending === nonceNow;
}

export type RegisterBody = z.infer<typeof registerBody>;
export type PayoutBody = z.infer<typeof payoutBody>;
export type TransferBody = z.infer<typeof transferBody>;

/** First zod issue as "field: message", for a 400 body. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "invalid request";
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

/** Signed deadline must still be ahead of now, with a margin for the transaction to land. */
export function deadlineOk(deadline: bigint, nowSecs: number, marginSecs = 30): boolean {
  return deadline > BigInt(Math.floor(nowSecs) + marginSecs);
}

// ─────────────────────────── Gas (Monad charges the limit, not the gas used: docs/gas.md) ───────────────────────────

/** Relayed calls: estimate × 1.15. `cap` refuses calls that cost far more than measured (audit V1-11). */
export const RELAY_GAS_CAP = {
  register: 400_000n, // measured 276k
  payout: 200_000n,
  transfer: 200_000n,
} as const;

export function relayGas(estimate: bigint): bigint {
  return (estimate * 115n) / 100n;
}

/** release(clipIds): 1.1 × (110k + 225k × n), from docs/gas.md, for clips with one matured tranche each. */
export function releaseGas(n: number): bigint {
  return releaseGasFor(Array<number>(n).fill(1));
}

/**
 * The vault's _pay reads every matured tranche (up to 200 per release), about 1.5k gas each on a fork (60 tranches:
 * 336.5k vs 5 tranches: 251.4k). A flag that auto-resolves or a keeper outage can leave hundreds matured at once,
 * so the limit has to grow with them: 1.1 × (110k + Σ (225k + 2k × (tranches − 1))).
 */
export function releaseGasFor(trancheCounts: readonly number[]): bigint {
  let sum = 110_000n;
  for (const k of trancheCounts) sum += 225_000n + 2_000n * BigInt(Math.max(0, Math.min(k, MAX_TRANCHES_PER_RELEASE) - 1));
  return (sum * 11n) / 10n;
}

/** CampaignVault.MAX_TRANCHES_PER_RELEASE. */
export const MAX_TRANCHES_PER_RELEASE = 200;
/** Clips per release() call. 25 one-tranche clips cost at most ~6.3M gas. */
export const RELEASE_BATCH = 25;
/** Gas limit per release() transaction; batches are packed under it. */
export const RELEASE_TX_GAS_MAX = 8_000_000n;

export interface TrancheView {
  amount: bigint;
  unlockAt: bigint;
}

/**
 * Matured, unpaid tranches of a clip, as _pay will walk them. Paid tranches are a prefix whose amounts add up to
 * `released`, so the first unpaid one is where that running sum is reached.
 */
export function maturedTranches(tranches: readonly TrancheView[], released: bigint, nowSecs: bigint): number {
  let i = 0;
  for (let paid = 0n; i < tranches.length && paid < released; i++) paid += tranches[i].amount;
  let n = 0;
  for (; i < tranches.length && n < MAX_TRANCHES_PER_RELEASE && tranches[i].unlockAt <= nowSecs; i++) n++;
  return n;
}

/** Packs clips into release() batches of at most RELEASE_BATCH clips and RELEASE_TX_GAS_MAX gas. */
export function planReleases(items: readonly { id: bigint; tranches: number }[]): { ids: bigint[]; gas: bigint }[] {
  const out: { ids: bigint[]; gas: bigint }[] = [];
  let ids: bigint[] = [];
  let counts: number[] = [];
  for (const it of items) {
    const next = [...counts, Math.max(1, it.tranches)];
    if (ids.length > 0 && (ids.length >= RELEASE_BATCH || releaseGasFor(next) > RELEASE_TX_GAS_MAX)) {
      out.push({ ids, gas: releaseGasFor(counts) });
      ids = [];
      counts = [];
    }
    ids.push(it.id);
    counts.push(Math.max(1, it.tranches));
  }
  if (ids.length) out.push({ ids, gas: releaseGasFor(counts) });
  return out;
}

// ─────────────────────────── YouTube preview (playbook I-3.3) ───────────────────────────

export interface Preview {
  videoId: string;
  title: string;
  channel: string;
  thumb: string;
  views: number;
  likes: number;
  publishedAt: number;
  durationSec: number;
  public: boolean;
  codeFound: boolean;
}

/** The parts of a videos.list item (snippet, statistics, contentDetails, status) the preview reads. */
export interface YtVideo {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  statistics?: { viewCount?: string; likeCount?: string };
  contentDetails?: { duration?: string };
  status?: { privacyStatus?: string; uploadStatus?: string };
}

export const CLAIM_CODE = /^CR-[0-9A-Fa-f]{16}$/;

/** ISO 8601 duration as YouTube writes it ("PT1M5S", "P1DT2H") → seconds. Unknown shapes → 0. */
export function isoDurationSecs(iso: string | undefined): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso ?? "");
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return ((d * 24 + h) * 60 + min) * 60 + s;
}

/** Public and fully processed: the same test the oracle uses before it pays. */
export function isPublic(v: YtVideo): boolean {
  return v.status?.privacyStatus === "public" && v.status?.uploadStatus === "processed";
}

export function toPreview(v: YtVideo, code: string | null): Preview {
  const t = v.snippet?.thumbnails ?? {};
  const thumb = t.maxres?.url ?? t.high?.url ?? t.medium?.url ?? t.default?.url ?? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
  const published = Date.parse(v.snippet?.publishedAt ?? "");
  return {
    videoId: v.id,
    title: v.snippet?.title ?? "",
    channel: v.snippet?.channelTitle ?? "",
    thumb,
    // Hidden like counts count as 0, as in the oracle.
    views: Number(v.statistics?.viewCount ?? 0),
    likes: Number(v.statistics?.likeCount ?? 0),
    publishedAt: Number.isNaN(published) ? 0 : Math.floor(published / 1000),
    durationSec: isoDurationSecs(v.contentDetails?.duration),
    public: isPublic(v),
    codeFound: code !== null && descriptionHasCode(v.snippet?.description ?? "", code),
  };
}

// ─────────────────────────── Keeper back-off (audit V1-7) ───────────────────────────

/** A clip whose payout keeps failing (ReleaseFailed) waits 1 h, 2 h, 4 h … up to 24 h between tries. */
export function backoffSecs(failures: number): number {
  return Math.min(3600 * 2 ** Math.max(0, failures - 1), 86_400);
}

export interface Backoff {
  failures: number;
  until: number;
}

export function nextBackoff(prev: Backoff | null, nowSecs: number): Backoff {
  const failures = (prev?.failures ?? 0) + 1;
  return { failures, until: nowSecs + backoffSecs(failures) };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ─────────────────────────── Rate limits ───────────────────────────

/** Per-address daily counter key; the UTC day rolls the window. */
export function dailyKey(network: string, route: string, who: Address, nowMs: number): string {
  return `rl:${network}:${route}:${who.toLowerCase()}:${new Date(nowMs).toISOString().slice(0, 10)}`;
}

export const PER_ADDRESS_DAILY_LIMIT = 20;

// ─────────────────────────── CORS ───────────────────────────

/**
 * WEB_ORIGINS is a comma-separated list. `*` matches one or more of [a-z0-9-] inside a host label, so
 * `https://cliprail-*-chibey-maxs-projects.vercel.app` allows Vercel previews and nothing else.
 */
export function originAllowed(origin: string | null, allowList: string): boolean {
  if (!origin) return false;
  return allowList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((pattern) => {
      const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+")}$`);
      return re.test(origin);
    });
}

// ─────────────────────────── Revert reasons the user can act on ───────────────────────────

const REVERT_MESSAGES: Record<string, string> = {
  TierTooLow: "Your reputation tier is too low for this campaign.",
  CampaignNotActive: "This campaign isn't accepting clips.",
  CampaignEnded: "This campaign has ended.",
  VideoAlreadyRegistered: "This Short is already registered.",
  InvalidVideoId: "That isn't a valid YouTube video id.",
  ExpiredDeadline: "The signature expired. Try again.",
  InvalidNonce: "The signature is out of date. Try again.",
  InvalidSignature: "The signature doesn't match this account.",
  TooManyPending: "You have too many clips waiting for verification in this campaign.",
  InvalidPayout: "That payout address isn't allowed.",
  EnforcedPause: "Cliprail is paused right now. Try again later.",
};

export function revertMessage(errorName: string | undefined, reason: string | undefined): string {
  if (errorName && REVERT_MESSAGES[errorName]) return REVERT_MESSAGES[errorName];
  if (reason) return `The transaction would fail: ${reason}`;
  return errorName ? `The transaction would fail (${errorName}).` : "The transaction would fail.";
}
