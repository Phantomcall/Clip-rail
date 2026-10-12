/**
 * The view oracle, run one of two ways (ORACLE_MODE, see env.ts). Only one may be on: both use the oracle wallet,
 * and two senders would race for the same round.
 *
 * github: the CRE oracle runs in GitHub Actions (`.github/workflows/oracle-runner.yml`), but GitHub starts scheduled
 * runs hours late (every 3–6 h in practice), and a Pending clip is rejected by the keeper after pendingTimeout
 * (10 minutes on testnet). A `workflow_dispatch` starts at once, so this Worker asks for a run:
 *  - from its own cron, every 5 minutes while the vault's watch list has clips;
 *  - right after a gasless registration, so the new clip can activate before its timeout.
 * The workflow's `concurrency` group keeps one run going and one waiting, so extra requests can't pile up, and the
 * oracle itself sends nothing when no clip changed. Needs the ORACLE_DISPATCH_TOKEN secret.
 *
 * worker: the fallback while CRE deploy access is pending (without it, the CRE CLI can't log in headless). The
 * Worker runs the CRE workflow's own decision logic (cre/oracle/logic.ts, imported, not copied) on the same two
 * triggers and sends the report through the testnet mock forwarder from the oracle wallet. The testnet vault
 * accepts that path: its forwarder is the mock, and it only checks that tx.origin is reportTransmitter.
 *  - read lastRound, reportTransmitter and the watch list at one block, then YouTube (batches of 50);
 *  - nothing changed: send nothing;
 *  - otherwise one report of up to 35 entries, gas 200k + 265k per entry (Monad charges the limit);
 *  - then confirm from the receipt and lastRound that the vault applied it; log loudly if not.
 * David's laptop may run the real CRE simulator with the same key: if lastRound moved and the Worker didn't move
 * it, the Worker skips for ORACLE_SKIP_SECONDS (default 4 minutes).
 */
import { addressesFor, campaignVaultAbi } from "@cliprail/abi";
import {
  type ActiveClip,
  buildUpdates,
  chunk,
  encodeReport,
  gasLimitFor,
  maxEntries,
  prioritize,
  videosUrl,
  type YtItem,
} from "@cliprail/cre-oracle/logic.ts";
import { encodeFunctionData, formatEther, getAddress, isAddress, isAddressEqual, parseEther, parseEventLogs, toHex, type Address, type Hex } from "viem";
import { clients, nonceAndFees, oracleClients, shortError, signAndSend } from "./chain";
import { deployment, type Env } from "./env";
import {
  forwarderRawReport,
  ORACLE_GAS,
  ORACLE_MAX_CLIPS,
  ORACLE_PAGE,
  oracleDispatch,
  oracleMode,
  oracleSkipSeconds,
  type OracleState,
  type OracleTrigger,
  parseOracleState,
  planOracleRun,
  reportOutcome,
} from "./logic";

// ─────────────────────────── github mode ───────────────────────────

