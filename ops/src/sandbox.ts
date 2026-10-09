/**
 * POST /sandbox/fund {address} (playbook I-6.3, testnet only). Gives a judge's fresh account 0.1 MON and mints it
 * 1,000 MockUSDC, so they can try the brand side (a campaign costs them ~0.031 MON in gas). Returns {txHash} (the
 * mint) like the relays, so the web app's postRelay works unchanged.
 *
 * The relayer's testnet MON is limited (faucets), so: fresh accounts only, once per address, 10 per IP and 40 in
 * total per UTC day (KV, so soft limits), and it never dips below a 1 MON reserve that relays and the keeper need.
 *
 * Free plan: at most ~43 subrequests in the worst case (limit 50). KV: 3 writes per funded account.
 */
import { addressesFor, mockUsdcAbi } from "@cliprail/abi";
import { encodeFunctionData, parseEther, type Address, type Hex } from "viem";
import { type Clients, nonceAndFees, sendWithRetry, shortError, signAndSend, simulationError } from "./chain";
import { type Env, HttpError } from "./env";
import { firstIssue, needsEmptyingSlot, noInflight, relayGas, sandboxBody } from "./logic";

export const SANDBOX_MON = parseEther("0.1");
export const SANDBOX_USDC = 1_000n * 1_000_000n; // 1,000 MockUSDC (6 decimals)
/** Relays and the keeper keep at least this much. */
const RESERVE = parseEther("1");
/** "Fresh" means the account has never sent a transaction and holds less than this. */
const FRESH_MAX_BALANCE = parseEther("0.05");
const PER_IP_DAILY = 10;
const TOTAL_DAILY = 40;
const MINT_GAS_CAP = 150_000n;
const SEND_GAS_CAP = 100_000n;

const day = (nowMs: number) => new Date(nowMs).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sandboxFund(env: Env, c: Clients, ip: string, body: unknown, nowMs: number): Promise<Hex> {
  if (env.NETWORK !== "testnet") throw new HttpError(404, "Not found");
  const parsed = sandboxBody.safeParse(body);
  if (!parsed.success) throw new HttpError(400, firstIssue(parsed.error));
  const to = parsed.data.address;
  const mockUsdc = addressesFor("testnet").mockUsdc as Address | null;
  if (!mockUsdc) throw new HttpError(503, "The sandbox token isn't configured.");
  const mint = { to: mockUsdc, data: encodeFunctionData({ abi: mockUsdcAbi, functionName: "mint", args: [to, SANDBOX_USDC] }) };

  // KV: once per address (30 days), per-IP and total counters per UTC day. Reads only until we know we'll send.
  const addrKey = `sb:addr:${to.toLowerCase()}`;
  const ipKey = `sb:ip:${ip}:${day(nowMs)}`;
  const totalKey = `sb:total:${day(nowMs)}`;
  const [seen, ipUsed, totalUsed] = await Promise.all([env.RATE.get(addrKey), env.RATE.get(ipKey), env.RATE.get(totalKey)]);

  const [txCount, balance, usdcBalance, relayerBalance] = await Promise.all([
    c.publicClient.getTransactionCount({ address: to }),
    c.publicClient.getBalance({ address: to }),
    c.publicClient.readContract({ address: mockUsdc, abi: mockUsdcAbi, functionName: "balanceOf", args: [to] }),
    c.publicClient.getBalance({ address: c.address }),
  ]);

  if (seen) {
    // Funded before. If the MON arrived but the mint didn't, finish the job instead of locking them out.
    if (txCount === 0 && balance > 0n && usdcBalance === 0n) return mintOnly(c, mint, to);
    throw new HttpError(409, "This account has already been funded.");
  }
  if (Number(ipUsed ?? 0) >= PER_IP_DAILY) throw new HttpError(429, "Daily sandbox limit reached for your network. Try again tomorrow.");
  if (Number(totalUsed ?? 0) >= TOTAL_DAILY) throw new HttpError(429, "The sandbox has handed out today's funds. Try again tomorrow.");
  if (txCount > 0 || balance >= FRESH_MAX_BALANCE) {
    throw new HttpError(409, "The sandbox is for new accounts. This one already has activity or MON.");
  }
  if (relayerBalance < RESERVE + SANDBOX_MON * 2n) {
    console.warn(`sandbox: relayer low (${relayerBalance}); refusing to fund`);
    throw new HttpError(503, "The sandbox is out of test MON right now. Please tell the team.");
  }

  // Simulate and size both before sending either.
  let mintGas: bigint;
  let sendGas: bigint;
  try {
    const call = { address: mockUsdc, abi: mockUsdcAbi, functionName: "mint", args: [to, SANDBOX_USDC], account: c.address } as const;
    const [, mintEstimate, sendEstimate] = await Promise.all([
      c.publicClient.simulateContract(call),
      c.publicClient.estimateContractGas(call),
      c.publicClient.estimateGas({ account: c.address, to, value: SANDBOX_MON }),
    ]);
    mintGas = relayGas(mintEstimate);
    sendGas = relayGas(sendEstimate);
  } catch (err) {
    throw simulationError(err);
  }
  // An account with EIP-7702 code could make receiving MON expensive; a fresh passkey account costs 21k.
  if (mintGas > MINT_GAS_CAP || sendGas > SEND_GAS_CAP) throw new HttpError(400, "This account can't be funded by the sandbox.");

  // Claim the address before sending, so a double click can't fund it twice.
  try {
    await env.RATE.put(addrKey, "1", { expirationTtl: 30 * 86_400 });
  } catch (err) {
    console.error(`sandbox: KV write failed (${shortError(err)})`); // e.g. the free plan's daily write limit
    throw new HttpError(503, "The sandbox is unavailable right now. Try again later.");
  }

  // MON first, and confirmed (Monad's reserve balance rule); then the mint, which sends no value.
  try {
    await sendMonOnce(c, relayerBalance, { to, value: SANDBOX_MON, gas: sendGas });
  } catch (err) {
    // Nothing was sent: let the judge try again instead of locking them out for 30 days. If the MON may still
    // arrive, keep the claim: pressing again then finishes with the mint (see `seen` above).
    if (!(err instanceof MaybeSent)) await env.RATE.delete(addrKey).catch(() => {});
    throw err instanceof HttpError ? err : new HttpError(502, "Funding failed. Try again in a minute.");
  }
  const mintHash = await mintOnly(c, { ...mint, gas: mintGas }, to);

  await Promise.all([
    env.RATE.put(ipKey, String(Number(ipUsed ?? 0) + 1), { expirationTtl: 2 * 86_400 }),
    env.RATE.put(totalKey, String(Number(totalUsed ?? 0) + 1), { expirationTtl: 2 * 86_400 }),
  ]).catch((err) => console.warn(`sandbox: counter write failed (${shortError(err)})`));
  console.log(`sandbox: funded ${to} (mint ${mintHash})`);
  return mintHash;
}

