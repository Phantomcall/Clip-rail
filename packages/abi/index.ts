import addresses from "./addresses.json";

export type ChainId = "10143" | "143";
export type Network = "testnet" | "mainnet";

export const CHAIN_IDS: Record<Network, ChainId> = { testnet: "10143", mainnet: "143" };

/** Contract and token addresses per chain. `vault`/`reputation` are null until Isaac deploys (H4 / H9). */
export const ADDRESSES = addresses as Record<ChainId, Record<string, `0x${string}` | null>>;

export function addressesFor(network: Network) {
  return ADDRESSES[CHAIN_IDS[network]];
}

// ABIs generated from contracts/ by contracts/scripts/export-abi.sh (I-0.5, I-1.7).
export { campaignVaultAbi, campaignVaultLensAbi, creatorReputationAbi, mockUsdcAbi } from "./abis";
