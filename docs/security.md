# Security

How Cliprail's contracts protect escrowed money, what they trust, and what is still open. Detailed findings and
tests: `docs/audit/2026-10-05-vault-core.md` (vault core, v0) and `docs/audit/2026-10-06-vault-v1.md` (v1, two
reviews). Incident response: `docs/runbooks/oracle-key-compromise.md`.

## What the contracts guarantee
Each guarantee is enforced by code and checked by a test or invariant (12 invariants, 10,000+ fuzz runs in CI, fork
tests on live Monad testnet):

| Guarantee | Enforced by | Checked by |
|---|---|---|
| A brand's money only leaves the vault to its clippers, the brand, or the brand's chosen refund address | No owner withdrawal function exists; every transfer is in `_pay`, `_close`, `_reject` | `conservation`, `moneyModel` invariants |
| A campaign never pays more than its budget, and a clip never earns more than `maxPerClip` | `_accrue` caps by free budget and clip room | `campaignAccounting`, `clipCaps`; `Budget_ExhaustedAcross20Clips`, `PerClipCap_ExactBoundary` |
| The vault always holds every unpaid budget | Accounting in `_pay` / `_close` / `_reject` | `solvent` invariant |
| Matured earnings can't be clawed back; a brand can only freeze earnings still in hold | `flag` pays the matured part first (V1-1) | `Flag_PaysMaturedTranchesFirst`, fork test |
| A flagged clip is never paid | `_release` status check | `flaggedNeverPaid` invariant |
| One bad payout address can't block other clippers | Non-reverting transfer with exact rollback (R-1) | `Release_BlacklistedPayoutDoesNotBlockBatch`, fork test with Circle's real blacklist |
| A brand that can't receive tokens can still close and get its refund | `closeCampaignTo` (R-2) | fork test |
| Only the oracle's reports count | Forwarder check plus `tx.origin` pin on the mock forwarder; workflow identity on production (C-1, H-4) | `C1_*`, `H4_*`, `ForgedReportsChangeNothing` (fork) |
| Payouts, closes and flags keep working while paused | No `whenNotPaused` on money-out paths | `Release_WorksWhilePaused`, `Close_WorksWhilePaused` |

## Trust assumptions
| Who | Trusted for | Limits |
|---|---|---|
| **Oracle** (CRE workflow; `reportTransmitter` wallet on the mock forwarder) | Reporting true view and like counts and ownership | Per-report velocity cap, `maxPerClip`, budgets, like floor, the hold window (brands can flag), guardian pause. A leaked key can book forged earnings for attacker clips up to these limits: see the runbook (V1-10). |
| **Forwarder** | Delivering reports | Testnet and the simulation use Chainlink's permissionless mock: anyone can call it, so the vault only accepts reports broadcast by the pinned oracle wallet. Production: the KeystoneForwarder (DON-signed) plus the expected workflow owner and ID. Reports fail closed if neither is configured. |
| **Brand** | Judging its own flags (R-4) | One flag per clip, only on earnings still in hold, decided before the deadline (silence = accept), each brand counts once in reputation, and every reject is public (`Resolved`). |
| **Relayer** (ops Worker) | Paying gas only | It can't forge a clipper's signature (EIP-712 with nonce and deadline) and never holds or approves funds. Worst case it stops relaying; clippers can still call `registerClip` themselves. Its own MON is protected by: simulation before every send, a gas cap per call, 5 relays a minute per IP and 20 overall, 20 per address per day, registration only for public Shorts carrying the clipper's claim code, and payout-address changes and send-outs only for known clippers (vault nonce > 0 or reputation `firstSeen` > 0). Its key lives only in a Cloudflare secret and the local keystore. |
| **Keeper** | Liveness only | `release`, `autoResolve`, `sweep` and `expirePending` can be called by anyone. A dead keeper delays payouts but can't redirect them. The ops Worker's keeper runs every 5 minutes, simulates each call, and sizes release gas by matured tranches. |

## Owner and guardian powers
Cliprail runs on **Monad testnet only** (decided 2026-10-09: no budget for mainnet MON). There the owner of both
contracts and the vault's guardian are the deployer wallet (`docs/wallets.md`; checked on chain 2026-10-09). The
deploy script also supports the setup we'd use for real funds: the owner is a `TimelockController` with a 24 h delay,
only a team multisig can propose, anyone can execute after the delay, and the deployer keeps no role. That setup was
rehearsed on a mainnet fork but is not deployed.

| Power | Who | What it can't do |
|---|---|---|
| `setPaused(true)` | Guardian or owner, **no delay** | Stop payouts, closes or flags |
| `setPaused(false)` | Owner | — |
| `setTokenAllowed` | Owner | Affect existing campaigns: payouts and closes ignore the list |
| `setReportTransmitter`, `setForwarderAddress`, `setExpectedAuthor` / `WorkflowId` / `WorkflowName` | Owner | Move money. It *does* decide whose reports count, so it's as sensitive as the oracle key. |
| `setGuardian` | Owner | — |
| `Reputation.addVault` / `removeVault` | Owner | Edit anyone's stats directly. An added vault can write stats, and `addVault` only accepts a vault linked to this Reputation. |

**There is no function that lets the owner take escrowed tokens, change a campaign's rules, or upgrade the code.**

## Fraud model limits
These attacks are bounded but not prevented:
- **Bought views** that pass the like floor: limited by the velocity cap and `maxPerClip`; brands flag during the
  hold.
- **Sybil clippers:** each clip is capped; pending registrations are capped at 3 per clipper per campaign; and the
  relayer only registers public Shorts that carry the clipper's claim code, with per-IP, global and per-address
  limits. A sybil still needs a real YouTube Short per clip. The E2 trust score (Nansen) is the planned extra signal.
