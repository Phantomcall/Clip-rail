"use client";

/**
 * Transaction hooks (playbook D-3.3, D-5.1, D-5.2). Each returns { run, status, txHash, error, reset }.
 *
 * Real: useCreateCampaign, useRegisterClip, useSendOut, useSetPayout (D-3.3).
 * Real (D-5.1): useFlag, useResolve, useTopUp, useClose. Still mock: useSandboxFund (needs the ops /sandbox/fund, D-6.3).
 * Every hook falls back to the mock under NEXT_PUBLIC_MOCK_AUTH so screen work needs no chain.
 */
import { useCallback, useRef, useState } from "react";
import { encodeFunctionData, keccak256, toBytes, toHex, type Hex, type LocalAccount } from "viem";
import { cliprailDomain, registerClipTypes, setPayoutTypes, transferWithAuthorizationTypes } from "@cliprail/shared";
import { erc20Abi, vaultAbi } from "@/lib/abi";
import { useAuth } from "@/lib/auth";
import { chain, publicClient } from "@/lib/chains";
import { ADDR, NETWORK, USDC } from "@/lib/network";
import { postRelay } from "@/lib/relay";
import { sendTx, txErrorMessage } from "@/lib/tx";
import type { Address } from "@/lib/types";

export type TxStatus = "idle" | "signing" | "pending" | "success" | "error";

export interface CampaignParams {
  token: Address;
  budget: bigint; // token units (USDC: 6 decimals)
  cpm: bigint; // token units per 1,000 views
  maxPerClip: bigint;
  maxViewsPerReport: bigint;
  minLikeBps: number;
  holdSecs: number;
  startsAt: number;
  endsAt: number;
  minTier: 0 | 1 | 2;
  briefHash: `0x${string}`;
}

/** Signed messages expire after 15 minutes. */
const SIG_TTL_SECS = 15 * 60;

interface TxCtx {
  account: LocalAccount;
  address: Address;
  /** Call once the user has signed and the transaction is on its way. */
  pending: () => void;
}

type Exec<A extends unknown[]> = (ctx: TxCtx, ...args: A) => Promise<Hex>;

function fakeHash(): `0x${string}` {
  const hex = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `0x${hex}`;
}

const fakeExec: Exec<unknown[]> = async ({ pending }) => {
  await new Promise((r) => setTimeout(r, 700));
  pending();
  await new Promise((r) => setTimeout(r, 900));
  return fakeHash();
};

function useTx<A extends unknown[]>(exec?: Exec<A>) {
  const { getAccount, address, isMock } = useAuth();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  // the latest failure, readable right after `await run()` (state updates land a render later)
  const lastErr = useRef<string | null>(null);

  const run = useCallback(
    async (...args: A) => {
      setError(null);
      setTxHash(null);
      setStatus("signing");
      try {
        const pending = () => setStatus("pending");
        let hash: Hex;
        if (isMock || !exec) {
          hash = await fakeExec({ pending } as TxCtx, ...args);
        } else {
          if (!address) throw new Error("Sign in first.");
          hash = await exec({ account: await getAccount(), address, pending }, ...args);
        }
        setTxHash(hash);
        setStatus("success");
        return hash;
      } catch (e) {
        lastErr.current = txErrorMessage(e);
        setError(lastErr.current);
        setStatus("error");
        return null;
      }
    },
    [exec, isMock, address, getAccount],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setTxHash(null);
    setError(null);
  }, []);

  /** Why the last run failed, in plain English (or null). */
  const lastError = useCallback(() => lastErr.current, []);

  return { run, status, txHash, error, reset, lastError };
}

function vaultAddress(): Address {
  if (!ADDR.vault) throw new Error(`Cliprail isn't deployed on ${NETWORK} yet.`);
  return ADDR.vault;
}

const deadline = () => BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SECS);

async function waitFor(hash: Hex) {
  const receipt = await publicClient().waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction failed on chain.");
  return hash;
}

async function readNonce(clipper: Address) {
  return publicClient().readContract({ address: vaultAddress(), abi: vaultAbi, functionName: "nonces", args: [clipper] });
}

// ---------- D-3.3 ----------

/** approve (only if the allowance is short) → createCampaign. The brand pays gas in MON. */
const createCampaign: Exec<[CampaignParams]> = async ({ account, address, pending }, p) => {
  const vault = vaultAddress();
  const allowance = await publicClient().readContract({
    address: p.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address, vault],
  });
  pending();
  if (allowance < p.budget) {
    await sendTx(account, {
      to: p.token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, p.budget] }),
    });
  }
  return sendTx(account, {
    to: vault,
    data: encodeFunctionData({
      abi: vaultAbi,
      functionName: "createCampaign",
      args: [{ ...p, startsAt: BigInt(p.startsAt), endsAt: BigInt(p.endsAt) }],
    }),
  });
};

