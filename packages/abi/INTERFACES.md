# Cliprail interfaces (ABI v1, frozen)

The contract interface everyone codes against, as deployed: tag **`abi-v1`**, testnet addresses in
`addresses.json`. The Solidity source of truth is `contracts/src/interfaces/` (`ICampaignVault.sol`,
`ICampaignVaultLens.sol`, `ICreatorReputation.sol`). The ABIs in this package are generated from it
(`contracts/scripts/export-abi.sh`; CI fails if they drift). **Change only with all three owners agreeing in chat.**

The PRD's §5 was the Day 0 design. Where v1 differs, this file and the code win: see
[Differences from PRD §5](#differences-from-prd-5).

| Contract | Role | Import |
|---|---|---|
| `CampaignVault` | Holds budgets, registers clips, takes oracle reports, pays clippers | `campaignVaultAbi` |
| `CampaignVaultLens` | Read-only keeper to-do lists and `claimCode` (kept out of the vault for the 24 KB size limit) | `campaignVaultLensAbi` |
| `CreatorReputation` | Append-only clipper stats and tiers; only the vault writes | `creatorReputationAbi` |
| `MockUSDC` | Testnet token anyone can mint (6 decimals) | `mockUsdcAbi` |

Units: USDC has 6 decimals ($1 = `1_000_000`). `cpm` = token units per 1,000 views. Times are unix seconds. Basis
points are out of 10,000.

## CampaignVault

### Enums (numbering matters to anything that reads raw values)
| Enum | Values |
|---|---|
| `CampaignStatus` | 0 None · 1 Active · 2 Closed |
| `ClipStatus` | 0 None · 1 Pending · 2 Active · 3 Flagged · 4 Rejected · 5 Ended |
| `RejectReason` (`ClipRejected.reason`) | 0 NoOwnership · 1 BrandRejected · 2 DuplicateVideo |
| `SkipReason` (`ReportEntrySkipped.reason`) | 0 UnknownClip · 1 CampaignClosed · 2 Paused · 3 NotReportable · 4 DuplicateEntry · 5 Unavailable |
| `KeeperList` | 0 Watch (Pending/Active, reported by the oracle) · 1 Pay (unreleased tranches) · 2 Flag (awaiting resolve) |

### Structs
```solidity
struct CampaignParams { address token; uint128 budget; uint128 cpm; uint128 maxPerClip; uint64 maxViewsPerReport;
                        uint16 minLikeBps; uint32 holdSecs; uint64 startsAt; uint64 endsAt; uint8 minTier; bytes32 briefHash; }
struct Campaign   { CampaignParams params; address brand; CampaignStatus status; uint128 reserved; uint128 paid; }
struct Clip       { uint256 campaignId; address clipper; ClipStatus status; uint64 registeredAt; uint64 publishedAt;
                    uint64 lastViews; uint64 lastLikes; uint64 flagDeadline; uint128 accrued; uint128 released; string videoId; }
struct Tranche    { uint128 amount; uint64 views; uint64 unlockAt; }
struct ActiveClip { uint256 clipId; uint256 campaignId; address clipper; string videoId; uint8 status; uint64 lastViews; uint64 lastLikes; }
struct ClipUpdate { uint256 clipId; uint64 views; uint64 likes; uint64 publishedAt; uint8 flags; } // 1 OWNERSHIP_OK, 2 UNAVAILABLE
struct RegisterClip { uint256 campaignId; string videoId; address clipper; uint256 nonce; uint256 deadline; }
struct SetPayout    { address clipper; address payout; uint256 nonce; uint256 deadline; }
```

### Functions by caller
| Caller | Function | Notes |
|---|---|---|
| Brand | `createCampaign(CampaignParams) → campaignId` | Pulls `budget`; token must be allowed; brand = `msg.sender` |
| Brand | `createCampaignWithPermit(p, deadline, v, r, s) → campaignId` | Same, with an EIP-2612 permit in one transaction |
| Brand | `topUp(campaignId, amount)` | |
| Brand (anyone after `endsAt`) | `closeCampaign(campaignId)` | Stops accrual; refunds `budget − reserved − paid` to the brand |
| Brand | `closeCampaignTo(campaignId, refundTo)` | Same, refund (and later reject returns) to another address |
| Brand | `flag(clipId, reasonHash)` | Pays matured tranches first, then freezes the rest; once per clip |
| Brand | `resolve(clipId, reject)` | Before `flagDeadline` only |
| Clipper | `registerClip(campaignId, videoId) → clipId` | Direct; the clipper pays gas |
| Relayer | `registerClipWithSig(RegisterClip, sig) → clipId` | Gasless (ops Worker `/relay/register`) |
| Relayer | `setPayoutAddressWithSig(SetPayout, sig)` | `payout = 0` resets to the clipper (ops Worker `/relay/payout-address`) |
| Anyone (keeper) | `release(clipIds[])` | Pays matured tranches (up to 200 per clip per call); a failed transfer emits `ReleaseFailed` and doesn't block the batch |
| Anyone (keeper) | `autoResolve(clipId)` | Accepts a flag once `flagDeadline` has passed |
| Anyone (keeper) | `expirePending(clipId)` | Rejects a Pending clip after `pendingTimeout` |
| Anyone (keeper) | `sweep(clipIds[])` | Ends watched clips of closed or finished campaigns |
| Forwarder | `onReport(metadata, report)` | Oracle reports (see below) |
| Owner | `setTokenAllowed`, `setReportTransmitter`, `setGuardian`, `setPaused(false)` | Mainnet owner = 24 h timelock |
| Owner or guardian | `setPaused(true)` | Pauses create, register and reports; payouts, closes and flags keep working |

### Views
`getCampaign(id)` · `getClip(id)` · `getTranches(id)` · `activeClips(offset, limit)` (oracle's page; page until
`offset ≥ watchListLength()`) · `watchListLength()` · `keeperList(list, offset, limit)` · `nextUnlockAt(clipId)` ·
`lastRound()` · `nonces(clipper)` (one counter for RegisterClip and SetPayout) · `payoutAddressOf(clipper)` ·
`tokenAllowed(token)` · `clipIdByVideo(keccak256(videoId))` · `campaignCount()` · `clipCount()` · `pendingTimeout()` ·
`resolveWindow()` · `reportTransmitter()` · `guardian()` · `paused()` · `reputation()`.

Constants: `FLAG_OWNERSHIP_OK = 1`, `FLAG_UNAVAILABLE = 2`, `MAX_HOLD_SECS = 7 days`, `MAX_ROUND_GAP = 1000`,
`UNAVAILABLE_STRIKES = 3`, `MAX_PENDING_PER_CLIPPER = 3`, `MAX_TRANCHES_PER_RELEASE = 200`. Testnet v1:
`pendingTimeout = 600` s, `resolveWindow = 1800` s (mainnet: 48 h each).

### Events (Envio mirrors these)
```
CampaignCreated(id, brand, token, budget, cpm, maxPerClip, holdSecs, startsAt, endsAt, minTier, briefHash)
CampaignToppedUp(id, amount) · CampaignClosed(id, refund) · CampaignRefunded(id, to, amount)
ClipRegistered(clipId, campaignId, clipper, videoId) · ClipActivated(clipId) · ClipRejected(clipId, reason) · ClipEnded(clipId)
ViewsVerified(clipId, campaignId, clipper, round, totalViews, deltaViews, likes, amount, unlockAt)   // the receipt
SuspectReport(clipId, round, views, likes) · ReportEntrySkipped(clipId, reason)
Flagged(clipId, brand, reasonHash, deadline) · Resolved(clipId, rejected, returned)
Released(clipId, clipper, amount) · ReleaseFailed(clipId, to, amount)
PayoutAddressSet(clipper, payout) · TokenAllowed(token, allowed) · ReportTransmitterSet(transmitter) · GuardianSet(guardian)
```
`Resolved(rejected = false)` doesn't say whether the clip went back to Active or Ended: read `getClip` (the mainnet
build adds it to the event).

