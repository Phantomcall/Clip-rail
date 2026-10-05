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
