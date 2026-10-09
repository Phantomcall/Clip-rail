/**
 * viem clients for the relayer wallet (it is also the keeper). The relayer only ever pays gas: it never holds or
 * approves user funds, and every call is simulated before it is sent.
 */
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  getAddress,
  http,
  isAddressEqual,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { monad, monadTestnet } from "viem/chains";
import { HttpError, type Env } from "./env";
import { revertMessage } from "./logic";

export function chainFor(env: Env) {
  return env.NETWORK === "mainnet" ? monad : monadTestnet;
}

// CPU (Workers free plan: 10 ms per request). Loading the key builds noble's secp256k1 table, the costliest thing
// a cold isolate does: ~70 ms with the default 8-bit window, ~14 ms with 4 (a warm signature then takes ~3 ms
// instead of ~2). viem uses this same noble instance (pinned to its version in package.json).
secp256k1.ProjectivePoint.BASE._setWindowSize(4);

// The key is only loaded when something is signed, once per isolate. Reads use RELAYER_ADDRESS.
let cachedSigner: { pk: string; account: PrivateKeyAccount } | null = null;
function signerFor(env: Env): PrivateKeyAccount {
  if (cachedSigner?.pk !== env.RELAYER_PK) {
    const pk = env.RELAYER_PK;
    const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
    if (!isAddressEqual(account.address, env.RELAYER_ADDRESS as Address)) {
      // A key for a different wallet would spend from (and nonce-race against) the wrong account.
      throw new Error(`RELAYER_PK is for ${account.address}, not RELAYER_ADDRESS ${env.RELAYER_ADDRESS}`);
    }
    cachedSigner = { pk, account };
  }
  return cachedSigner.account;
}

export function clients(env: Env) {
  const chain = chainFor(env);
  // JSON-RPC batching: reads awaited together go out as one HTTP request (free plan: 50 subrequests per run).
  const transport = http(env.RPC_URL, { batch: true, retryCount: 1 });
  const address = getAddress(env.RELAYER_ADDRESS);
  const publicClient = createPublicClient({ chain, transport });
  return { chain, address, publicClient, signer: () => signerFor(env) };
}

export type Clients = ReturnType<typeof clients>;

/** Turns a simulation failure into a 400 the user can read; anything else is a 502 (RPC trouble). */
export function simulationError(err: unknown): HttpError {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      return new HttpError(400, revertMessage(reverted.data?.errorName, reverted.reason));
    }
  }
  console.error("simulation failed", shortError(err));
  return new HttpError(502, "Couldn't check the transaction with the network. Try again.");
}

/** First line of an error plus the RPC's own detail, for logs. */
export function shortError(err: unknown): string {
  if (err instanceof BaseError) return `${err.shortMessage}${err.details ? ` (${err.details})` : ""}`;
  return err instanceof Error ? err.message.split("\n")[0] : String(err);
}

export interface Fees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/** Pending nonce and current fees, in one batched request. */
export async function nonceAndFees(c: Clients): Promise<{ nonce: number } & Fees> {
  const [nonce, fees] = await Promise.all([
    c.publicClient.getTransactionCount({ address: c.address, blockTag: "pending" }),
    c.publicClient.estimateFeesPerGas(),
  ]);
  return { nonce, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };
}

/** Signs locally and sends the raw transaction: exactly one RPC call, and every field is ours. */
export async function signAndSend(
  c: Clients,
  tx: { to: Address; data: Hex; gas: bigint; nonce: number; value?: bigint } & Fees,
): Promise<Hex> {
  const serializedTransaction = await c.signer().signTransaction({ ...tx, chainId: c.chain.id, type: "eip1559" });
  return c.publicClient.sendRawTransaction({ serializedTransaction });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends one relayed call. Relays and the keeper share the wallet, so two sends can pick the same pending nonce;
 * Monad then rejects the second with "Missing or invalid parameters" (-32602), not "nonce too low". So any send
 * error is retried with a fresh nonce after a short random wait (by then the other transaction has usually landed).
 * Re-sending the same signed transaction is harmless: Monad returns its hash again.
 */
export async function sendWithRetry(
  c: Clients,
  tx: { to: Address; data: Hex; gas: bigint; value?: bigint },
): Promise<Hex> {
  const attempts = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      const { nonce, ...fees } = await nonceAndFees(c);
      return await signAndSend(c, { ...tx, ...fees, nonce });
    } catch (err) {
      console.warn(`send attempt ${attempt}/${attempts} failed: ${shortError(err)}`);
      if (attempt >= attempts) {
        throw new HttpError(502, "The relayer couldn't send the transaction. Try again in a minute.");
      }
      await sleep(250 + Math.floor(Math.random() * 750));
    }
  }
}
