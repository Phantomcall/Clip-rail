# David's work log and handoff

Account layer (Mera passkeys), every write in the web app, `packages/shared`, the CRE oracle and its
runner, Vercel, CI. Task IDs are from `docs/prd/Cliprail-Task-Playbook.pdf` (DAVID section).
Newest entry first in the log at the bottom. **Update this file with every change.**

_Last updated: 2026-10-06 (testnet v1)._

## Where things stand

| Task | Status | Notes |
|---|---|---|
| D-0.1 YouTube API keys | Done | Two Google Cloud projects: `cliprail-oracle`, `cliprail-preview`. Keys only in `cre/.env` / Bitwarden. The first pair leaked and was revoked (see Incidents). |
| D-0.2 CRE CLI + deploy access | Requested | CLI v1.36 installed, `cre login` done. Access requested 2026-10-05, not yet approved. API keys for CI can only be created after approval. |
| D-0.3 Vercel | Done | Project `cliprail` (personal scope `chibey-maxs-projects`), root `web/`, live at https://cliprail.vercel.app. Not linked to GitHub; deploy with `vercel deploy --prod` from the repo root. |
| D-0.4 / D-1.6 Device matrix | Not started | Passkeys work on the live URL; fill `docs/device-matrix.md` per device. |
| D-1.1 to D-1.5 Web account layer | Done | Merged in PR #7. |
| D-2.1 to D-2.5 CRE workflow | Done | Merged in PR #7; ABI and v1 fixes in the `david/abi-v0-sync` PR. |
| D-3.1 First broadcast report | Blocked | Needs the oracle wallet private key in `cre/.env` and Isaac to register the 3 test Shorts. |
| D-3.2 Oracle runner | Done | `.github/workflows/oracle-runner.yml`, off until repo variables are set and `CRE_API_KEY` exists. |
| D-3.3 Write hooks | Done | create, register, send-out, set-payout. Flag/resolve/top-up/close/sandbox still mocked (D-5.1, D-6.3). |
| D-3.4 M1 full-loop test | Not started | Needs D-3.1 plus Isaac's ops Worker URL. |
| CI (extra) | Done | `.github/workflows/ci.yml` on every PR and push to main. Isaac extended it with forge fmt, 10k fuzz, ABI sync and Slither. |

## Branch state

- `main` has PR #7 (my Day 1–3 work + CI) and Isaac's/Patrick's #8–#14 (contracts, ABI, vault v1, lens,
  indexer, auth UI, mobile).
