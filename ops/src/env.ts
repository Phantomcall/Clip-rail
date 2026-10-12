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
  /**
   * Who runs the view oracle (oracle.ts). One switch, so two runners never send the same round with the same key:
   *  - "off" (default, or anything unrecognised): the Worker does nothing for the oracle;
   *  - "worker": the Worker builds and sends reports itself with ORACLE_PK (fallback while CRE deploy access is
   *    pending);
   *  - "github": the Worker starts the CRE oracle workflow in GitHub Actions (needs ORACLE_DISPATCH_TOKEN).
   */
  ORACLE_MODE?: string;
  /** The oracle wallet's public address (the vault's reportTransmitter), checked against ORACLE_PK. */
  ORACLE_ADDRESS?: string;
  /** Secret, worker mode only: the oracle wallet's key. */
  ORACLE_PK?: string;
  /** Secret, worker mode only: the oracle's own YouTube key, so preview traffic can't spend its quota. */
  YT_API_KEY_ORACLE?: string;
  /** Worker mode: skip a run if another runner moved lastRound less than this many seconds ago (default 240). */
  ORACLE_SKIP_SECONDS?: string;
  /**
   * Optional secret: a GitHub token allowed to start workflows (fine-grained, this repo only, "Actions: read and
   * write"). Used in github mode only (oracle.ts).
   */
  ORACLE_DISPATCH_TOKEN?: string;
  /** The repo and workflow file the oracle runs in, e.g. "Phantomcall/Clip-rail" and "oracle-runner.yml". */
  ORACLE_REPO?: string;
  ORACLE_WORKFLOW?: string;
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
