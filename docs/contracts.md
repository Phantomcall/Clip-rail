# Contracts (I-7.3)

What each contract does, every external function, the events, the invariants we test and where v1 is deployed.
Exact signatures, structs, enum numbering, the oracle report rules and the EIP-712 types are in
[`packages/abi/INTERFACES.md`](../packages/abi/INTERFACES.md); the per-function NatSpec is in
`contracts/src/interfaces/`. Security model and owner powers: [`security.md`](security.md). Gas: [`gas.md`](gas.md).

| Contract | Role |
|---|---|
| `CampaignVault` | Holds campaign budgets, registers clips, takes oracle reports, holds earnings, handles flags, pays clippers |
| `CampaignVaultLens` | Read-only keeper to-do lists and `claimCode`; kept out of the vault for the 24 KB size limit (EIP-170) |
| `CreatorReputation` | Append-only clipper stats and tiers; only an authorised vault writes |
| `MockUSDC` | Testnet token with an open mint (max 10,000 per call), 6 decimals and EIP-2612 permit |

Money moves in one direction: brand → vault (create, top up) → clipper (release), or back to the brand (close,
reject). Earnings sit in a **hold** (`holdSecs`, at most 7 days) as tranches before anyone can release them, and the
brand can flag a clip during the hold.

## Deployments

**Monad testnet (chain 10143), v1.** Source of truth: [`packages/abi/addresses.json`](../packages/abi/addresses.json).
Cliprail runs on testnet only (decision log in `security.md`).

