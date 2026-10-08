/**
 * Keeper, every 5 minutes (playbook I-3.4, PRD §5.5). Reads the lens's to-do lists and sends:
 *  - release(ids), packed by gas from each clip's matured tranches, skipping clips whose payout keeps failing
 *    (back-off, audit V1-7);
 *  - autoResolve(id) for flags past their resolve window;
 *  - expirePending(id) for Pending clips past pendingTimeout;
 *  - sweep(ids) for watched clips whose campaign is closed or over.
 * Safe to run twice: every call is simulated first, and a call whose work is already done fails simulation (or, for
 * release, pays nothing). It also pings Envio to keep the hosted indexer warm.
 *
 * Budget (Workers free plan): 50 subrequests and 1,000 KV writes a day. Reads are batched into one request where
 * possible, transactions are signed locally (one request each), receipts are read once, and KV is written only
 * when a payout fails.
 */
import { campaignVaultAbi, campaignVaultLensAbi } from "@cliprail/abi";
import { encodeFunctionData, formatEther, parseEther, parseEventLogs, type Hex } from "viem";
import { clients, type Clients, type Fees, nonceAndFees, shortError, signAndSend } from "./chain";
import { deployment, type Deployment, type Env } from "./env";
import { type Backoff, chunk, maturedTranches, nextBackoff, planReleases, relayGas } from "./logic";

/** keeperList page size; the lens filters each page, so pages can come back short. */
const PAGE = 200;
/** Raw list entries scanned per list per run. */
const MAX_SCAN = 2_000;
/** Transactions per run, so one run stays within the subrequest budget. */
const MAX_TXS = 8;
/** Gas cap for single-clip calls (autoResolve, expirePending) and sweep. */
const SINGLE_CALL_CAP = 3_000_000n;
const SWEEP_BATCH = 50;
/** Below this the keeper logs a warning on every run. */
const LOW_BALANCE = parseEther("1");

const KeeperList = { Watch: 0, Pay: 1, Flag: 2 } as const;
type LensFn = "releasableClips" | "expiredFlags" | "expiredPending" | "sweepableClips";

/**
 * Pages one keeper list: in a single multicall per page, the raw vault list (to know where it ends) and the
 * lens's filtered view of the same window.
 */
async function todo(c: Clients, dep: Deployment, list: number, fn: LensFn): Promise<bigint[]> {
  const out: bigint[] = [];
  for (let offset = 0n; offset < BigInt(MAX_SCAN); offset += BigInt(PAGE)) {
    const [raw, filtered] = await c.publicClient.multicall({
      allowFailure: false,
      contracts: [
        { address: dep.vault, abi: campaignVaultAbi, functionName: "keeperList", args: [list, offset, BigInt(PAGE)] },
        { address: dep.lens, abi: campaignVaultLensAbi, functionName: fn, args: [offset, BigInt(PAGE)] },
      ],
    });
    out.push(...(filtered as readonly bigint[]));
    if ((raw as readonly bigint[]).length < PAGE) break;
  }
  return out;
}

/** Matured, unpaid tranches per clip (sets the release gas), read in one multicall. */
async function trancheCounts(c: Clients, dep: Deployment, ids: bigint[], nowSecs: bigint): Promise<Map<bigint, number>> {
  const counts = new Map<bigint, number>();
  if (ids.length === 0) return counts;
  const results = await c.publicClient.multicall({
    allowFailure: false,
    contracts: ids.flatMap((id) => [
      { address: dep.vault, abi: campaignVaultAbi, functionName: "getTranches", args: [id] } as const,
      { address: dep.vault, abi: campaignVaultAbi, functionName: "getClip", args: [id] } as const,
    ]),
  });
  ids.forEach((id, i) => {
    const tranches = results[2 * i] as readonly { amount: bigint; unlockAt: bigint }[];
    const clip = results[2 * i + 1] as { released: bigint };
    counts.set(id, maturedTranches(tranches, clip.released, nowSecs));
  });
  return counts;
}

/** All back-offs live in one KV value: one read per run, one write only when a payout fails. */
type Backoffs = Record<string, Backoff>;
const backoffKey = (env: Env) => `release-backoff:${env.NETWORK}`;

async function readBackoffs(env: Env, nowSecs: number): Promise<Backoffs> {
  const all = ((await env.RATE.get(backoffKey(env), "json")) ?? {}) as Backoffs;
  // Forget clips that have been quiet for a week.
  for (const [id, b] of Object.entries(all)) if (b.until < nowSecs - 7 * 86_400) delete all[id];
  return all;
}

interface Sent {
  kind: string;
  ids: bigint[];
  hash: Hex;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runKeeper(env: Env): Promise<string> {
  const dep = deployment(env);
  if (!dep) return `keeper: no ${env.NETWORK} deployment`;
  const c = clients(env);

  if (env.ENVIO_URL) {
    // Fire and forget; a cold indexer isn't the keeper's failure.
    fetch(env.ENVIO_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    }).catch(() => {});
  }

  const [releasable, flags, pending, sweepable, block] = await Promise.all([
    todo(c, dep, KeeperList.Pay, "releasableClips"),
    todo(c, dep, KeeperList.Flag, "expiredFlags"),
    todo(c, dep, KeeperList.Watch, "expiredPending"),
    todo(c, dep, KeeperList.Watch, "sweepableClips"),
    c.publicClient.getBlock(),
  ]);
  // Chain time, not the Worker's clock: the lens and the vault both use block.timestamp.
  const chainNow = block.timestamp;
  const now = Number(chainNow);

