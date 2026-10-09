/**
 * POST /sandbox/fund {address} (playbook I-6.3, testnet only). Gives a judge's fresh account 0.1 MON and mints it
 * 1,000 MockUSDC, so they can try the brand side. Returns {txHash} (the mint) like the relays, so the web app's
 * postRelay works unchanged.
 *
 * The relayer's testnet MON is limited (faucets), so: fresh accounts only, once per address, 10 per IP and 40 in
 * total per UTC day, and it never dips below a 1 MON reserve that relays and the keeper need.
 */
import { addressesFor, mockUsdcAbi } from "@cliprail/abi";
import { encodeFunctionData, parseEther, type Address, type Hex } from "viem";
import { type Clients, sendWithRetry, shortError, simulationError } from "./chain";
import { type Env, HttpError } from "./env";
import { firstIssue, relayGas, sandboxBody } from "./logic";

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

export async function sandboxFund(env: Env, c: Clients, ip: string, body: unknown, nowMs: number): Promise<Hex> {
  if (env.NETWORK !== "testnet") throw new HttpError(404, "Not found");
  const parsed = sandboxBody.safeParse(body);
  if (!parsed.success) throw new HttpError(400, firstIssue(parsed.error));
  const to = parsed.data.address;
  const mockUsdc = addressesFor("testnet").mockUsdc as Address | null;
  if (!mockUsdc) throw new HttpError(503, "The sandbox token isn't configured.");

  // KV: once per address (30 days), per-IP and total counters per UTC day. Reads only until we know we'll send.
  const addrKey = `sb:addr:${to.toLowerCase()}`;
  const ipKey = `sb:ip:${ip}:${day(nowMs)}`;
  const totalKey = `sb:total:${day(nowMs)}`;
  const [seen, ipUsed, totalUsed] = await Promise.all([env.RATE.get(addrKey), env.RATE.get(ipKey), env.RATE.get(totalKey)]);
  if (seen) throw new HttpError(409, "This account has already been funded.");
  if (Number(ipUsed ?? 0) >= PER_IP_DAILY) throw new HttpError(429, "Daily sandbox limit reached for your network. Try again tomorrow.");
  if (Number(totalUsed ?? 0) >= TOTAL_DAILY) throw new HttpError(429, "The sandbox has handed out today's funds. Try again tomorrow.");

  const [txCount, balance, relayerBalance] = await Promise.all([
    c.publicClient.getTransactionCount({ address: to }),
    c.publicClient.getBalance({ address: to }),
    c.publicClient.getBalance({ address: c.address }),
  ]);
  if (txCount > 0 || balance >= FRESH_MAX_BALANCE) {
    throw new HttpError(409, "The sandbox is for new accounts. This one already has activity or MON.");
  }
  if (relayerBalance < RESERVE + SANDBOX_MON * 2n) {
    console.warn(`sandbox: relayer low (${relayerBalance}); refusing to fund`);
    throw new HttpError(503, "The sandbox is out of test MON right now. Please tell the team.");
  }

  // Simulate and size both before sending either.
  const mintData = encodeFunctionData({ abi: mockUsdcAbi, functionName: "mint", args: [to, SANDBOX_USDC] });
  let mintGas: bigint;
  let sendGas: bigint;
  try {
    const [, mintEstimate, sendEstimate] = await Promise.all([
      c.publicClient.simulateContract({
        address: mockUsdc,
        abi: mockUsdcAbi,
        functionName: "mint",
        args: [to, SANDBOX_USDC],
        account: c.address,
      }),
      c.publicClient.estimateContractGas({
        address: mockUsdc,
        abi: mockUsdcAbi,
        functionName: "mint",
        args: [to, SANDBOX_USDC],
        account: c.address,
      }),
      c.publicClient.estimateGas({ account: c.address, to, value: SANDBOX_MON }),
    ]);
    mintGas = relayGas(mintEstimate);
    sendGas = relayGas(sendEstimate);
  } catch (err) {
    throw simulationError(err);
  }
  // An account with EIP-7702 code could make receiving MON expensive; a fresh Mera account costs 21k.
  if (mintGas > MINT_GAS_CAP || sendGas > SEND_GAS_CAP) throw new HttpError(400, "This account can't be funded by the sandbox.");

  // Claim the address before sending, so a double click can't fund it twice.
  await env.RATE.put(addrKey, "1", { expirationTtl: 30 * 86_400 });

  // MON first, and confirmed (Monad's reserve balance rule, below); then the mint, which sends no value.
  try {
    await sendMonUnderReserve(c, relayerBalance, { to, value: SANDBOX_MON, gas: sendGas });
  } catch (err) {
    // Nothing arrived: let the judge try again instead of locking them out for 30 days.
    await env.RATE.delete(addrKey).catch(() => {});
    throw err instanceof HttpError ? err : new HttpError(502, "Funding failed. Try again in a minute.");
  }
  let mintHash: Hex;
  try {
    mintHash = await sendWithRetry(c, { to: mockUsdc, data: mintData, gas: mintGas });
  } catch {
    // The account now holds MON, so it no longer counts as fresh: say so instead of inviting a retry.
    console.error(`sandbox: sent MON to ${to} but the mint failed`);
    throw new HttpError(502, "We sent your test MON but couldn't mint test USDC. Please tell the team.");
  }

  await Promise.all([
    env.RATE.put(ipKey, String(Number(ipUsed ?? 0) + 1), { expirationTtl: 2 * 86_400 }),
    env.RATE.put(totalKey, String(Number(totalUsed ?? 0) + 1), { expirationTtl: 2 * 86_400 }),
  ]).catch((err) => console.warn(`sandbox: counter write failed (${shortError(err)})`));
  console.log(`sandbox: funded ${to} (mint ${mintHash})`);
  return mintHash;
}