| Contract | Address | Block | Deploy transaction |
|---|---|---|---|
| CreatorReputation | [`0x5c38812Ec071dEcd89aB2c433f3ddB94E1731913`](https://testnet.monadvision.com/address/0x5c38812Ec071dEcd89aB2c433f3ddB94E1731913) | 68749763 | [`0x56ca66f7…9dce`](https://testnet.monadvision.com/tx/0x56ca66f74b15a90dfc73b1ee7abf02c032b7b0eb8b16cf1f03e778d52f869dce) |
| CampaignVault | [`0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf`](https://testnet.monadvision.com/address/0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf) | 68749773 | [`0xc1b333fd…dade`](https://testnet.monadvision.com/tx/0xc1b333fdb25b79658b7a1e777f48862735552bc8b50e7570fdbd7180cc0fdade) |
| CampaignVaultLens | [`0x6f8d90BD1D58c592876391Db01db780b69A64938`](https://testnet.monadvision.com/address/0x6f8d90BD1D58c592876391Db01db780b69A64938) | 68749784 | [`0x926d1a2a…3a78`](https://testnet.monadvision.com/tx/0x926d1a2a441eda82bc25a019d1a18b0f8eceba1472e93a250c84fe0b76ee3a78) |
| MockUSDC | [`0x92cE6862a977Fe61D966C3903e8E5f5d7d84a7ec`](https://testnet.monadvision.com/address/0x92cE6862a977Fe61D966C3903e8E5f5d7d84a7ec) | 68749789 | [`0x46358d2e…84daa`](https://testnet.monadvision.com/tx/0x46358d2e42c5797a9486ba817bc3cda16ae37504aca0e4cae36306ca21284daa) |

- **Verified** on MonadVision's Sourcify (runtime match, 2026-10-06). The deployed source is tag `abi-v1`. NatSpec
  added since then doesn't change the bytecode: `bytecode_hash = "none"` keeps the metadata hash out of it, and the
  build is byte-identical to `abi-v1` (checked when the NatSpec went in).
- **Build:** solc 0.8.28, optimizer 200 runs, `via_ir` (`contracts/foundry.toml`). Deploy script:
  `contracts/script/Deploy.s.sol`.
- **Indexer start block:** 68749763.

Configuration, read on chain on 2026-10-11:

| Setting | Value |
|---|---|
| Vault `owner`, `guardian`; reputation `owner` | deployer `0xC7e501C18846080439131E31Ad5D4b56f7bcA0F0` |
| Vault forwarder | Chainlink `MockKeystoneForwarder` `0xB9F79d863261869B234c481D1f9A7af84AeAd192` |
| `reportTransmitter` (oracle wallet, David) | `0xe96307086A533Eb4A1eD71AB48b382bD53f129B9` |
| Expected workflow ID / author | unset (the mock forwarder signs nothing, so `reportTransmitter` is the check) |
| `pendingTimeout` / `resolveWindow` | 600 s / 1,800 s (short, so judges see the whole lifecycle; the deploy script uses 48 h each for real funds) |
| Allowed tokens | MockUSDC, Circle testnet USDC `0x534b…43A3`, AUSD `0xa901…22dC` |
| Reputation vaults | the v1 vault only |

The retired v0 vault (`0xf9B2B301B94Aa534a872f0e54fAAAA319061Af45`) can't pay out (its release and close were stubs)
and has no write access to the v1 reputation contract (`isVault` is false, checked 2026-10-11).
Wallets and who holds their keys: [`wallets.md`](wallets.md).

## Functions

`nonReentrant` guards every function that moves tokens. **Paused** blocks create, register and `expirePending`, and
reports still advance the round but skip every entry; release, close, top-up, flag and resolve keep working so money
can always leave.

### CampaignVault: brand

| Function | Who | What it does | Emits |
|---|---|---|---|
| `createCampaign(p)` | anyone (becomes the brand) | Pulls `p.budget` of an allowed token. Requires non-zero budget, CPM, `maxPerClip` and `maxViewsPerReport`, a like floor ≤ 100%, hold ≤ 7 days, `startsAt < endsAt` and `endsAt` in the future | `CampaignCreated` |
| `createCampaignWithPermit(p, deadline, v, r, s)` | anyone | Same, with an EIP-2612 permit in the same transaction (a front-run permit can't block it) | `CampaignCreated` |
| `topUp(id, amount)` | anyone | Adds budget to an active campaign before `endsAt` | `CampaignToppedUp` |
| `closeCampaign(id)` | brand; anyone after `endsAt` | Stops accrual; refunds `budget − reserved − paid` to the brand. Reserved tranches still release | `CampaignClosed` |
| `closeCampaignTo(id, refundTo)` | brand | Same, with the refund (and later reject returns) sent to `refundTo` | `CampaignClosed` |
| `flag(clipId, reasonHash)` | brand | Freezes the clip and pays its matured tranches (they are the clipper's); once per clip; opens a `resolveWindow` | `Flagged`, `Released` |
| `resolve(clipId, reject)` | brand, before `flagDeadline` | Reject: unreleased earnings return to the budget (or the refund address) and count against reputation. Accept: the clip resumes | `Resolved`, `ClipRejected` |

### CampaignVault: clipper and relayer

| Function | Who | What it does | Emits |
|---|---|---|---|
| `registerClip(campaignId, videoId)` | clipper | Registers an 11-character YouTube id as a Pending clip on an open campaign; checks the tier, that no clip owns the video yet, and at most 3 Pending clips per clipper per campaign | `ClipRegistered` |
| `registerClipWithSig(r, sig)` | anyone (the ops relayer) | Same from an EIP-712 `RegisterClip` signature (EOA or ERC-1271); gasless for the clipper | `ClipRegistered` |
| `setPayoutAddressWithSig(s, sig)` | anyone (the ops relayer) | Sets where the clipper's payouts go; `payout = 0` resets to the clipper | `PayoutAddressSet` |

### CampaignVault: oracle and keeper

| Function | Who | What it does | Emits |
|---|---|---|---|
| `onReport(metadata, report)` | the forwarder, broadcast by `reportTransmitter` | Applies `abi.encode(round, ClipUpdate[])`: activates, accrues tranches, ends unavailable clips. Bad entries are skipped, not reverted | `ClipActivated`, `ViewsVerified`, `SuspectReport`, `ClipRejected`, `ClipEnded`, `ReportEntrySkipped` |
| `release(clipIds)` | anyone (keeper) | Pays matured tranches (≤ 200 per clip per call) to each payout address; a failed transfer doesn't block the batch | `Released`, `ReleaseFailed` |
| `autoResolve(clipId)` | anyone (keeper) | Accepts a flag after `flagDeadline` | `Resolved` |
| `expirePending(clipId)` | anyone (keeper) | Rejects a Pending clip after `pendingTimeout` (`NoOwnership`) | `ClipRejected` |
| `sweep(clipIds)` | anyone (keeper) | Ends watched clips whose campaign is closed or past `endsAt` | `ClipEnded` |

### CampaignVault: owner and guardian

| Function | Who | What it does | Emits |
|---|---|---|---|
| `setPaused(true)` / `setPaused(false)` | owner or guardian / owner | Pause or unpause (see above) | `Paused` / `Unpaused` |
| `setTokenAllowed(token, allowed)` | owner | Which tokens new campaigns may use; existing campaigns are unaffected | `TokenAllowed` |
| `setReportTransmitter(addr)` | owner | Pins the oracle wallet; set it to 0 only once the workflow identity is set | `ReportTransmitterSet` |
| `setGuardian(addr)` | owner | Sets the guardian | `GuardianSet` |
| `setForwarderAddress`, `setExpectedAuthor`, `setExpectedWorkflowName`, `setExpectedWorkflowId` | owner | Chainlink `ReceiverTemplate` settings for production CRE | Chainlink's events |
| `transferOwnership`, `renounceOwnership` | owner | OpenZeppelin `Ownable` | `OwnershipTransferred` |

### CampaignVault: views

`getCampaign` · `getClip` · `getTranches` · `activeClips(offset, limit)` (the oracle's page) · `watchListLength` ·
`keeperList(list, offset, limit)` · `nextUnlockAt` · `lastRound` · `nonces` · `payoutAddressOf` · `refundAddressOf` ·
`tokenAllowed` · `clipIdByVideo` · `everFlagged` · `campaignCount` · `clipCount` · `pendingTimeout` · `resolveWindow` ·
`reportTransmitter` · `guardian` · `reputation` · `paused` · `owner` · `domainSeparator` · the constants
(`FLAG_OWNERSHIP_OK`, `FLAG_UNAVAILABLE`, `MAX_HOLD_SECS`, `MAX_ROUND_GAP`, `UNAVAILABLE_STRIKES`,
`MAX_PENDING_PER_CLIPPER`, `MAX_TRANCHES_PER_RELEASE`, the two EIP-712 type hashes) and Chainlink's getters.

### CampaignVaultLens (all views)

| Function | Returns |
|---|---|
| `releasableClips(offset, limit)` | Clips `release` would pay now |
| `expiredFlags(offset, limit)` | Flagged clips past `flagDeadline` → `autoResolve` |
| `expiredPending(offset, limit)` | Pending clips past `pendingTimeout` → `expirePending` |
| `sweepableClips(offset, limit)` | Watched clips of closed or finished campaigns → `sweep` |
| `claimCode(campaignId, clipper)` | `CR-` + 16 hex characters; must match `@cliprail/shared` and the CRE oracle byte for byte |
| `vault()` | The vault it reads |

Each pages over one raw vault list, so a page may hold fewer than `limit` ids: keep paging until `offset` passes the
list's length (`keeperList` / `watchListLength`).

### CreatorReputation

| Function | Who | What it does | Emits |
|---|---|---|---|
| `recordPaid(clipper, brand, clipId, paidViews, amount)` | an authorised vault, on release | Adds views and earnings; counts distinct clips and distinct paying brands | `ReputationUpdated` |
| `recordRejection(clipper, brand)` | an authorised vault, on a brand reject | Counts at most one rejection per (clipper, brand) | `ReputationUpdated` |
| `addVault(vault)` / `removeVault(vault)` | owner | Grants or revokes write access; the vault must point back at this contract | `VaultAdded` / `VaultRemoved` |
| `stats`, `tier`, `isVault`, `clipCounted`, `rejectedBy`, `paidBy`, the tier constants | anyone | Views | |

Tiers: **0** new · **1** ≥ 5,000 paid views and at most one rejecting brand · **2** ≥ 50,000 paid views and a
rejection rate under 5%. The vault never lets reputation block a payout (calls are wrapped in `try`).

## Events

| Event | When | Who reads it |
|---|---|---|
| `CampaignCreated`, `CampaignToppedUp`, `CampaignClosed`, `CampaignRefunded` | Budget changes | Indexer, brand console |
| `ClipRegistered`, `ClipActivated`, `ClipRejected(reason)`, `ClipEnded` | Clip lifecycle | Indexer, clipper dashboard |
| `ViewsVerified` | The receipt: a report accrued `amount` for `deltaViews`, unlocking at `unlockAt` | Indexer, receipts page |
| `SuspectReport` | Likes below the campaign's floor: those views are never paid | Indexer, brand console |
| `ReportEntrySkipped(reason)` | One report entry ignored (unknown, duplicate, closed, paused, unavailable) | Oracle debugging |
| `Flagged`, `Resolved` | Brand flag and its outcome | Indexer, keeper |
| `Released`, `ReleaseFailed` | A payout, or a payout that couldn't be sent (stays releasable) | Indexer, keeper |
| `PayoutAddressSet`, `TokenAllowed`, `ReportTransmitterSet`, `GuardianSet`, `Paused`, `Unpaused`, `OwnershipTransferred` | Settings | Monitoring |
| `ReputationUpdated`, `VaultAdded`, `VaultRemoved` (reputation contract) | Stats and access changes | Indexer, profiles |

Enum values for `reason` fields: `INTERFACES.md`.

## Invariants

Twelve invariants run against a handler that creates, tops up, registers, reports, flags, resolves, releases,
expires, sweeps and closes at random (`contracts/test/invariant/VaultInvariants.t.sol`; 256 runs × depth 50
locally, 500 × 100 in CI):

| Invariant | Holds that |
|---|---|
| `campaignAccounting` | `reserved + paid ≤ budget`, and a campaign's clips' `accrued` sums to `reserved + paid` |
| `moneyModel` | Every action moved exactly the tokens a model predicted, to exactly the right party |
| `conservation` | Every token that entered the vault is still there or went to a clipper or the brand |
| `solvent` | The vault holds exactly every campaign's unpaid budget: no shortfall, no stuck tokens |
| `payoutsReachClippers` | Every token a clipper holds came from a release, and every release reached a clipper |
| `flaggedNeverPaid` | A flagged clip is never paid |
| `keeperLists` | The pay list is exactly the clips with unreleased tranches; the flag list exactly the Flagged clips |
| `clipCaps` | No clip earns past `maxPerClip`; tranches sum to `accrued`; clips that never activated earn 0 |
| `videoOwnership` | Each video is owned by at most one clip, which has that video and has activated |
| `pendingCounts` | The pending counter equals the real number of Pending clips per (campaign, clipper) |
| `watchList` | Every Pending clip is watched; every watched clip is Pending, Active or Flagged and below its cap |
| `round` | `lastRound` only moves forward and never past what the oracle sent |

Alongside them: unit and fuzz tests (10,000 fuzz runs in CI), the adversarial suite in `contracts/test/audit/`, fork
tests against the real testnet contracts, and `contracts/script/Smoke.s.sol` against the deployed ones. Audit
reports: `docs/audit/`. Static analysis (Slither, Aderyn): `security.md`.
