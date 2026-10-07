# Gas (vault v1)

**How measured:** real transactions on a fork of Monad testnet (anvil `--network monad`, 2026-10-06), against a fresh
v1 deploy, with reports sent through the real Chainlink MockKeystoneForwarder (`0xB9F7…D192`) from the oracle wallet.
Numbers are `gasUsed` for the **whole transaction**, so the forwarder's own overhead is included. Every report was
checked to have landed: `lastRound()` went up.

**Monad charges the gas limit, not the gas used.** Over-provisioning costs real MON on mainnet, so use the formulas
below instead of a large flat limit. Never rely on `eth_estimateGas` for reports: the mock forwarder catches the
vault's failure, so the estimate finds a limit at which the *outer* transaction succeeds while the vault ran out of
gas.

## Oracle reports (`MockKeystoneForwarder.report` → `vault.onReport`)

| Clips in the report | First report (activates and pays the first tranche) | Routine report | Routine, after a payout (clip rejoins the pay list) |
|---|---|---|---|
| 1 | 395,126 | 185,218 | — |
| 10 | 2,489,205 | 997,325 | — |
| 50 | 12,030,885 | 4,606,685 | 6,523,273 |

- **Worst case per clip:** about 238,500 gas (activation plus first tranche plus joining the pay list), on top of about
  157,000 base.
- **Margin:** the smallest limit that lands a 50-clip report is 1.031 × gas used. The forwarder only passes 63/64 of the
  remaining gas to the vault, so a limit at exactly the gas used is not enough.
- **Formula (worst case + 10%):** `gasLimit = 200,000 + 265,000 × n`, capped at 9,500,000, so **at most 35 clips per
  report**. This fits the oracle's existing `gasBase` / `gasPerEntry` / `gasCap` plan; `maxEntries` follows
  automatically.
- **Oracle config:** David's `cre/oracle/config.*.json` uses this plan since PR #15. The earlier `150,000 + 60,000 × n`
  was below the routine cost for 3 or more clips and below any first report, so those reports would have been
  silently dropped. First broadcast on testnet (3 activations): limit 995,000, and the report landed.

## Keeper: `release(clipIds)` (sent directly, no forwarder)

| Clips in the batch | First payout to each clip (Reputation records the clip and brand for the first time) | Repeat payout |
|---|---|---|
| 1 | 327,459 | 216,975 |
| 10 | 2,432,883 | 1,328,043 |
| 50 | 11,258,323 | 5,726,123 |

- **Per clip:** about 220,000 gas for a first payout and about 110,000 for a repeat, on top of about 110,000 base.
- **Per matured tranche:** `_pay` reads every matured tranche of a clip (up to 200 per release), about 1,550 gas each.
  Fork, 2026-10-08: one clip with 5 matured tranches 251,389; one clip with 60: 336,548. A clip can hold many matured
  tranches after a flag resolves or a keeper outage, so a flat per-clip limit is not enough.
- **Formula (ops Worker keeper):** `gasLimit = 1.1 × (110,000 + Σ (225,000 + 2,000 × (tranches − 1)))`, where
  `tranches` is the clip's matured, unpaid count (capped at 200). Batches hold at most **25** clips and **8M** gas. With
  one tranche per clip this is `1.1 × (110,000 + 225,000 × n)`: about 6.3M for 25. The keeper reads `getTranches` and
  `getClip` to count them.
- **Don't use `eth_estimateGas` for release:** a failed transfer is caught (`ReleaseFailed`), so an estimate can land on
  a limit where the transfer itself runs out of gas and the payout silently fails.
- A clip whose payout fails (`ReleaseFailed`) costs about as much as a repeat payout. The keeper backs off on it: 1 h,
  2 h, 4 h, up to 24 h (audit V1-7).

## Relayer

| Call | Gas used | Suggested limit |
|---|---|---|
| `registerClipWithSig` (fresh clipper, plain EOA signature) | 276,337 | 320,000 (estimate × 1.15) |
| `registerClip` (direct, for comparison) | 225,945 | — |
| `setPayoutAddressWithSig` (live testnet, through the ops Worker) | — | 126,882 (estimate × 1.15) |

The ops Worker uses estimate × 1.15 and refuses anything above a cap: register 400k, payout-address and USDC
transfer 200k. On Monad the limit is what you pay, so the live receipts show gas used = limit.

Always simulate before sending. A wallet with EIP-7702 code is checked through its own code (ERC-1271), and a hostile
delegate can burn the whole limit. On the fork, a delegated test address burned 24.6M before reverting (audit V1-11).
Simulation catches this, so nothing is sent; the cap bounds what a delegate that behaves differently on chain can
burn.

## What each action costs (testnet gas price 102 gwei, 2026-10-08)
| Action | Limit | MON |
|---|---|---|
| Gasless registration | ~320k | ~0.033 |
| Gasless payout-address change | ~127k | ~0.013 |
| Keeper release, 1 clip / 25 clips | 368.5k / 6.3M | ~0.038 / ~0.64 |
| Oracle report, 1 / 35 clips | 465k / 9.475M | ~0.047 / ~0.97 |

The keeper costs nothing when there's nothing to do: it only sends when the lens lists work.

## Reproduce
```bash
anvil --fork-url https://testnet-rpc.monad.xyz --port 8551 --auto-impersonate --network monad
ORACLE_ADDRESS=0xe96307086A533Eb4A1eD71AB48b382bD53f129B9 WRITE_ADDRESSES=false \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8551 --unlocked \
  --sender 0xC7e501c18846080439131e31ad5d4b56f7bca0f0 --broadcast --network monad
```
Then send reports through the forwarder with an explicit `--gas-limit`, and read each `gasUsed` from the receipt. A
local deploy rewrites `contracts/broadcast/*/10143/run-latest.json`, so back it up first.
