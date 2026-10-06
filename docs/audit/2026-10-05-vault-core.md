# Audit: CampaignVault core (branch `isaac/vault-core`, commit 7970129)

Scope: `CampaignVault.sol`, `CreatorReputation.sol` (stub), `MockUSDC.sol`, the CRE receiver integration.
Release, flag/resolve and close are not implemented yet; requirements for them are in section 4.

Method: line-by-line review against PRD §5 and playbook §C, Chainlink's forwarder sources, Slither and Aderyn
(no real findings), and proof-of-concept exploits. Every PoC passed against commit 7970129, which proved each
issue could happen. The PoCs now live on as regression tests in `contracts/test/audit/AuditRegressions.t.sol`:
each one replays the attack and asserts it fails.

**Status: all critical, high, medium and low findings are fixed.** Section 6 covers verification.

## 1. Summary

| ID | Severity | Issue | Status |
|---|---|---|---|
| C-1 | Critical | Anyone can forge oracle reports through the public mock forwarder and drain every budget | Fixed: oracle wallet pinned while on the mock; fails closed |
| H-1 | High | One report with `round = uint64.max` bricks the oracle forever | Fixed: `MAX_ROUND_GAP = 1000` |
| H-2 | High | Video squatting: registering someone else's Short first locks the owner out forever | Fixed: the video is reserved on activation |
| H-3 | High | 32-bit claim codes can be brute-forced, so an attacker can claim another clipper's video | Fixed: 64-bit code in the vault and `packages/shared` |
| H-4 | High | Production forwarder accepts any CRE workflow's reports unless workflow identity is pinned | Fixed: workflow owner and ID are required once unpinned |
| M-1 | Medium | The same clip listed twice in one report bypasses the velocity cap | Fixed: one update per clip per round |
| M-2 | Medium | The owner key can redirect reports and drain everything instantly | Fixed: 24 h timelock owner on mainnet; the guardian can only pause |
| M-3 | Medium | One transient "unavailable" ends an earning clip forever | Fixed: 3 consecutive strikes, for Pending and Active clips |
| M-4 | Medium | Unlimited pending registrations can starve the oracle's page | Fixed: 3 pending per clipper per campaign; `expirePending`; maxed and empty clips leave the page |
| L-1 to L-5 | Low | See section 3 | Fixed |

## 2. Critical and high

### C-1. Forged reports through the mock forwarder
The vault trusts the mock forwarder until CRE deploy access arrives. Chainlink's `MockKeystoneForwarder.report()`
is documented in its source as *"permissionless and skips all signature/config validations"*. Anyone can call
it with any report. The PoC registers 8 fake videos and reserves the full $150 budget in one transaction.
On mainnet this means anyone can steal every campaign's money.

**Fix:**
- While on the mock forwarder, only accept reports whose `tx.origin` is our oracle wallet (the simulator's
  broadcaster). The mock passes no other caller information, so `tx.origin` is the only signal available.
- Fail closed: `_processReport` reverts unless one of these is configured: the transmitter pin, or the
  workflow owner and ID (see H-4).

### H-1. Round bricking
`round` only has to be greater than `lastRound`. A single report with `uint64.max` makes every later report
stale, and there is no way to recover. The cause can be an attacker (via C-1) or an oracle bug.

**Fix:** require `round <= lastRound + MAX_ROUND_GAP` (for example 1,000). The oracle always sends `lastRound + 1`.

### H-2. Video squatting
A Short is public, along with its claim code, the moment it's posted. An attacker can register its ID before
the owner does. The owner's registration then reverts, the squat is rejected after the timeout, and the video
stays burned forever. Scanning YouTube for "CR-" codes would let one person block every clipper.

**Fix:** reserve the video ID **when ownership is proven**, at activation, not at registration.
- Several pending registrations of the same video are allowed.
- The first one to receive `OWNERSHIP_OK` for its own claim code wins.
- The others are rejected when they try to activate.

### H-3. Claim code too short
The code is 32 bits. Grinding 28 bits took 49 s on this 4-core laptop, so 32 bits takes about 15–30 minutes
here and seconds on a GPU. CREATE2 addresses make it pure keccak work. An attacker who finds an address whose
code matches the victim's gets `OWNERSHIP_OK` for the victim's video. With H-2 fixed, that becomes outright theft.