/** The MON transfer was sent but not yet mined: it may still arrive, so it must never be sent again. */
class MaybeSent extends HttpError {
  constructor() {
    super(503, "Your test MON is on its way. Wait a minute, then press the button again.");
  }
}

/** The mint sends no value, so the reserve rule doesn't apply and the normal retrying sender is fine. */
async function mintOnly(c: Clients, mint: { to: Address; data: Hex; gas?: bigint }, to: Address): Promise<Hex> {
  try {
    const gas = mint.gas ?? relayGas(await c.publicClient.estimateGas({ account: c.address, to: mint.to, data: mint.data }));
    if (gas > MINT_GAS_CAP) throw new Error(`mint gas ${gas} above cap`);
    return await sendWithRetry(c, { to: mint.to, data: mint.data, gas }, 2); // 2 attempts keeps us under 50 subrequests
  } catch (err) {
    // The account holds MON now; pressing the button again retries just the mint (see `seen` above).
    console.error(`sandbox: sent MON to ${to} but the mint failed (${shortError(err)})`);
    throw new HttpError(502, "Your test MON arrived but the test USDC didn't. Press the button again in a minute.");
  }
}

/**
 * Sends the MON at most once per attempt and never twice in total. Monad's reserve balance
 * (docs.monad.xyz/developer-essentials/reserve-balance): a transfer that leaves the sender below 10 MON reverts unless
 * it is the sender's first transaction in the last 3 blocks. The relayer usually holds less than 10 MON, so the
 * transfer waits for a moment with no relayer transaction in flight. Waiting costs wall time, not CPU.
 * A receipt that doesn't show up in time counts as "maybe sent", and the MON is never sent again.
 */
async function sendMonOnce(
  c: Clients,
  relayerBalance: bigint,
  tx: { to: Address; value: bigint; gas: bigint },
): Promise<void> {
  const underReserve = needsEmptyingSlot(relayerBalance, tx.value, parseEther("0.05"));
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1 && (await c.publicClient.getBalance({ address: tx.to })) >= tx.value) return; // it did arrive
    if (underReserve && !(await waitForNoInflight(c))) continue;
    let hash: Hex;
    try {
      const { nonce, ...fees } = await nonceAndFees(c);
      hash = await signAndSend(c, { to: tx.to, data: "0x", value: tx.value, gas: tx.gas, nonce, ...fees });
    } catch (err) {
      console.warn(`sandbox: MON send attempt ${attempt} failed (${shortError(err)})`);
      await sleep(800);
      continue; // the balance check above stops a second transfer if this one went out anyway
    }
    const status = await waitForReceipt(c, hash);
    if (status === "success") return;
    if (status === "missing") {
      console.warn(`sandbox: MON transfer ${hash} not mined after 4 s; not resending`);
      throw new MaybeSent();
    }
    console.warn(`sandbox: MON transfer ${hash} reverted (attempt ${attempt}, reserve-balance rule)`);
    if (!underReserve) break; // not the reserve rule: don't burn gas retrying
    await sleep(1_200);
  }
  throw new HttpError(503, "The sandbox couldn't send test MON right now. Try again in a minute.");
}

/** Waits (up to ~2 s) until the relayer has no transaction in the last 3 blocks or in the mempool. */
async function waitForNoInflight(c: Clients): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    const block = await c.publicClient.getBlockNumber();
    const [now, before, pending] = await Promise.all([
      c.publicClient.getTransactionCount({ address: c.address, blockNumber: block }),
      c.publicClient.getTransactionCount({ address: c.address, blockNumber: block - 3n }),
      c.publicClient.getTransactionCount({ address: c.address, blockTag: "pending" }),
    ]);
    if (noInflight(now, before, pending)) return true;
    await sleep(500);
  }
  return false;
}

async function waitForReceipt(c: Clients, hash: Hex): Promise<"success" | "reverted" | "missing"> {
  for (let i = 0; i < 6; i++) {
    await sleep(700);
    const receipt = await c.publicClient.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) return receipt.status;
  }
  return "missing";
}
