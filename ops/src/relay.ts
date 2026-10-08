/**
 * Gasless writes for clippers (playbook I-3.2). Each request: validate → check the signature, nonce and deadline
 * off chain → per-address daily limit → simulate → send with a tight gas limit → {txHash}.
 * The per-IP limit (5 per minute) is applied by the router before any of this.
 */
import { campaignVaultAbi, creatorReputationAbi } from "@cliprail/abi";
import { claimCode, cliprailDomain, registerClipTypes, setPayoutTypes, transferWithAuthorizationTypes } from "@cliprail/shared";
import type { z } from "zod";
import { encodeFunctionData, parseSignature, size, type Abi, type Address, type Hex } from "viem";
import { type Clients, sendWithRetry, simulationError } from "./chain";
import { type Deployment, type Env, HttpError } from "./env";
import {
  dailyKey,
  deadlineOk,
  firstIssue,
  isPublic,
  toPreview,
  PER_ADDRESS_DAILY_LIMIT,
  payoutBody,
  RELAY_GAS_CAP,
  registerBody,
  relayGas,
  transferBody,
} from "./logic";
import { fetchVideo } from "./preview";

/** Circle FiatToken v2.2 (EIP-3009): the v,r,s form for EOAs and the bytes form for smart-contract wallets. */
const usdcAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export interface RelayContext {
  env: Env;
  dep: Deployment;
  c: Clients;
  ctx: ExecutionContext;
  nowMs: number;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, firstIssue(r.error));
  return r.data;
}

/** 20 relays per address per UTC day, counted only when a transaction is actually sent. */
async function checkDaily(rc: RelayContext, route: string, who: Address): Promise<() => Promise<void>> {
  const key = dailyKey(rc.env.NETWORK, route, who, rc.nowMs);
  const used = Number((await rc.env.RATE.get(key)) ?? 0);
  if (used >= PER_ADDRESS_DAILY_LIMIT) throw new HttpError(429, "Daily limit reached for this account. Try again tomorrow.");
  return () => rc.env.RATE.put(key, String(used + 1), { expirationTtl: 2 * 86_400 });
}

async function checkVaultNonce(rc: RelayContext, clipper: Address, nonce: bigint) {
  const onChain = await rc.c.publicClient.readContract({
    address: rc.dep.vault,
    abi: campaignVaultAbi,
    functionName: "nonces",
    args: [clipper],
  });
  if (onChain !== nonce) throw new HttpError(400, "The signature is out of date. Try again.");
}

/**
 * Payout-address changes and send-outs have no on-chain precondition, so fresh throwaway addresses could drain the
 * relayer with them. Only accounts the chain already knows as Cliprail clippers get them for free: they have
 * registered through the relayer (vault nonce > 0) or have been paid or rejected (reputation firstSeen > 0).
 */
async function requireKnownClipper(rc: RelayContext, who: Address, refusal: string): Promise<void> {
  const [nonce, stats] = await Promise.all([
    rc.c.publicClient.readContract({ address: rc.dep.vault, abi: campaignVaultAbi, functionName: "nonces", args: [who] }),
    rc.c.publicClient.readContract({
      address: rc.dep.reputation,
      abi: creatorReputationAbi,
      functionName: "stats",
      args: [who],
    }),
  ]);
  if (nonce === 0n && stats.firstSeen === 0n) throw new HttpError(403, refusal);
}

/** simulate → estimate × 1.15 (refused above the cap) → send. */
async function simulateAndSend(
  rc: RelayContext,
  call: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
  cap: bigint,
): Promise<Hex> {
  const { publicClient, address: account } = rc.c;
  let estimate: bigint;
  try {
    // Awaited together, so they go out as one batched request.
    [, estimate] = await Promise.all([
      publicClient.simulateContract({ ...call, account } as never),
      publicClient.estimateContractGas({ ...call, account } as never),
    ]);
  } catch (err) {
    throw simulationError(err);
  }
  const gas = relayGas(estimate);
  if (gas > cap) {
    // A wallet whose code burns gas (an EIP-7702 delegate, audit V1-11) would make us pay for it.
    console.warn(`refused: gas ${gas} above cap ${cap} for ${call.functionName}`);
    throw new HttpError(400, "This account's signature check costs too much gas to relay.");
  }
  const data = encodeFunctionData(call as never);
  return sendWithRetry(rc.c, { to: call.address, data, gas });
}