/** Asks GitHub for one oracle run. Never throws: a missed dispatch only waits for the next one. */
export async function triggerOracle(env: Env, reason: string): Promise<void> {
  const req = oracleDispatch(env);
  if (!req) return;
  try {
    const res = await fetch(req.url, req.init);
    // 204 = queued. 401/403/404 = wrong token or workflow name: logged on every attempt until fixed.
    if (res.status !== 204) console.error(`oracle dispatch (${reason}) failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    else console.log(`oracle dispatch (${reason}) queued`);
  } catch (err) {
    console.error(`oracle dispatch (${reason}) failed: ${shortError(err)}`);
  }
}

/** Cron: dispatch only while there is something to watch (one RPC read, one GitHub request). */
export async function oracleTick(env: Env): Promise<void> {
  if (!oracleDispatch(env)) return;
  const dep = deployment(env);
  if (!dep) return;
  try {
    const watched = await clients(env).publicClient.readContract({
      address: dep.vault,
      abi: campaignVaultAbi,
      functionName: "watchListLength",
    });
    if (watched === 0n) return;
  } catch (err) {
    console.warn(`oracle tick: watch list unreadable (${shortError(err)}); dispatching anyway`);
  }
  await triggerOracle(env, "cron");
}

// ─────────────────────────── both modes: the two triggers ───────────────────────────

/** Cron trigger (one minute after the keeper, in its own invocation). */
export async function oracleCron(env: Env): Promise<void> {
  const mode = oracleMode(env);
  if (mode === "github") return oracleTick(env);
  if (mode === "worker") await runWorkerOracle(env, "cron").catch((err) => console.error(`worker oracle (cron) failed: ${err instanceof Error ? err.stack : err}`));
}

/** After a gasless registration: the new clip is Pending until the oracle sees its claim code. */
export async function oracleAfterRegister(env: Env): Promise<void> {
  const mode = oracleMode(env);
  if (mode === "github") return triggerOracle(env, "register");
  if (mode === "worker") await runWorkerOracle(env, "register").catch((err) => console.error(`worker oracle (register) failed: ${err instanceof Error ? err.stack : err}`));
}

// ─────────────────────────── worker mode ───────────────────────────

/** MockKeystoneForwarder: the one call we send and the event that says whether the vault accepted the report. */
const forwarderAbi = [
  {
    type: "function",
    name: "report",
    stateMutability: "nonpayable",
    inputs: [
      { name: "receiver", type: "address" },
      { name: "rawReport", type: "bytes" },
      { name: "reportContext", type: "bytes" },
      { name: "signatures", type: "bytes[]" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "ReportProcessed",
    anonymous: false,
    inputs: [
      { name: "receiver", type: "address", indexed: true },
      { name: "workflowExecutionId", type: "bytes32", indexed: true },
      { name: "reportId", type: "bytes2", indexed: true },
      { name: "result", type: "bool", indexed: false },
    ],
  },
] as const;

/** Below this every run logs a warning. One report costs ~0.05 MON per clip at 102 gwei. */
const LOW_BALANCE = parseEther("2");
/** CRE's limit too: lastRound, the post-write check and up to 11 pages of the watch list. */
const MAX_PAGES = 11;
const SEND_ATTEMPTS = 3;
const RECEIPT_TRIES = 5;

const stateKey = (env: Env) => `oracle-state:${env.NETWORK}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function readOracleState(env: Env): Promise<OracleState | null> {
  return parseOracleState(await env.RATE.get(stateKey(env), "json").catch(() => null));
}

async function writeOracleState(env: Env, s: OracleState): Promise<void> {
  await env.RATE.put(stateKey(env), JSON.stringify(s)).catch((err) => console.warn(`worker oracle: state write failed (${shortError(err)})`));
}

/** The oracle address, or null (logged) when worker mode can't run at all. */
function oracleAddress(env: Env): Address | null {
  if (!env.ORACLE_ADDRESS || !isAddress(env.ORACLE_ADDRESS, { strict: false })) {
    console.error("worker oracle: ORACLE_ADDRESS is not set to an address");
    return null;
  }
  if (!env.ORACLE_PK || !env.YT_API_KEY_ORACLE) {
    console.error("worker oracle: the ORACLE_PK and YT_API_KEY_ORACLE secrets must both be set");
    return null;
  }
  return getAddress(env.ORACLE_ADDRESS);
}

/** One Worker oracle run. Returns the summary it logged. */
export async function runWorkerOracle(env: Env, trigger: OracleTrigger): Promise<string> {
  const dep = deployment(env);
  const forwarder = addressesFor(env.NETWORK)?.creForwarderMock;
  const address = oracleAddress(env);
  if (!dep || !forwarder || !address) return "worker oracle: not configured";
  const c = oracleClients(env, address);

  // Everything at one block, like the CRE workflow: two batched requests.
  const block = await c.publicClient.getBlock();
  const blockNumber = block.number;
  const now = Number(block.timestamp);
  const [lastRound, transmitter, watched, balance] = await Promise.all([
    c.publicClient.readContract({ address: dep.vault, abi: campaignVaultAbi, functionName: "lastRound", blockNumber }),
    c.publicClient.readContract({ address: dep.vault, abi: campaignVaultAbi, functionName: "reportTransmitter", blockNumber }),
    c.publicClient.readContract({ address: dep.vault, abi: campaignVaultAbi, functionName: "watchListLength", blockNumber }),
    c.publicClient.getBalance({ address, blockNumber }),
  ]);
  if (!isAddressEqual(transmitter, address)) {
    // The vault would refuse every report (inside the forwarder, so the gas would still be spent).
    const msg = `worker oracle: vault reportTransmitter is ${transmitter}, not ORACLE_ADDRESS ${address}; not sending`;
    console.error(msg);
    return msg;
  }
  if (balance < LOW_BALANCE) console.warn(`worker oracle: oracle wallet ${address} is low on MON (${formatEther(balance)}); top it up`);

  const prev = await readOracleState(env);
  const plan = planOracleRun(prev, lastRound, now, oracleSkipSeconds(env), trigger);
  if (plan.store) await writeOracleState(env, plan.store);
  if (!plan.run) {
    const msg = `worker oracle (${trigger}): skipped, ${plan.why}`;
    console.log(msg);
    return msg;
  }
  const base: OracleState = plan.store ?? prev ?? { round: lastRound.toString(), own: false, seenAt: 0, checkedAt: 0, ranAt: 0 };

  // The watch list, filtered by the vault (flagged clips, closed or empty campaigns dropped), in one multicall.
  const step = BigInt(ORACLE_PAGE);
  const pages = Math.min(MAX_PAGES, Math.ceil(Number(watched) / ORACLE_PAGE));
  const rows =
    pages === 0
      ? []
      : await c.publicClient.multicall({
          allowFailure: false,
          blockNumber,
          contracts: Array.from({ length: pages }, (_, i) => ({
            address: dep.vault,
            abi: campaignVaultAbi,
            functionName: "activeClips",
            args: [BigInt(i) * step, step],
          })) as never,
        });
  const clips: ActiveClip[] = (rows as readonly (readonly ActiveClip[])[])
    .flat()
    .slice(0, ORACLE_MAX_CLIPS)
    .map((r) => ({ ...r, status: Number(r.status) }));
  const hasPending = clips.some((cl) => cl.status === 1);

  /** Ends the run: stores the state when something the keeper or the next run needs changed. */
  const finish = async (msg: string, next: Partial<OracleState>, level: "log" | "warn" | "error" = "log") => {
    const s: OracleState = { ...base, ranAt: now, ...next };
    const changed = !prev || s.round !== prev.round || s.own !== prev.own || s.seenAt !== prev.seenAt;
    // checkedAt and ranAt only matter while a clip is Pending (keeper guard, register debounce): skip idle writes.
    if (changed || hasPending) await writeOracleState(env, s);
    const line = `worker oracle (${trigger}) ${msg} · oracle ${formatEther(balance)} MON`;
    console[level](line);
    return line;
  };

  if (clips.length === 0) return finish(`round ${lastRound}: no active clips`, { checkedAt: now });

  const items: YtItem[] = [];
  for (const ids of chunk(
    clips.map((cl) => cl.videoId),
    50,
  )) {
    const res = await fetch(videosUrl(ids, env.YT_API_KEY_ORACLE!));
    // A failed batch fails the run (the next one retries) rather than marking its clips unavailable.
    if (!res.ok) return finish(`YouTube videos.list failed: HTTP ${res.status}; nothing sent`, {}, "error");
    items.push(...(((await res.json()) as { items?: YtItem[] }).items ?? []));
  }
  const updates = prioritize(buildUpdates(clips, items), clips, maxEntries(ORACLE_GAS));
  if (updates.length === 0) return finish(`round ${lastRound}: ${clips.length} clips, no changes`, { checkedAt: now });

  const round = lastRound + 1n;
  const report = encodeReport(round, updates);
  const gas = gasLimitFor(updates.length, ORACLE_GAS);
  const detail = updates.map((u) => `${u.clipId}:${u.views}v/${u.likes}l/f${u.flags}`).join(" ");

  let hash: Hex | null = null;
  for (let attempt = 1; attempt <= SEND_ATTEMPTS && !hash; attempt++) {
    // A fresh execution id per attempt: the forwarder refuses one it has already processed.
    const executionId = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const data = encodeFunctionData({
      abi: forwarderAbi,
      functionName: "report",
      args: [dep.vault, forwarderRawReport(executionId, now, report), "0x", []],
    });
    try {
      const { nonce, ...fees } = await nonceAndFees(c);
      hash = await signAndSend(c, { to: forwarder, data, gas, nonce, ...fees });
    } catch (err) {
      // Most likely a nonce clash with the other runner (Monad: -32602). If it already sent this round, stop.
      console.warn(`worker oracle: send attempt ${attempt}/${SEND_ATTEMPTS} failed: ${shortError(err)}`);
      const now2 = await c.publicClient.readContract({ address: dep.vault, abi: campaignVaultAbi, functionName: "lastRound" }).catch(() => lastRound);
      if (now2 >= round) {
        return finish(`round ${round}: another runner sent it first; nothing sent`, { round: now2.toString(), own: false, seenAt: now }, "warn");
      }
      if (attempt < SEND_ATTEMPTS) await sleep(500 + Math.floor(Math.random() * 1000));
    }
  }
  if (!hash) return finish(`round ${round}: could not send the report (${updates.length} entries)`, {}, "error");

  // Confirm: the receipt and lastRound, read together (one batched request per try; Monad blocks are ~0.4 s).
  let receipt = null;
  let after = lastRound;
  for (let i = 0; i < RECEIPT_TRIES && !receipt; i++) {
    await sleep(1_500);
    [receipt, after] = await Promise.all([
      c.publicClient.getTransactionReceipt({ hash }).catch(() => null),
      c.publicClient.readContract({ address: dep.vault, abi: campaignVaultAbi, functionName: "lastRound" }).catch(() => after),
    ]);
  }
  if (!receipt) {
    // Unknown: the next run reads lastRound and finds out.
    return finish(`round ${round}: tx ${hash} has no receipt yet; check it (gas ${gas}, ${updates.length} entries)`, {}, "error");
  }
  const accepted =
    receipt.status === "success" &&
    parseEventLogs({ abi: forwarderAbi, eventName: "ReportProcessed", logs: receipt.logs }).some(
      (l) => isAddressEqual(l.address, forwarder) && isAddressEqual(l.args.receiver, dep.vault) && l.args.result,
    );
  const outcome = reportOutcome(round, after, accepted);
  if (outcome === "applied") {
    return finish(`round ${round} applied: ${updates.length} entries [${detail}] gas ${gas} tx ${hash}`, {
      round: after.toString(),
      own: after === round,
      seenAt: now,
      checkedAt: now,
    });
  }
  if (outcome === "lost-race") {
    return finish(`round ${round}: another runner sent it first; our tx ${hash} was refused (gas spent)`, { round: after.toString(), own: false, seenAt: now }, "warn");
  }
  return finish(
    `round ${round} NOT applied: tx ${hash} ${receipt.status}, vault ${accepted ? "accepted" : "refused"}, lastRound ${after}; often out of gas (gas ${gas}, ${updates.length} entries)`,
    {},
    "error",
  );
}