### Errors
`TokenNotAllowed` · `InvalidParams` · `NotBrand` · `CampaignNotActive` · `CampaignEnded` · `InvalidVideoId` ·
`VideoAlreadyRegistered` · `TierTooLow` · `ExpiredDeadline` · `InvalidNonce` · `InvalidSignature` ·
`StaleRound(round, lastRound)` · `RoundGapTooLarge(round, lastRound)` · `NotFlaggable` · `NotFlagged` ·
`AlreadyFlagged` · `FlagExpired` · `FlagNotExpired` · `ReportsNotAuthorized` · `UnauthorizedTransmitter(origin, expected)` ·
`TooManyPending` · `NotPending` · `PendingNotExpired` · `InvalidPayout` · `NotGuardian` · `InvalidRefundAddress`,
plus OpenZeppelin's `EnforcedPause` and ownership errors.

## Oracle report
`report = abi.encode(uint64 round, ClipUpdate[] u)`. The whole report reverts only for a bad sender or round
(`round ≤ lastRound`, or more than 1,000 ahead); each bad entry is skipped with `ReportEntrySkipped`. Per entry, in order:
1. Unknown clip, a second entry for the same clip, a clip that isn't Pending or Active, or a closed campaign: skipped.
2. `UNAVAILABLE`: a strike. Three in a row end the clip; any available report clears the strikes.
3. Pending: activates if `OWNERSHIP_OK` and `publishedAt ≥ startsAt`, which also reserves the video (a second clip
   of the same video is rejected as `DuplicateVideo`). Otherwise it waits until `pendingTimeout`, then is rejected
   (`NoOwnership`). Anyone can also call `expirePending`.
4. Views only go up. `delta = min(views − lastViews, maxViewsPerReport)`; views above the cap are never paid.
5. Like floor, on totals: if `likes × 10,000 < minLikeBps × views`, emit `SuspectReport` and pay nothing for this
   delta (`lastViews` still moves up, so those views are never paid).
