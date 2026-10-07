# packages/abi

ABIs exported from `contracts/` and `addresses.json` per chain id (10143 testnet, 143 mainnet). Owner: Isaac.

| File | Use |
|---|---|
| `abis.ts` | `campaignVaultAbi`, `campaignVaultLensAbi`, `creatorReputationAbi`, `mockUsdcAbi` as `const`, for viem (`import { campaignVaultAbi } from "@cliprail/abi"`) |
| `CampaignVault.json`, `CampaignVaultLens.json`, `CreatorReputation.json`, `MockUSDC.json` | Plain ABI JSON for Envio's contract import |
| `addresses.json` | Deployed addresses; `vault` / `reputation` are null until the testnet deploy (H4) |

Regenerate after any contract change: `contracts/scripts/export-abi.sh`. Never edit these files by hand.

`CampaignVaultLens` has the keeper views (`releasableClips`, `expiredFlags`, `expiredPending`, `sweepableClips`) and
`claimCode`. They moved out of the vault to keep it under the 24 KB contract size limit. The lens emits no events.

`ReputationUpdated` is emitted by `CreatorReputation`, not the vault, so the indexer must track both contracts.