/** read nonce → sign RegisterClip → POST /relay/register → wait. Gasless for the clipper. */
const registerClip: Exec<[campaignId: string, videoId: string]> = async ({ account, address, pending }, campaignId, videoId) => {
  const vault = vaultAddress();
  const message = { campaignId: BigInt(campaignId), videoId, clipper: address, nonce: await readNonce(address), deadline: deadline() };
  const sig = await account.signTypedData({
    domain: cliprailDomain(chain.id, vault),
    types: registerClipTypes,
    primaryType: "RegisterClip",
    message,
  });
  pending();
  const hash = await postRelay("/relay/register", {
    campaignId: message.campaignId.toString(),
    videoId,
    clipper: address,
    nonce: message.nonce.toString(),
    deadline: message.deadline.toString(),
    sig,
  });
  return waitFor(hash);
};

/** sign USDC TransferWithAuthorization (EIP-3009) → POST /relay/transfer. Works from a 0-MON account. */
const sendOut: Exec<[to: Address, amountUnits: bigint]> = async ({ account, address, pending }, to, value) => {
  const client = publicClient();
  const [name, version] = await Promise.all([
    client.readContract({ address: USDC, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address: USDC, abi: erc20Abi, functionName: "version" }),
  ]);
  const message = {
    from: address,
    to,
    value,
    validAfter: 0n,
    validBefore: deadline(),
    nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
  };
  const sig = await account.signTypedData({
    domain: { name, version, chainId: chain.id, verifyingContract: USDC },
    types: transferWithAuthorizationTypes,
    primaryType: "TransferWithAuthorization",
    message,
  });
  pending();
  const hash = await postRelay("/relay/transfer", {
    from: address,
    to,
    value: value.toString(),
    validAfter: "0",
    validBefore: message.validBefore.toString(),
    nonce: message.nonce,
    sig,
  });
  return waitFor(hash);
};

/** sign SetPayout → POST /relay/payout-address. */
const setPayout: Exec<[payout: Address]> = async ({ account, address, pending }, payout) => {
  const vault = vaultAddress();
  const message = { clipper: address, payout, nonce: await readNonce(address), deadline: deadline() };
  const sig = await account.signTypedData({
    domain: cliprailDomain(chain.id, vault),
    types: setPayoutTypes,
    primaryType: "SetPayout",
    message,
  });
  pending();
  const hash = await postRelay("/relay/payout-address", {
    clipper: address,
    payout,
    nonce: message.nonce.toString(),
    deadline: message.deadline.toString(),
    sig,
  });
  return waitFor(hash);
};

export const useCreateCampaign = () => useTx(createCampaign);
export const useRegisterClip = () => useTx(registerClip);
export const useSendOut = () => useTx(sendOut);
export const useSetPayout = () => useTx(setPayout);

// ---------- D-5.1: brand flows (brand pays gas) ----------

/** Dry-run a vault call first so a revert comes back with the contract's own error name, then send it. */
async function vaultWrite(account: LocalAccount, functionName: "flag" | "resolve" | "topUp" | "closeCampaign", args: readonly unknown[]) {
  const vault = vaultAddress();
  await publicClient().simulateContract({ account, address: vault, abi: vaultAbi, functionName, args } as never);
  return sendTx(account, { to: vault, data: encodeFunctionData({ abi: vaultAbi, functionName, args } as never) });
}

/** Flag a clip during its hold. The reason is hashed on chain (keccak256 of the text). */
const flagClip: Exec<[clipId: string, reason: string]> = async ({ account, pending }, clipId, reason) => {
  pending();
  return vaultWrite(account, "flag", [BigInt(clipId), keccak256(toBytes(reason))]);
};

/** Resolve your own flag before its deadline: reject returns the held earnings to the budget. */
const resolveFlag: Exec<[clipId: string, reject: boolean]> = async ({ account, pending }, clipId, reject) => {
  pending();
  return vaultWrite(account, "resolve", [BigInt(clipId), reject]);
};

/** Add budget: approve the campaign's token if needed, then topUp. */
const topUpCampaign: Exec<[campaignId: string, amountUnits: bigint]> = async ({ account, address, pending }, campaignId, amount) => {
  const vault = vaultAddress();
  const c = (await publicClient().readContract({ address: vault, abi: vaultAbi, functionName: "getCampaign", args: [BigInt(campaignId)] })) as {
    params: { token: Address };
  };
  const token = c.params.token;
  const allowance = await publicClient().readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [address, vault] });
  pending();
  if (allowance < amount) {
    await sendTx(account, { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, amount] }) });
  }
  return vaultWrite(account, "topUp", [BigInt(campaignId), amount]);
};

/** Close the campaign: everything not yet earned is refunded to the brand. */
const closeCampaign: Exec<[campaignId: string]> = async ({ account, pending }, campaignId) => {
  pending();
  return vaultWrite(account, "closeCampaign", [BigInt(campaignId)]);
};

export const useFlag = () => useTx(flagClip);
export const useResolve = () => useTx(resolveFlag);
export const useTopUp = () => useTx(topUpCampaign);
export const useClose = () => useTx(closeCampaign);

// ---------- still mock ----------

/** testnet only: POST /sandbox/fund (0.1 MON + 1,000 MockUSDC). */
export const useSandboxFund = () => useTx<[]>();