6. `amount = delta × cpm / 1000`, capped by `maxPerClip − accrued` and the campaign's free budget. Reserve it, add a
   tranche unlocking at `now + holdSecs`, emit `ViewsVerified`. A clip that reaches `maxPerClip` leaves the watch list.

Reports are accepted only through the configured forwarder and, on the mock forwarder, only when `tx.origin` is
`reportTransmitter` (the oracle wallet in `docs/wallets.md`).

## EIP-712 (gasless signatures)
Domain `{ name: "Cliprail", version: "1", chainId, verifyingContract: vault }`.
```
RegisterClip(uint256 campaignId,string videoId,address clipper,uint256 nonce,uint256 deadline)
SetPayout(address clipper,address payout,uint256 nonce,uint256 deadline)
```
Types are exported from `@cliprail/shared` (`cliprailDomain`, `registerClipTypes`, `setPayoutTypes`). Signatures
from contract accounts are checked with ERC-1271; that includes EOAs with an EIP-7702 delegation (audit V1-11).

## Claim code
`"CR-" + upper(hex(keccak256(abi.encodePacked(uint256 campaignId, address clipper)))[2:18])`: 16 hex characters
(64 bits), e.g. `CR-0E9A273285510A02`. Three copies must match byte for byte: `CampaignVaultLens.claimCode`,
`@cliprail/shared` `claimCode()`, and the CRE oracle (which imports the shared one). The oracle checks the Short's
**description** for it, case-insensitive.

## CampaignVaultLens
Each function pages over one raw vault list, so a page can return fewer than `limit` ids; keep paging (use
`keeperList` to find the end).

| Function | Returns |
|---|---|
| `releasableClips(offset, limit)` | Pay-list clips that `release` would pay now (not Flagged or Rejected, first tranche matured) |
| `expiredFlags(offset, limit)` | Flagged clips past `flagDeadline` → `autoResolve` |
| `expiredPending(offset, limit)` | Pending clips past `pendingTimeout` → `expirePending` |
| `sweepableClips(offset, limit)` | Watched clips whose campaign is closed or past `endsAt` → `sweep` |
| `claimCode(campaignId, clipper)` | The claim code above |
| `vault()` | The vault it reads |

## CreatorReputation
```
struct Stats { uint64 paidViews; uint128 earned; uint32 clipsPaid; uint32 rejections; uint32 brands; uint64 firstSeen; }
stats(clipper) · tier(clipper) · isVault(vault) · clipCounted(vault, clipId) · rejectedBy(clipper, brand)
recordPaid(clipper, brand, clipId, paidViews, amount)   // vault only
recordRejection(clipper, brand)                         // vault only; once per (clipper, brand)
addVault(vault) · removeVault(vault)                    // owner only
events: ReputationUpdated(clipper, paidViews, earned, rejections, tier) · VaultAdded(vault) · VaultRemoved(vault)
```
Tiers: **0** new · **1** ≥ 5,000 paid views and at most 1 rejecting brand · **2** ≥ 50,000 paid views and a
rejection rate under 5%. `rejections` counts distinct brands; `clipsPaid` counts distinct clips. `ReputationUpdated`
comes from this contract, not the vault, so the indexer tracks both.

## Differences from PRD §5
| PRD §5 | v1 (deployed) | Why |
|---|---|---|
| Claim code `[2:10]`, 8 hex characters | `[2:18]`, 16 characters | 8 characters could be ground in about 20 minutes on a laptop |
| `claimCode` is a vault view | On the lens | Vault size limit (EIP-170) |
| Tier 1: 0 rejections | At most 1 rejecting brand; rejections count once per brand | Audit V1-3: one hostile brand shouldn't sink a clipper |
| `recordPaid(clipper, brand, paidViews, amount)`, `recordRejection(clipper)` | `recordPaid(…, clipId, …)`, `recordRejection(clipper, brand)` | Count distinct clips and distinct brands |
| `UNAVAILABLE` → Ended | Ended after 3 in a row | One bad API answer shouldn't end a clip |
| Pending rejected after 48 h by a report | Also `expirePending` by anyone; testnet timeout 10 minutes | Liveness without the oracle |
| Each video registered once globally | A video is reserved when its clip **activates** | Audit H-2: registering first could lock the real owner out |
| `closeCampaign` only | Plus `closeCampaignTo(refundTo)`; anyone may close after `endsAt` | Audit R-2: a brand that can't receive tokens can still be refunded |
| Events in §5.3 | Plus `ReportEntrySkipped`, `ReleaseFailed`, `CampaignRefunded`, `PayoutAddressSet`, `TokenAllowed`, `ReportTransmitterSet`, `GuardianSet` | Skip reasons, failed payouts, and admin changes are visible |
| Playbook §C additions | All present: `setPaused`, `lastRound`, keeper views (on the lens), `createCampaignWithPermit`, `setPayoutAddressWithSig`, `payoutAddressOf`, `Tranche.views`, non-reverting `onReport`, timeouts in the constructor, `setTokenAllowed` | |

## Off-chain APIs
- ops Worker (relayer, preview, keeper): `ops/README.md`.
- CRE oracle: `cre/README.md`.