export async function relayRegister(rc: RelayContext, body: unknown): Promise<Hex> {
  const b = parse(registerBody, body);
  if (!deadlineOk(b.deadline, rc.nowMs / 1000)) throw new HttpError(400, "The signature expired. Try again.");

  const domain = cliprailDomain(rc.c.chain.id, rc.dep.vault);
  const message = { campaignId: b.campaignId, videoId: b.videoId, clipper: b.clipper, nonce: b.nonce, deadline: b.deadline };
  const [valid, , campaign] = await Promise.all([
    rc.c.publicClient.verifyTypedData({
      address: b.clipper,
      domain,
      types: registerClipTypes,
      primaryType: "RegisterClip",
      message,
      signature: b.sig,
    }),
    checkVaultNonce(rc, b.clipper, b.nonce),
    rc.c.publicClient.readContract({
      address: rc.dep.vault,
      abi: campaignVaultAbi,
      functionName: "getCampaign",
      args: [b.campaignId],
    }),
  ]);
  if (!valid) throw new HttpError(400, "The signature doesn't match this account.");

  const count = await checkDaily(rc, "register", b.clipper);

  // The same three checks the clip page shows before it lets anyone sign. Without them, anyone calling the relayer
  // directly could register other people's Shorts for free; each would sit Pending (and be reported by the oracle)
  // until it times out.
  const code = claimCode(b.campaignId, b.clipper);
  let video = await fetchVideo(rc.env, b.videoId, rc.ctx);
  // The cached copy can be up to 60 s old: look again before refusing someone who has just added the code.
  if (video && !toPreview(video, code).codeFound) video = await fetchVideo(rc.env, b.videoId, rc.ctx, { fresh: true });
  if (!video) throw new HttpError(400, "We couldn't find that video on YouTube.");
  const preview = toPreview(video, code);
  if (!isPublic(video)) throw new HttpError(400, "That video isn't public yet. Make it public, then try again.");
  if (!preview.codeFound) throw new HttpError(400, `Add your claim code ${code} to the Short's description, then try again.`);
  if (preview.publishedAt < Number(campaign.params.startsAt)) {
    throw new HttpError(400, "That Short was posted before this campaign started, so it can't earn from it.");
  }

  const hash = await simulateAndSend(
    rc,
    {
      address: rc.dep.vault,
      abi: campaignVaultAbi,
      functionName: "registerClipWithSig",
      args: [message, b.sig],
    },
    RELAY_GAS_CAP.register,
  );
  rc.ctx.waitUntil(count());
  return hash;
}

export async function relayPayoutAddress(rc: RelayContext, body: unknown): Promise<Hex> {
  const b = parse(payoutBody, body);
  if (!deadlineOk(b.deadline, rc.nowMs / 1000)) throw new HttpError(400, "The signature expired. Try again.");

  const message = { clipper: b.clipper, payout: b.payout, nonce: b.nonce, deadline: b.deadline };
  const [valid] = await Promise.all([
    rc.c.publicClient.verifyTypedData({
      address: b.clipper,
      domain: cliprailDomain(rc.c.chain.id, rc.dep.vault),
      types: setPayoutTypes,
      primaryType: "SetPayout",
      message,
      signature: b.sig,
    }),
    checkVaultNonce(rc, b.clipper, b.nonce),
    requireKnownClipper(rc, b.clipper, "Register a clip first. Gasless payout changes are for Cliprail clippers."),
  ]);
  if (!valid) throw new HttpError(400, "The signature doesn't match this account.");

  const count = await checkDaily(rc, "payout", b.clipper);
  const hash = await simulateAndSend(
    rc,
    {
      address: rc.dep.vault,
      abi: campaignVaultAbi,
      functionName: "setPayoutAddressWithSig",
      args: [message, b.sig],
    },
    RELAY_GAS_CAP.payout,
  );
  rc.ctx.waitUntil(count());
  return hash;
}

/** Gasless USDC send-out (EIP-3009). Only the network's USDC; the relayer never touches the funds. */
export async function relayTransfer(rc: RelayContext, body: unknown): Promise<Hex> {
  const b = parse(transferBody, body);
  const now = rc.nowMs / 1000;
  if (b.value === 0n) throw new HttpError(400, "Amount must be more than 0.");
  if (b.to === "0x0000000000000000000000000000000000000000" || b.to === b.from) {
    throw new HttpError(400, "Choose a different recipient.");
  }
  if (b.validAfter > BigInt(Math.floor(now))) throw new HttpError(400, "This transfer isn't valid yet.");
  if (!deadlineOk(b.validBefore, now)) throw new HttpError(400, "The signature expired. Try again.");

  const usdc = rc.dep.usdc;
  const [name, version] = await Promise.all([
    rc.c.publicClient.readContract({ address: usdc, abi: usdcAbi, functionName: "name" }),
    rc.c.publicClient.readContract({ address: usdc, abi: usdcAbi, functionName: "version" }),
    requireKnownClipper(rc, b.from, "Gasless send-out is for Cliprail clippers. Register a clip first, or send from a wallet that holds MON."),
  ]);
  const message = {
    from: b.from,
    to: b.to,
    value: b.value,
    validAfter: b.validAfter,
    validBefore: b.validBefore,
    nonce: b.nonce,
  };
  const valid = await rc.c.publicClient.verifyTypedData({
    address: b.from,
    domain: { name, version, chainId: rc.c.chain.id, verifyingContract: usdc },
    types: transferWithAuthorizationTypes,
    primaryType: "TransferWithAuthorization",
    message,
    signature: b.sig,
  });
  if (!valid) throw new HttpError(400, "The signature doesn't match this account.");

  const count = await checkDaily(rc, "transfer", b.from);
  const base = [b.from, b.to, b.value, b.validAfter, b.validBefore, b.nonce] as const;
  let args: readonly unknown[];
  if (size(b.sig) === 65) {
    const { v, r, s, yParity } = parseSignature(b.sig);
    args = [...base, Number(v ?? BigInt(yParity + 27)), r, s];
  } else {
    args = [...base, b.sig];
  }
  const hash = await simulateAndSend(
    rc,
    { address: usdc, abi: usdcAbi, functionName: "transferWithAuthorization", args },
    RELAY_GAS_CAP.transfer,
  );
  rc.ctx.waitUntil(count());
  return hash;
}