**Fix:** a 64-bit code (16 hex characters), which is infeasible to grind. This touches `packages/shared`, the
oracle and the UI copy. All of them already call the one shared function.

### H-4. Production forwarder is shared by every CRE workflow
`KeystoneForwarder` verifies DON signatures, but any workflow owner on that DON can target any receiver.
`ReceiverTemplate`'s workflow checks are off by default, and playbook I-5.3 calls them "optional".
**They must be mandatory.**

**Fix:**
- Enforce it in code with the same fail-closed rule as C-1.
- Switching forwarders becomes one owner call that sets the forwarder, the workflow owner and the workflow ID together.

## 3. Medium and low

- **M-1. Duplicate entries.**
  - *Problem:* two entries for one clip in one report each get a full velocity cap. The PoC paid $40 where the
    cap allows $20.
  - *Fix:* record the last round each clip was updated in, and skip a second entry in the same round.
- **M-2. Owner key is a single point of failure.**
  - *Problem:* `setForwarderAddress` takes effect at once, so a stolen deployer key drains everything.
  - *Fix:* make the owner an OpenZeppelin `TimelockController` (24 h on mainnet), so brands can see a change
    coming and close their campaigns. Add a separate `guardian` that can only pause.
- **M-3. Transient unavailable.**
  - *Problem:* one bad YouTube response ends an Active clip forever.
  - *Fix:* end an Active clip only after 3 consecutive `UNAVAILABLE` reports. A Pending clip can still end at once,
    which is harmless once H-2 is fixed.
- **M-4. Spam and starvation.**
  - *Problem:* anyone can register any number of junk IDs. The oracle reads 500 rows per run, and swap-and-pop
    removal reorders the list.
  - *Fix:*
    - cap open pending clips per clipper per campaign (3);
    - add a permissionless `expirePending(clipId)` (see L-1);
    - make the oracle page through `watchListLength()` with Active clips first (David).
- **L-1.** A Pending clip only expires if a report includes it, and the oracle skips unchanged clips.
  Add a permissionless `expirePending(clipId)`.
- **L-2.** Clips at `maxPerClip`, or in campaigns with no free budget, are still watched and waste YouTube quota.
  Unwatch them, and filter them out in `activeClips`.
- **L-3.** The constructor accepts a zero reputation address and zero timeouts. Validate them.
- **L-4.** `topUp` works after `endsAt`. Require `now < endsAt`.
- **L-5.** The payout address can be the vault or the token, which would lock the funds. Reject both.
- **Info:**
  - `ViewsVerified.deltaViews` is the velocity-capped delta; the views actually paid are in `Tranche.views`.
  - Clips of closed campaigns keep status Active; the UI should read the campaign's status.
  - Pin `evm_version` explicitly.
  - `tx.origin` is used on purpose (C-1).

## 4. Requirements for release / flag / close (tomorrow)

- **R-1.** `release` must skip a clip whose transfer fails (USDC blacklist) instead of reverting the whole batch.
- **R-2.** A close refund to a blacklisted brand would revert and strand the funds. Let the brand pass a refund address.
- **R-3.** Flag griefing: a brand could flag, wait out the auto-resolve, then flag again, forever. Allow one flag per clip.
- **R-4.** A brand is the judge of its own rejects, and a reject returns the money to the brand. This is a trust
  assumption. Make each brand's reject rate public through events and the indexer, and document it.
- **R-5.** A reject must reduce `clip.accrued` (decision 2) and remove the clip from the watch list.
- **R-6.** Invariant suite: reserved + paid ≤ budget, Σ accrued = reserved + paid, balance ≥ Σ (budget − paid),
  a flagged clip is never paid, the round only increases.

## 5. Does it do what the PRD says?

Rules 1–7, the registration checks and the EIP-712 signatures match PRD §5 and are covered by 43 tests.
The EIP-712 digests are byte-identical to viem with the `packages/shared` types. Deviations: the issues above,
and the two Info items.

## 6. Verification of the fixes

- 62 Foundry tests pass: 19 audit regressions, 38 core and 5 base. The CI profile runs 10,000 fuzz runs.
- The deploy script ran against local chains 10143 and 143, and the on-chain state was read back:
  - the oracle is pinned as the transmitter and the guardian is set;
  - Reputation's owner is `address(0)` and `reputation.vault()` is the vault;
  - on 143, the vault's owner is the `TimelockController`.