/**
 * Monad's reserve balance (docs.monad.xyz/developer-essentials/reserve-balance): a transaction that sends MON as
 * value reverts if it leaves the sender below 10 MON, unless it is the sender's first transaction in the last 3
 * blocks (the "emptying" exception). The relayer usually holds less than 10 MON, so the transfer must go out with no
 * other relayer transaction in flight. Gas-only transactions (relays, keeper, the mint) are unaffected.
 * Waiting costs no CPU, only wall time.
 */
const USER_RESERVE = parseEther("10");
const RESERVE_LAG_BLOCKS = 3n;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendMonUnderReserve(
  c: Clients,
  relayerBalance: bigint,
  tx: { to: Address; value: bigint; gas: bigint },
): Promise<void> {
  const aboveReserve = relayerBalance >= USER_RESERVE + tx.value + parseEther("0.05");
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!aboveReserve) await waitForNoInflight(c);
    const hash = await sendWithRetry(c, { ...tx, data: "0x" });
    const receipt = await waitForReceipt(c, hash);
    if (receipt === "success") return;
    console.warn(`sandbox: MON transfer ${hash} ${receipt} (attempt ${attempt}); reserve-balance rule, retrying`);
    if (aboveReserve) break; // not the reserve rule: don't burn gas retrying
    await sleep(1_500);
  }
  throw new HttpError(503, "The sandbox couldn't send test MON right now. Try again in a minute.");
}

/** No relayer transaction in the last 3 blocks or in the mempool: the next one qualifies as "emptying". */
async function waitForNoInflight(c: Clients): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const block = await c.publicClient.getBlockNumber();
    const [now, before, pending] = await Promise.all([
      c.publicClient.getTransactionCount({ address: c.address, blockNumber: block }),
      c.publicClient.getTransactionCount({ address: c.address, blockNumber: block - RESERVE_LAG_BLOCKS }),
      c.publicClient.getTransactionCount({ address: c.address, blockTag: "pending" }),
    ]);
    if (now === before && pending === now) return;
    await sleep(500);
  }
}

async function waitForReceipt(c: Clients, hash: Hex): Promise<"success" | "reverted" | "missing"> {
  for (let i = 0; i < 10; i++) {
    await sleep(600);
    const receipt = await c.publicClient.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) return receipt.status;
  }
  return "missing";
}
