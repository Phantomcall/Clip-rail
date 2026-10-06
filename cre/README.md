# cre

Chainlink CRE oracle workflow (TypeScript). Owner: David. Playbook tasks D-2.1 onward.

On each tick the workflow reads `lastRound()` and `activeClips(0, maxClips)` from `CampaignVault`, fetches
view and like counts from the YouTube Data API (`videos.list`, 50 IDs per call), agrees on the result
across nodes, and writes `abi.encode(uint64 round, ClipUpdate[])` to the vault through the
KeystoneForwarder. Every payout rule runs on chain (PRD §5.2); the workflow only reports what YouTube says.

| File | What |
|---|---|
| `project.yaml` | Targets `testnet` (`monad-testnet`) and `mainnet` (`monad-mainnet`); RPCs from env |
| `secrets.yaml` | `YT_API_KEY` ← env `YT_API_KEY_ORACLE` |
| `oracle/main.ts` | CRE glue: cron trigger → EVM reads → HTTP in node mode → report → `writeReport` |
| `oracle/logic.ts` | Pure logic (flags, rounding, prioritising, encoding); unit-tested |
| `oracle/abi.ts` | Re-exports the generated vault ABI from `@cliprail/abi` |
| `oracle/config.*.json` | Schedule, vault address, batch size, gas plan per network |
| `scripts/oracle-loop.sh` | Run the simulator every 60 s from a laptop or VM |
| `../.github/workflows/oracle-runner.yml` | Run the simulator every 5 min from GitHub Actions |

## Run it

Prerequisites: the CRE CLI ≥ 1.30 (`curl -sSL https://app.chain.link/install.sh | bash`, then `cre login`),
[bun](https://bun.sh) ≥ 1.2.21 (CRE compiles TypeScript workflows with it), and `pnpm install` at the repo root.

```bash
cp cre/.env.example cre/.env      # fill in CRE_ETH_PRIVATE_KEY and YT_API_KEY_ORACLE
pnpm --filter @cliprail/cre-oracle test

cd cre
# Dry run: prints the report and gas limit, sends nothing
cre workflow simulate oracle --target testnet --non-interactive --trigger-index 0
# Real report through the mock forwarder (the oracle key pays gas)
cre workflow simulate oracle --target testnet --broadcast --non-interactive --trigger-index 0
```

`oracle/config.<net>.json` holds the vault address (testnet v1: `0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf`; source of truth is `packages/abi/addresses.json`).

**Only the pinned oracle wallet can broadcast.** The mock forwarder is open to anyone, so the vault checks
`tx.origin == reportTransmitter` (testnet: `0x5eF544B1A110CEe1ecbe9DAAA8e578Ad90b8779d`). `CRE_ETH_PRIVATE_KEY`
must be that wallet's key (from Bitwarden) and the wallet needs testnet MON; reports from any other key revert.

### Scheduled runner

`oracle-runner.yml` runs every 5 minutes for each network whose repo variable is on
(`ORACLE_TESTNET_ENABLED` / `ORACLE_MAINNET_ENABLED` = `true`). It needs these GitHub secrets:
`CRE_API_KEY` (headless CLI auth), `CRE_ETH_PRIVATE_KEY`, `YT_API_KEY_ORACLE`, and optionally
`MONAD_TESTNET_RPC` / `MONAD_MAINNET_RPC`. Runs for one network never overlap.

## Consensus decision (D-2.3)

**Identical aggregation on rounded counts.** `consensusMedianAggregation` works on a single number and
`ConsensusAggregationByFields` on an object with fixed keys; neither fits a variable-length list of clips.
So each node fetches YouTube, rounds views **down to the nearest 50** and likes **down to the nearest 5**,
builds the full update list, and returns it as one canonical string; `consensusIdenticalAggregation` then
requires the nodes to agree on it exactly.

- Nodes call YouTube seconds apart, and the rounding absorbs small differences between their answers.
- If a count crosses a rounding step between two nodes' calls, consensus fails and the run is retried on
  the next tick. Nothing wrong is ever written.
- The rounding withholds at most 49 views and 4 likes per clip per report; they are paid on a later report.
- `round = lastRound + 1`, read at the last finalized block, so every node computes the same round and the
  vault rejects stale or replayed reports.

In simulation there is one node, so consensus always agrees; the design matters once deployed.

## Report rules in the workflow (D-2.4, D-2.5)

- `OWNERSHIP_OK` when the description contains the clipper's claim code (`@cliprail/shared/claim`, the
  same function the UI and the vault use).
- `UNAVAILABLE` when YouTube doesn't return the video, or it isn't public, or isn't processed.
- Hidden like counts count as 0, so the on-chain like floor marks the clip suspect.
- `activeClips(offset, limit)` skips flagged clips and closed or empty campaigns, so a page can be short. The
  workflow reads `watchListLength()` and pages 100 entries at a time (at most 12 pages: CRE allows 15 EVM
  reads per run, two of which are `lastRound` and `watchListLength`).
- Active clips with no change since the last report are skipped. Pending clips are always sent, so the vault
  can activate them or reject them after 48 h.
- Gas limit = `gasBase + gasPerEntry × n` (start: 150k + 60k × n), capped at 9.5M. At most 155 entries fit;
  if more clips changed, status changes go first, then the biggest view gains, and the rest wait one round.
- A failed YouTube batch fails the whole run instead of marking its clips unavailable.

## Limits and quota

- CRE allows 15 HTTP calls per run: `maxClips / batch` must stay ≤ 14 (500 / 50 = 10).
- Each response must be under 250 KB. Requests ask only for the fields we use (`fields=` filter).
- YouTube: 1 quota unit per `videos.list` call, 10,000 units a day per project. Simulator every 5 min with
  500 clips: 10 calls × 288 runs = 2,880 units/day per network. A deployed DON multiplies this by its node
  count, so deployed runs are every 10 minutes.

## Open items

- The vault ABI comes from `@cliprail/abi` (Isaac's ABI v0), so a changed `activeClips` row or `lastRound`
  signature fails the typecheck. `logic.test.ts` checks `ClipStatus` against the Solidity enum.
- The vault's report processing and `activeClips` are still stubs in ABI v0 (I-1.4); the first real
  report needs the testnet deploy (H4 / H6).
- `oracle/fixtures/videos.json` is hand-written in the YouTube response shape. Replace it with a real saved
  response once the oracle key exists.
- Deploy order once CRE access is approved: see playbook D-4.1.