- Claim code: `CR-09DAD21282658239` for `(1, 0x…dEaD)` is pinned in both the Solidity and the `packages/shared`
  tests, so the two implementations can't drift apart.
- Repo CI passes locally: typecheck (shared, oracle, web), lint, tests (shared and oracle) and the web build.
- Slither rescan: the only new detectors are `tx-origin` (the C-1 fix, intentional) and `missing-zero-check`
  (zero is meaningful for the transmitter and guardian).
- ABI: additions only. No existing function, event or error signature changed.

### Operational requirements these fixes create
- The oracle runner must broadcast with the `cliprail-oracle` wallet; that address is `ORACLE_ADDRESS` at deploy time.
- Switch to the production forwarder with one timelock batch: `setExpectedAuthor` + `setExpectedWorkflowId` +
  `setForwarderAddress` + `setReportTransmitter(0)`. Until the whole batch runs, reports fail closed.
- On mainnet, every owner action waits 24 h. Pausing doesn't: the guardian can pause at any time.
- The oracle should page through the whole watch list (`watchListLength()`), Active clips first, and must report
  Pending clips. Anyone can also clear expired Pending clips with `expirePending`.
- `cre/oracle/.cre_build_tmp.js` is a tracked build artefact with the old 8-character code. It is regenerated on
  compile; it should be git-ignored.

### Still open
- R-1 to R-6 (section 4) apply to tomorrow's release, flag and close code.
- Pin `evm_version` after confirming which fork Monad supports.

## 7. Second review of the fixes (different angle)

The first pass asked "can this code be attacked?". This pass asked two different questions: **do the fixes themselves
open new attacks or break honest use**, and **does any random sequence of actions break the accounting**.

### 7.1 Stateful invariant fuzzing (`contracts/test/invariant/VaultInvariants.t.sol`)
A handler drives the vault with random register, report, warp, expirePending, topUp and pause actions:
- 4 clippers and 2 campaigns, one of them small enough that its budget runs out
- 12 shared video IDs, so squatting and duplicate paths happen constantly
- reports that include unknown clips, falling views, every flag combination and videos published before the start

After every call it checks these invariants:

| Invariant | Meaning |
|---|---|
| `campaignAccounting` | reserved + paid ≤ budget; Σ clip.accrued = reserved + paid |
| `solvent` | the vault's token balance ≥ Σ (budget − paid) |
| `clipCaps` | accrued ≤ maxPerClip; tranches sum to accrued; Pending clips have earned nothing |
| `videoOwnership` | each video has at most one owning clip, which has activated; non-owners earned nothing |
| `pendingCounts` | the pending counter equals the real number of Pending clips; the cap is never exceeded |
| `watchList` | every Pending clip is watched; every watched clip is Pending/Active and below its cap |
| `round` | lastRound equals the highest round the oracle sent |

**Result:**
- **100,000 calls (1,000 runs × 100) with fail-on-revert on: 0 reverts and 0 violations.** CI runs 500 × 100.
- A coverage probe confirmed the fuzzer reaches the hard states: duplicate-video rejections, clips ended by
  3 strikes, clips at maxPerClip, pause on and off.
- The probe also caught a bug **in the test**: a mis-ordered `vm.prank` meant pausing was never exercised. After
  the fix, the pause paths are covered.

