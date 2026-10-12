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

/** The sandbox's per-address KV record: claimed before the MON is sent, done once the mint is sent. */
export const SANDBOX_PENDING = "pending";
export const SANDBOX_DONE = "done";

/**
 * A funded account may get a mint-only retry while its mint is still due: claimed, MON arrived, no USDC, never sent a
 * transaction. The record must say so too: a judge who registers a clip and sends their USDC out through the gasless
 * relays also ends with nonce 0, MON and no USDC, and must not be able to mint again and again on the relayer's gas.
 * Records from before the "done" marker ("1") count as done.
 */
export function sandboxMintDue(record: string | null, txCount: number, balance: bigint, usdcBalance: bigint): boolean {
  return record === SANDBOX_PENDING && txCount === 0 && balance > 0n && usdcBalance === 0n;
}

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

// ─────────────────────────── Oracle dispatch (see oracle.ts) ───────────────────────────

/** owner/repo and a workflow file name: nothing that could reshape the API path. */
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const WORKFLOW_FILE = /^[A-Za-z0-9_.-]+\.ya?ml$/;

/**
 * The GitHub request that starts one oracle run (`workflow_dispatch` on the default branch), or null when the
 * trigger is off: no token, or a repo or workflow setting that isn't well formed.
 */
export function oracleDispatch(env: {
  ORACLE_DISPATCH_TOKEN?: string;
  ORACLE_REPO?: string;
  ORACLE_WORKFLOW?: string;
}): { url: string; init: RequestInit } | null {
  const token = env.ORACLE_DISPATCH_TOKEN?.trim();
  const repo = env.ORACLE_REPO ?? "";
  const workflow = env.ORACLE_WORKFLOW ?? "";
  if (!token || !REPO.test(repo) || !WORKFLOW_FILE.test(workflow)) return null;
  return {
    url: `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    init: {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "cliprail-ops-worker", // GitHub rejects requests without one
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  };
}

// ─────────────────────────── Worker oracle (see oracle.ts) ───────────────────────────

export type OracleMode = "off" | "worker" | "github";

/** ORACLE_MODE, read strictly: anything but "worker" or "github" is off, so a typo can't start a second sender. */
export function oracleMode(env: { ORACLE_MODE?: string }): OracleMode {
  const m = env.ORACLE_MODE?.trim();
  return m === "worker" || m === "github" ? m : "off";
}

export const ORACLE_SKIP_DEFAULT = 240;

/** ORACLE_SKIP_SECONDS: a whole number from 0 to 3600, else the default (4 minutes). */
export function oracleSkipSeconds(env: { ORACLE_SKIP_SECONDS?: string }): number {
  const s = env.ORACLE_SKIP_SECONDS?.trim() ?? "";
  if (!/^\d{1,4}$/.test(s)) return ORACLE_SKIP_DEFAULT;
  const n = Number(s);
  return n <= 3600 ? n : ORACLE_SKIP_DEFAULT;
}

/**
 * The gas plan, the same numbers as cre/oracle/config.testnet.json (logic.test.ts checks they match):
 * 200k + 265k per entry (docs/gas.md), capped at 9.5M, so at most 35 entries per report.
 */
export const ORACLE_GAS = { gasBase: 200_000n, gasPerEntry: 265_000n, gasCap: 9_500_000n } as const;
/** Same paging as the CRE workflow: watch-list entries per activeClips() call, and clips read per run. */
export const ORACLE_PAGE = 100;
export const ORACLE_MAX_CLIPS = 500;
/** A register-triggered run is skipped if the Worker oracle started one this recently (caps YouTube and KV use). */
export const ORACLE_REGISTER_DEBOUNCE = 120;

/**
 * What the Worker oracle remembers between runs (one KV value). Times are chain timestamps (seconds).
 *  - round: the latest lastRound the Worker has seen; own = the Worker sent it.
 *  - seenAt: when the Worker first saw `round` (for another runner's round, the start of the skip window).
 *  - checkedAt: the chain time of the clip read in the last run that finished cleanly (YouTube read, and the
 *    report applied or nothing to send). The keeper only expires Pending clips registered before it.
 *  - ranAt: when the last run started (debounces register-triggered runs).
 */
export interface OracleState {
  round: string;
  own: boolean;
  seenAt: number;
  checkedAt: number;
  ranAt: number;
}

export function parseOracleState(raw: unknown): OracleState | null {
  const s = raw as Partial<OracleState> | null;
  if (!s || typeof s.round !== "string" || !/^\d+$/.test(s.round)) return null;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return { round: s.round, own: s.own === true, seenAt: n(s.seenAt), checkedAt: n(s.checkedAt), ranAt: n(s.ranAt) };
}

export type OracleTrigger = "cron" | "register";

/**
 * Should this run go ahead? Another runner (David's CRE simulator loop) may use the same key. If lastRound moved
 * and the Worker didn't move it, that runner is alive: skip for `skipSecs` so the two don't send the same round.
 * Returns the state to store when it changed (null = no KV write).
 */
export function planOracleRun(
  state: OracleState | null,
  lastRound: bigint,
  now: number,
  skipSecs: number,
  trigger: OracleTrigger,
): { run: boolean; why: string; store: OracleState | null } {
  if (!state) return { run: true, why: "first run", store: null };
  const known = BigInt(state.round);
  if (lastRound > known) {
    const store = { ...state, round: lastRound.toString(), own: false, seenAt: now };
    if (skipSecs === 0) return { run: true, why: `round ${lastRound} came from another runner`, store };
    return { run: false, why: `another runner sent round ${lastRound}; skipping for ${skipSecs} s`, store };
  }
  if (!state.own && lastRound === known && now - state.seenAt < skipSecs) {
    return { run: false, why: `another runner sent round ${lastRound} ${now - state.seenAt} s ago`, store: null };
  }
  if (trigger === "register" && now - state.ranAt < ORACLE_REGISTER_DEBOUNCE) {
    return { run: false, why: `the Worker oracle ran ${now - state.ranAt} s ago`, store: null };
  }
  return { run: true, why: "", store: null };
}

/**
 * The mock forwarder's rawReport: a 109-byte header then the vault's report (contracts/test/fork/VaultV1Fork.t.sol
 * builds the same). The testnet vault checks none of the metadata, only that tx.origin is the oracle wallet. The
 * execution id must be fresh on every send: the forwarder refuses a (receiver, executionId, reportId) it has seen,
 * and a retried round reuses its round number. The workflow name "cr-worker" marks Worker reports on chain.
 */
export const WORKER_WORKFLOW_NAME = "cr-worker";

export function forwarderRawReport(executionId: Hex, timestamp: number, report: Hex): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(executionId)) throw new Error("executionId must be 32 bytes");
  const hex = (n: number, bytes: number) => n.toString(16).padStart(bytes * 2, "0");
  const name = [...WORKER_WORKFLOW_NAME].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0")).join("").padEnd(20, "0");
  return `0x${[
    "01", // version
    executionId.slice(2),
    hex(timestamp >>> 0, 4),
    hex(0, 4), // donId
    hex(0, 4), // configVersion
    hex(0, 32), // workflowCid
    name, // workflowName, bytes10
    hex(0, 20), // workflowOwner
    "0001", // reportId
    report.slice(2),
  ].join("")}` as Hex;
}

export type ReportOutcome = "applied" | "lost-race" | "failed";

/**
 * Did our report land? `vaultAccepted` = the transaction succeeded and the forwarder's ReportProcessed said the
 * vault ran it (the mock forwarder swallows vault reverts, so a green transaction alone proves nothing).
 * Rejected while lastRound already reached our round = another runner sent that round first: a lost race, not a fault.
 */
export function reportOutcome(round: bigint, lastRoundAfter: bigint, vaultAccepted: boolean): ReportOutcome {
  if (vaultAccepted && lastRoundAfter >= round) return "applied";
  return lastRoundAfter >= round ? "lost-race" : "failed";
}

/**
 * The keeper's guard in worker mode: expire a Pending clip only if a clean Worker oracle run read the chain after
 * the clip was registered, so a clip is never rejected just because the oracle missed it (outage, YouTube error).
 */
export function oracleCheckedSince(checkedAt: number, registeredAt: bigint): boolean {
  return BigInt(checkedAt) > registeredAt;
}