- **Self-funded tier raising** (V1-4): a clipper funds their own campaign. It still needs real views; `stats.brands`
  shows it.
- **Tier 2 mixes units:** `rejections` counts brands but is divided by clips plus rejections. That's acceptable for
  now and noted for the PRD.

## Known issues and decisions (all documented in the v1 audit)
| ID | Issue | Status |
|---|---|---|
| V1-10 | A pause doesn't stop forged tranches booked before it | Runbook chosen |
| V1-11 | `SignatureChecker` (OZ 5.1) validates any address with code only through ERC-1271. That includes EOAs with an EIP-7702 delegation, which is live on Monad. If the delegate lacks ERC-1271, the user can't use gasless registration or set a payout address. It fails closed and no funds are at risk. | Fix in the next contract build (not deployed): try ECDSA first, then ERC-1271. The ops Worker's signature pre-check must change the same way. |
| Review #14-1 | `Resolved(accept)` doesn't say whether the clip went back to Active or Ended | Indexer reads `getClip`; the event gets the status in the next contract build |
| V1-9 | 114 bytes of EIP-170 headroom | Proposed for the next contract build: move `activeClips` to the lens |

## Static analysis (I-4.3)
Both analysers run on `contracts/src` (mocks and the vendored Chainlink receiver excluded). CI runs Slither on every
PR and fails on any medium or high finding. Re-run on 2026-10-09: **no high or medium findings**; every remaining
finding is listed here with why it's acceptable.

**Slither 0.11.6** (`slither.config.json`; the `timestamp` detector is off: holds, flag windows and timeouts are
minutes to days, so validators' few seconds of timestamp drift don't matter). Two lines carry an inline suppression
with a reason: `tx-origin` (the oracle-wallet pin, C-1) and `divide-before-multiply` (paid views after a capped
amount round down, so reputation is never over-credited).

| Finding (low) | Where | Why it's acceptable |
|---|---|---|
| `calls-loop` (7) | `release` paying each clip; the lens's to-do lists | The vault's loop only calls allowed tokens and our own reputation contract; a failed transfer is skipped (R-1) and reputation is in `try/catch`, so one clip can't block a batch. The keeper sends at most 25 clips per call. The lens loops are read-only views. |
| `reentrancy-benign` (2) | `_pay`, `createCampaignWithPermit` | Both entry points are `nonReentrant`. `_pay` writes its accounting before the transfer and only tidies the pay list after it. The permit call happens before `_createCampaign` checks the token is allowed, so an unknown token reverts the whole call. |
| `missing-zero-check` (2) | `setReportTransmitter`, `setGuardian` | Zero is a deliberate setting: no transmitter pin means "use the workflow identity" (and reports fail closed if that isn't set either); no guardian means only the owner can pause. Both are owner-only and emit an event. |
| `shadowing-local` (1) | `ICampaignVault.setGuardian(guardian)` | The interface's parameter name shadows the `guardian()` getter. Cosmetic. |

**Aderyn 0.6.8**: the high findings and L-8 are the ones explained in the v1 audit (§7.6), still at the same single
places; the other lows are explained here for the first time.

| Finding | Why it's acceptable |
|---|---|
| H-1 reentrancy in `Reputation.addVault` | The external call is a view (STATICCALL) and the function is owner-only. |
| H-2 `tx.origin` | Deliberate: the mock forwarder is permissionless, so the oracle wallet is pinned by `tx.origin` (C-1). |
| H-3 unsafe cast (`uint64(views)` in `_pay`) | Views are bounded by real YouTube counts, far below `uint64`. |
| L-1 centralization | The owner powers in the table above. None can move escrowed funds. |
| L-2 costly loop, L-7 uninitialized local | The same bounded loops; counters start at zero on purpose. |
| L-3 / L-4 numeric literals | Basis points (`10_000`) and per-1,000-views maths, written inline for readability. |
| L-5 `PUSH0`, L-9 floating pragma | `foundry.toml` pins solc 0.8.28; the deployed bytecode runs on Monad testnet, which supports `PUSH0`. |
| L-6 address set without checks | Same as `missing-zero-check` above. |
| L-8 raw `transfer` call | Deliberate (R-1): return data is handled like SafeERC20, but a failure is skipped instead of reverting the batch. |

## Decisions
| Date | Decision |
|---|---|
| 2026-10-07 (I-1.6) | Monad USDC (testnet `0x534b…43A3`, mainnet `0x7547…b603`) supports both `permit` (EIP-2612) and `transferWithAuthorization` (EIP-3009); re-checked on both chains on 2026-10-09. Gasless campaign creation with a permit (E4) is possible, and the ops Worker's gasless send-out (`/relay/transfer`) uses EIP-3009 on testnet. |
| 2026-10-09 (I-5.2) | No redeploy needed. Nothing that puts funds at risk has turned up since v1; the known issues above go into the next contract build. |
| 2026-10-09 | Testnet only. Mainnet is dropped: with Monad charging the full gas limit, the oracle and keeper would cost hundreds of MON over the judging period, and there is no budget for it. |

## What we'd audit next
1. **An independent third-party review before any deployment that holds real funds.** Both audits so far were
   internal, and the contracts only run on testnet.
2. The production forwarder path end to end, once CRE deploy access is approved (H10, I-5.3).
3. The ops Worker beyond our internal audit (PR #17: release gas, Monad nonce races, KV and CPU budgets, relayer
   drain): an outside look at the relayer's abuse limits and key handling.
4. The next build's changes (event status, the signature-check order, the `activeClips` move), re-run through the
   same mutation, money-model and fork-test suite.
5. Formal verification of the accounting invariants (e.g. with Halmos), since they are small and self-contained.