### 7.2 Adversarial review of each fix
| Fix | Question | Finding |
|---|---|---|
| C-1 `tx.origin` pin | Can the pin be abused? | Only by making the oracle wallet call a malicious contract. **Operational rule:** that key only ever broadcasts the CRE simulation; it never signs anything else or sets an EIP-7702 delegation. If the key leaks, the **guardian pauses**, which stops every forged accrual at once (entries are skipped while paused), and the owner then rotates the transmitter. |
| H-2 reserve on activation | Can someone grief an owner's pending clip? | No. Only the owner's own claim code activates their clip. A clipper posting one video to two campaigns gets the first activation and `DuplicateVideo` on the second, as intended. |
| H-3 64-bit code | Multi-target grinding? | With N codes visible in a campaign, the cost is 2^64 / N. Even N = 10,000 is about 1.8e15 hashes per hit, for at most one clip's capped payout. Not economic. |
| M-2 timelock | Does one key still control it? | **It did:** the deployer was proposer, executor and canceller. **Fixed:** anyone can now execute after the delay, and `PROPOSER` (meant to be a team multisig) replaces the deployer as proposer. Verified on a local 143 chain: the multisig is proposer, the deployer isn't, anyone can execute, delay 86,400. |
| M-3 strikes | Can strikes hide a real removal? | A removed video stops earning at once (no accrual on UNAVAILABLE) and ends on the third report. Nothing extra is paid. |
| M-4 pending cap | Does it hurt honest clippers? | A 4th Short in the same campaign waits until one of the first three activates (one report cycle). Acceptable. Sybil spam via the relayer is limited by its rate limits. |
| L-1 `expirePending` | Who calls it? | **Gap:** nothing told the keeper which clips had expired. **Fixed:** a new `expiredPending(offset, limit)` view, matching `releasableClips` / `expiredFlags`. The keeper (I-3.4) should call it every run. |
| Reputation ownership renounced | Side effects? | If the vault were ever redeployed (I-5.2), clippers' reputation couldn't follow the new vault. **The team chose B (7.4).** |

### 7.3 CI added for contracts
`.github/workflows/ci.yml` now enforces the following on every PR:
- **contracts job:** `forge fmt --check`, `forge build --sizes`, `forge test` with the ci profile (10k fuzz runs plus the invariants), and an ABI-drift check (regenerates `packages/abi` and fails if it differs)
- **slither job:** `--fail-medium`
- Foundry is pinned to v1.8.3 and Slither to 0.11.6.

Intentional findings are suppressed only at their exact line, each with a reason: `tx-origin` (C-1),
`divide-before-multiply` (paid views) and `uninitialized-state` (the Reputation stub until I-2.4).

### 7.4 Decision B: Reputation survives a vault redeploy
- Reputation is no longer renounced. Its owner is the same 24 h `TimelockController` on mainnet, and the deployer on testnet.
- **The owner's only powers are `addVault` and `removeVault`. Nobody can edit stats.** `recordPaid` and
  `recordRejection` stay vault-only, and a test checks that the owner can't call them.
- **It's add/remove, not a hard switch.** A hard switch would make the old vault's remaining `release()` calls
  revert (they record reputation) and strand clippers' money. The old vault keeps write access until it has released
  everything, and only then is removed.
- `addVault` only accepts a contract whose `reputation()` returns this contract. Tests reject the zero address, a
  plain wallet, USDC, a vault built for another Reputation, and a duplicate.
- **Tests:** 5 new regressions, including a switch run through the timelock (blocked before 24 h, executable by
  anyone after). The deploy script was checked on chains 10143 and 143: on 143 the timelock owns both contracts,
  and `isVault(vault)` is true.
- **ABI:** in `CreatorReputation`, `setVault` / `vault()` / `VaultSet` are replaced by `addVault` / `removeVault` /
  `isVault` / `VaultAdded` / `VaultRemoved`. No other package uses them yet.

## 8. v1: release, flag and close (branch `isaac/vault-v1`)

### 8.1 What shipped
- **Release (F5):** `release(clipIds)` pays every matured tranche (at most 200 per clip per call) to the clipper's payout
  address, and records paid views in Reputation. It works while paused, so a pause never traps money that's already owed.
- **Flags:** `flag` freezes a clip's unreleased earnings for `resolveWindow`. `resolve(reject)` lets the brand decide;
  `autoResolve` lets anyone accept the flag after the window if the brand stays silent.
- **Close:** `closeCampaign` (the brand at any time; anyone after `endsAt`) and `closeCampaignTo` (the brand picks the
  refund address). Close refunds `budget − reserved − paid`. Money already reserved for clips stays in the vault.
- **Sweep:** `sweep(clipIds)` ends watched clips whose campaign is closed or past `endsAt`, so they stop taking oracle
  page slots (review follow-up). This also resolves the info note "clips of closed campaigns keep status Active".
- **Reputation (I-2.4):** real stats replace the stub. `clipsPaid` counts distinct clips per vault, not releases.
  Tier 2 uses `rejections / (clipsPaid + rejections) < 5%`. The `uninitialized-state` Slither suppression for the
  stub is gone.
