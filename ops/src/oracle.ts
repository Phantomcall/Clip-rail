/**
 * Oracle trigger. The CRE oracle runs in GitHub Actions (`.github/workflows/oracle-runner.yml`), but GitHub starts
 * scheduled runs hours late (every 3–6 h in practice), and a Pending clip is rejected by the keeper after
 * pendingTimeout (10 minutes on testnet). A `workflow_dispatch` starts at once, so this Worker asks for a run:
 *  - from its own cron, every 5 minutes while the vault's watch list has clips;
 *  - right after a gasless registration, so the new clip can activate before its timeout.
 * The workflow's `concurrency` group keeps one run going and one waiting, so extra requests can't pile up, and the
 * oracle itself sends nothing when no clip changed. Off unless the ORACLE_DISPATCH_TOKEN secret is set.
 */
import { campaignVaultAbi } from "@cliprail/abi";
import { clients, shortError } from "./chain";
import { deployment, type Env } from "./env";
import { oracleDispatch } from "./logic";

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