  const backoffs = await readBackoffs(env, now);
  const toRelease = releasable.filter((id) => (backoffs[id.toString()]?.until ?? 0) <= now);
  const waiting = releasable.length - toRelease.length;
  const counts = await trancheCounts(c, dep, toRelease, chainNow);
  const releases = planReleases(toRelease.map((id) => ({ id, tranches: counts.get(id) ?? 1 })));

  const sent: Sent[] = [];
  const errors: string[] = [];
  const work = releases.length + flags.length + pending.length + sweepable.length;
  let state: ({ nonce: number } & Fees) | null = null;
  let balance = 0n;
  if (work > 0) {
    // One nonce and fee read, then count up locally: the sends below go out back to back.
    [state, balance] = await Promise.all([nonceAndFees(c), c.publicClient.getBalance({ address: c.address })]);
  } else {
    balance = await c.publicClient.getBalance({ address: c.address });
  }

  /** Simulate, then send with an explicit limit. A failed simulation skips the call (e.g. another run did it). */
  async function send(kind: string, ids: bigint[], functionName: string, args: readonly unknown[], fixedGas?: bigint) {
    if (!state || sent.length >= MAX_TXS) return;
    const call = { address: dep!.vault, abi: campaignVaultAbi, functionName, args, account: c.address } as never;
    let gas = fixedGas;
    try {
      // Batched into one request.
      const [, estimate] = await Promise.all([
        c.publicClient.simulateContract(call),
        fixedGas === undefined ? c.publicClient.estimateContractGas(call) : Promise.resolve(0n),
      ]);
      if (gas === undefined) gas = relayGas(estimate);
    } catch (err) {
      errors.push(`${kind} ${ids.join(",")}: simulation failed (${shortError(err)})`);
      return;
    }
    if (gas > SINGLE_CALL_CAP && fixedGas === undefined) {
      errors.push(`${kind} ${ids.join(",")}: gas ${gas} above cap`);
      return;
    }
    const data = encodeFunctionData({ abi: campaignVaultAbi, functionName, args } as never);
    try {
      const hash = await signAndSend(c, { to: dep!.vault, data, gas, ...state });
      state.nonce++;
      sent.push({ kind, ids, hash });
    } catch (err) {
      // Most likely a nonce race with a relayed request; resync and let the next run retry this one.
      errors.push(`${kind} ${ids.join(",")}: send failed (${shortError(err)})`);
      try {
        state = await nonceAndFees(c);
      } catch {
        state = null; // RPC trouble: stop sending this run
      }
    }
  }

  for (const r of releases) await send("release", r.ids, "release", [r.ids], r.gas);
  for (const id of flags) await send("autoResolve", [id], "autoResolve", [id]);
  for (const id of pending) await send("expirePending", [id], "expirePending", [id]);
  for (const batch of chunk(sweepable, SWEEP_BATCH)) await send("sweep", batch, "sweep", [batch]);

  // Releases: read the receipts once (batched) so failing payouts back off instead of retrying every 5 minutes.
  // A receipt that isn't there yet is simply checked again next run, when the clip shows up as releasable or not.
  let failed = 0;
  const releaseTxs = sent.filter((x) => x.kind === "release");
  if (releaseTxs.length > 0) {
    await sleep(2_000); // Monad blocks are ~0.4 s
    const receipts = await Promise.all(
      releaseTxs.map((s) => c.publicClient.getTransactionReceipt({ hash: s.hash }).catch(() => null)),
    );
    let changed = false;
    receipts.forEach((receipt, i) => {
      const s = releaseTxs[i];
      if (!receipt) return void errors.push(`release tx ${s.hash}: no receipt yet`);
      if (receipt.status !== "success") return void errors.push(`release tx ${s.hash} reverted (gas ${s.ids.length} clips)`);
      for (const log of parseEventLogs({ abi: campaignVaultAbi, eventName: "ReleaseFailed", logs: receipt.logs })) {
        const id = log.args.clipId.toString();
        backoffs[id] = nextBackoff(backoffs[id] ?? null, now);
        changed = true;
        failed++;
        console.warn(`ReleaseFailed clip ${id}: try #${backoffs[id].failures}, next after ${new Date(backoffs[id].until * 1000).toISOString()}`);
      }
    });
    if (changed) {
      await env.RATE.put(backoffKey(env), JSON.stringify(backoffs)).catch((err) => errors.push(`backoff write failed (${shortError(err)})`));
    }
  }

  const summary =
    `keeper ${env.NETWORK}: releasable ${releasable.length} (backing off ${waiting}, failed now ${failed}), ` +
    `flags ${flags.length}, pending ${pending.length}, sweepable ${sweepable.length}; ` +
    `sent ${sent.length}${sent.length ? `: ${sent.map((s) => `${s.kind}[${s.ids.length}] ${s.hash}`).join(", ")}` : ""}; ` +
    `relayer ${formatEther(balance)} MON`;
  console.log(summary);
  if (balance < LOW_BALANCE) console.warn(`keeper: relayer ${c.address} is low on MON (${formatEther(balance)}); top it up`);
  for (const e of errors) console.warn(`keeper: ${e}`);
  return summary;
}