- **`expirePending` is blocked while paused**, because the oracle can't activate clips while paused either.

### 8.2 Audit requirements R-1 to R-6
| Req | How it's met | Test |
|---|---|---|
| R-1 | `_release` uses a non-reverting transfer. On failure it rolls back that clip's effects, emits `ReleaseFailed`, and the batch continues. | `VaultV1.t.sol` (blacklisted payout) |
| R-2 | `closeCampaignTo(id, refundTo)`. Later reject returns after the close go to the same address (`CampaignRefunded`). | `VaultV1.t.sol` |
| R-3 | `everFlagged[clipId]`: one flag per clip, ever (`AlreadyFlagged`). | `VaultV1.t.sol` |
| R-4 | Trust assumption, see 8.3. Every brand decision emits `Resolved(clipId, rejected, returned)`, and the indexer on main already tracks it. | n/a |
| R-5 | `_reject` lowers `clip.accrued` and `reserved` by the unreleased amount, and removes the clip from the watch, pay and flag lists. | invariants |
| R-6 | Invariant suite extended (8.4). | `VaultInvariants.t.sol` |

### 8.3 Trust assumption: the brand judges its own flags (R-4)
A brand that flags a clip and then rejects it gets back the clip's earnings that were **still in hold** when it
flagged. Earnings whose hold has ended are paid out by the flag itself. The limits on this power are:
- one flag per clip, and only while something is still in hold;
- the hold window caps exposure to the earnings of the last `holdSecs` (audit V1-1);
- silence counts as accepting: the brand must decide before the deadline, and after it only auto-resolve is
  possible (audit V1-2);
- each brand counts once in a clipper's rejections (audit V1-3);
- every reject is public (`Resolved` with `rejected = true`), so the indexer and UI can show each brand's reject rate
  before a clipper joins its campaign.

Clippers should treat a brand's reject rate like a marketplace rating. The PRD and the UI need to say so.

**Edge case:** after a close, a reject sends the returned amount to the refund address with a reverting transfer. If
that address can't receive the token, the reject reverts, the flag auto-resolves as accepted, and the clipper is
paid. That fails toward the clipper, which is the safe direction.

### 8.4 Invariants added
`keeperLists` (the pay and flag lists match clip state exactly), `payoutsReachClippers` (Σ released equals what
the clippers hold), `flaggedNeverPaid` (a ghost flag: no transfer to a Flagged clip, ever), plus
watch-list rules for Flagged and swept clips. A coverage probe (4,000 random calls) confirmed the fuzzer reaches
releases, brand rejects after flags, auto-resolves, closes with later rejects, and sweeps.

### 8.5 Contract size: `CampaignVaultLens`
v1 pushed `CampaignVault` to 25,576 bytes, over the EIP-170 limit (24,576). Instead of dropping `optimizer_runs` to 1
(66 bytes of headroom and more gas on every call):
- the keeper views (`releasableClips`, `expiredFlags`, `expiredPending`, `sweepableClips`) and the pure `claimCode`
  moved to a new read-only `CampaignVaultLens`. It holds no funds, has no owner, and reads only the vault's public views;
- the vault exposes `keeperList(Watch | Pay | Flag, offset, limit)` (raw list pages) and `nextUnlockAt(clipId)`.

Result: **the vault is 24,353 bytes (223 under; 24,462 after the v1 audit fixes)**; the lens is 3.9 KB. No off-chain code called the moved functions:
web, the oracle and shared use the TypeScript `claimCode`, and the lens returns the same code as live campaign #1
(`CR-0E9A273285510A02`). The deploy script now deploys the lens and writes `lens` into `addresses.json`.
CI's size check now runs with `--skip test`: EIP-170 only applies to what we deploy, and the invariant harness is
the whole vault plus test helpers.

### 8.6 Still open
- Write the "an ended clip keeps its video" decision and the R-4 trust assumption into the PRD (it isn't in this repo).
- The UI should show each brand's reject rate (indexer: `Resolved` events per campaign brand).
- The headroom is small (114 bytes after the v1 audit fixes). Any further vault feature should move views to the lens first.
- v1 audit: `2026-10-06-vault-v1.md`.
- Pin `evm_version` (carried over from section 6).