- **`david/abi-v0-sync` (PR open, rebased on main at `0f75ee5`)**:
  - Untracks `cre/oracle/.cre_build_tmp.js` (a 1 MB CLI artifact I committed by mistake in #7) and ignores it.
  - `ClipStatus` matches the Solidity enum (`None=0, Pending=1, Active=2…`); the old values were off by one and
    would have left new clips Pending forever. A test reads the enum from `ICampaignVault.sol` and fails on drift.
  - Oracle and web use Isaac's generated `campaignVaultAbi` from `@cliprail/abi`; typed vault reads.
  - Oracle pages `activeClips` until `offset >= watchListLength()` (100 per page, max 12 pages: CRE allows
    15 EVM reads per run).
  - `nonce` added to `/relay/register` and `/relay/payout-address` bodies (Isaac's request).
  - Oracle testnet config points at the **v1** vault.
  - This file.
- `backup/pre-key-scrub` (local only): old branch tip that still contains the revoked keys. Safe to delete.

## Testnet v1 (chain 10143)

Source of truth: `packages/abi/addresses.json`. v1 replaced v0 (`0xf9B2…Af45`) on 2026-10-06.

| What | Value |
|---|---|
| Vault | `0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf` |
| Lens (`claimCode` and other views moved here) | `0x6f8d90BD1D58c592876391Db01db780b69A64938` |
| Reputation | `0x5c38812Ec071dEcd89aB2c433f3ddB94E1731913` |
| MockUSDC | `0x92cE6862a977Fe61D966C3903e8E5f5d7d84a7ec` |
| Oracle wallet / `reportTransmitter` | `0x5eF544B1A110CEe1ecbe9DAAA8e578Ad90b8779d`, funded with 5 MON. Only this wallet's reports are accepted (vault checks `tx.origin`). |
| Brand / owner (Isaac) | `0xC7e501C18846080439131E31Ad5D4b56f7bcA0F0` |
| `pendingTimeout` | 600 s |
| Forwarder | testnet mock `0xB9F79d863261869B234c481D1f9A7af84AeAd192` |

Verified live on v1 (2026-10-06): the lens `claimCode` matches `@cliprail/shared`, the transmitter is the oracle
wallet, and a dry-run simulate reads `round 0 · 0 active clips` (no clips registered yet).

**Campaign #1 (v1):** MockUSDC, budget 1,000, $1 per 1k views, $20 per clip, 600 s hold, 0.5% like floor,
starts 2026-10-05 21:43 UTC. Claim code for Isaac's wallet: `CR-0E9A273285510A02`.

**Test Shorts** (channel Dev_Dave, all checked against the oracle rules through the YouTube API):
- https://youtube.com/shorts/GJcHrS4vWbc
- https://youtube.com/shorts/J0O7BJN1tmQ
- https://youtube.com/shorts/BQuUJ_-7VrU

They earn only after each has at least 50 views (counts are floored to 50) and 1 like per 200 views (like floor).

## How to resume

```bash
# tools: bun and the CRE CLI live in ~/.bun/bin and ~/.cre/bin (added to ~/.zshrc)
export NODE_OPTIONS="--dns-result-order=ipv4first --network-family-autoselection-attempt-timeout=5000"
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @cliprail/web build

# oracle: cre/.env needs CRE_ETH_PRIVATE_KEY (oracle wallet, no 0x) and YT_API_KEY_ORACLE
cd cre
cre workflow simulate oracle --target testnet --non-interactive --trigger-index 0              # dry run
cre workflow simulate oracle --target testnet --broadcast --non-interactive --trigger-index 0  # real report
```

Before the first broadcast, confirm the key in `cre/.env` derives to `0x5eF5…779d` (print the address only).

## Next steps

1. Get the `david/abi-v0-sync` PR reviewed and merged.
2. Oracle key from Bitwarden into `cre/.env`; Isaac registers the 3 Shorts; run the first broadcast (D-3.1)
   and check `ViewsVerified` on testnet.monadvision.com.
3. Get views and likes on the test Shorts so a report actually accrues.
4. When Isaac shares the ops Worker URL: `vercel env add NEXT_PUBLIC_OPS_URL production`, redeploy, M1 test (D-3.4).
5. Device matrix (D-0.4 / D-1.6) on the live URL.
6. When CRE approves deploy access: create the org API key, add GitHub secrets, set
   `ORACLE_TESTNET_ENABLED=true`, then follow D-4.1 for the deployed workflow.

## Heads-up for teammates

- `indexer/scripts/with-env.sh` still defaults `ENVIO_VAULT_10143` to the **v0** vault (`0xf9B2…Af45`).
  Patrick's file; mentioned in the PR rather than changed.

## Decisions

- **Key derivation:** passkey PRF → BIP-39 entropy → BIP-32 `m/44'/60'/0'/0/0`. Standard path, so the
  same account can be recovered in any wallet from the mnemonic.
- **Session:** key only in memory; wiped on sign-out and after 30 min hidden. After a reload the account is
  "locked" (address known, reads work) and the next write asks for the passkey once.
- **Consensus (D-2.3):** identical aggregation on counts floored to 50 views / 5 likes; nodes trim to one
  report's worth (155 entries) before consensus to stay under CRE's 25 KB observation limit.
- **Shared claim helpers** live in `@cliprail/shared/claim` because the CRE runtime (QuickJS) has no `URL` global.
- **Passkey domain** is `cliprail.vercel.app` (`NEXT_PUBLIC_RP_ID`, production only). Changing it breaks every account.

## Incidents and lessons

- **2026-10-05 – API keys pushed.** Real YouTube keys had been added to `.env.example`; I staged the whole
  file without reading the diff and pushed commit `9634e20`. GitHub secret scanning flagged it. Keys were
  revoked (confirmed dead, HTTP 400), new keys created, branch history rewritten. CI now fails on committed
  keys or `.env` files. **Rule: read every diff before committing; real values only in `cre/.env`.**
- **2026-10-06 – build artifact committed.** `cre/oracle/.cre_build_tmp.js` (1 MB, written by `cre workflow
  simulate`) went into #7 via `git add cre/oracle`. Untracked and ignored on `david/abi-v0-sync`.
- Gotchas: zsh treats `$F:t` as a path modifier (use `${F}`); ffmpeg reads stdin in scripts (use `-nostdin`);
  `node --experimental-strip-types` can't load `@cliprail/abi` (extensionless import), so use bun for ad-hoc scripts.

## Log

- **2026-10-06 (night)** – Committed `david/abi-v0-sync` in focused commits, rebased onto main (25 new commits incl.
  testnet v1), regenerated the lockfile, pointed the oracle at the v1 vault, re-verified live (claim code via lens,
  transmitter, dry run), opened the PR.

- **2026-10-06** – Verified the 3 test Shorts. Published clip 1 to YouTube via Studio (clips 2–3 uploaded by David).
  Removed the tracked CRE build artifact. Started this handoff file.
- **2026-10-05 (late)** – Synced main (Isaac's contracts, ABI v0, vault core). Fixed `ClipStatus`, added
  enum drift test, switched to the generated ABI, added `activeClips` paging and relay `nonce`s, set the
  testnet vault. Verified claim codes, EIP-712 domain and transmitter against the live vault.
- **2026-10-05** – PR #7 merged: Mera auth, chains, `sendTx`, balances, real write hooks, CRE oracle +
  tests, oracle runner, CI. Deployed to Vercel, installed bun + CRE CLI, `cre login` + access request.
  Key leak incident and cleanup.
