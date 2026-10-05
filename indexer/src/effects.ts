/**
 * CampaignCreated doesn't carry maxViewsPerReport or minLikeBps, so read them once from the vault.
 * Cached by Envio, rate-limited, and skipped when CLIPRAIL_INDEXER_OFFLINE=1 (unit tests) or the read fails:
 * the campaign is still indexed, with 0 for both rules.
 */
import { createEffect, S } from "envio";
import { createPublicClient, http, parseAbi } from "viem";

const RPC: Record<number, string> = {
  10143: process.env.ENVIO_RPC_URL_10143 || "https://testnet-rpc.monad.xyz",
  143: process.env.ENVIO_RPC_URL_143 || "https://rpc.monad.xyz",
};

const abi = parseAbi([
  "struct CampaignParams { address token; uint128 budget; uint128 cpm; uint128 maxPerClip; uint64 maxViewsPerReport; uint16 minLikeBps; uint32 holdSecs; uint64 startsAt; uint64 endsAt; uint8 minTier; bytes32 briefHash; }",
  "struct Campaign { CampaignParams params; address brand; uint8 status; uint128 reserved; uint128 paid; }",
  "function getCampaign(uint256 campaignId) view returns (Campaign)",
]);

export const campaignRules = createEffect(
  {
    name: "campaignRules",
    input: S.schema({ vault: S.string, campaignId: S.string, blockNumber: S.number }),
    output: S.nullable(S.schema({ maxViewsPerReport: S.bigint, minLikeBps: S.number })),
    rateLimit: { calls: 10, per: "second" },
    cache: true,
    crossChain: false,
  },
  async ({ input, context }) => {
    if (process.env.CLIPRAIL_INDEXER_OFFLINE === "1") return null;
    const url = RPC[context.chain.id];
    if (!url) return null;
    try {
      const client = createPublicClient({ transport: http(url) });
      const c = await client.readContract({
        address: input.vault as `0x${string}`,
        abi,
        functionName: "getCampaign",
        args: [BigInt(input.campaignId)],
        blockNumber: BigInt(input.blockNumber),
      });
      return { maxViewsPerReport: c.params.maxViewsPerReport, minLikeBps: c.params.minLikeBps };
    } catch (e) {
      context.log.warn(`getCampaign(${input.campaignId}) failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  },
);
