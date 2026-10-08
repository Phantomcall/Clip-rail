import { addressesFor, type Network } from "@cliprail/abi";
import type { Address } from "viem";

export interface Env {
  /** "testnet" or "mainnet" (wrangler.toml vars). */
  NETWORK: Network;
  RPC_URL: string;
  /** Comma-separated allowed browser origins; `*` matches inside one host label. */
  WEB_ORIGINS: string;
  /** Envio GraphQL endpoint, pinged by the keeper to keep it warm. Optional. */
  ENVIO_URL?: string;
  /** The relayer's public address. Reads use it, so the key is only loaded when something is signed. */
  RELAYER_ADDRESS: string;
  /** Secrets (wrangler secret put). */
  RELAYER_PK: string;
  YT_API_KEY_PREVIEW: string;
  /** Daily per-address counters and keeper state. */
  RATE: KVNamespace;
  /** Per-IP limits: relays 5/min, previews and health 30/min. */
  RELAY_LIMIT: RateLimit;
  PREVIEW_LIMIT: RateLimit;
  /** All relays from everyone: 20/min. Caps what spam can cost the relayer. */
  RELAY_GLOBAL_LIMIT: RateLimit;
}

export interface Deployment {
  vault: Address;
  lens: Address;
  reputation: Address;
  usdc: Address;
}

/** Addresses come from packages/abi/addresses.json, the single source of truth. Null until deployed (mainnet). */
export function deployment(env: Env): Deployment | null {
  const a = addressesFor(env.NETWORK);
  if (!a?.vault || !a.lens || !a.reputation || !a.usdc) return null;
  return { vault: a.vault, lens: a.lens, reputation: a.reputation, usdc: a.usdc };
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
