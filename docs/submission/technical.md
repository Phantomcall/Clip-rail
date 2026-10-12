# Technical fields (I-9.4)

Draft for the submission form's technical fields and any bounty card that asks for addresses, transactions or how the
oracle works. Monad testnet only. Re-check every link on submission day (Oct 13); the oracle section is for David to
confirm (marked ✎).

**Network:** Monad testnet, chain id 10143. Explorer: https://testnet.monadvision.com

## Contracts (all verified on MonadVision and Monadscan)

| Contract | Address | What it does |
|---|---|---|
| CampaignVault | `0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf` | Escrow, clip registry, oracle reports, hold window, flags, payouts |
| CampaignVaultLens | `0x6f8d90BD1D58c592876391Db01db780b69A64938` | Read-only keeper lists and the claim code |
| CreatorReputation | `0x5c38812Ec071dEcd89aB2c433f3ddB94E1731913` | On-chain clipper reputation; only the vault writes |
| MockUSDC | `0x92cE6862a977Fe61D966C3903e8E5f5d7d84a7ec` | Test USDC for the judge sandbox (open mint, EIP-2612 permit) |

Deployed at blocks 68749763–68749789; deploy transactions and on-chain configuration in `docs/contracts.md`.
The vault also accepts Circle's testnet USDC (`0x534b2f3A21130d7a60830c2Df862319e593943A3`) and AUSD.

## Transactions that prove the flow

| Step | Transaction |
|---|---|
| Campaign #1 created: 1,000 MockUSDC in escrow | `0x50ed79c9b72d0a2019415634c087db7089eb6f72d675eb898ef347e3c83e8370` |
| First oracle report: three clips activated through Chainlink's forwarder (round 1) | `0x20fb1dfde6ba91aadd4a2f5fc65e400236de7fb7e9d0b7621147358a476ecffe` |
| First verified-view receipt (`ViewsVerified`): +50 views, $0.05 reserved (round 2) | `0x61e3eb1ba107e938235b81f9509f5f4c3ee53bc3f67bdc3514c2b4d2a585fd95` |
| First payout after the hold: $0.05 to the clipper | `0xf34675435d6f0cad1d9b4cb00206f4bf02fdb9897b27cee1487348fc6d1eaa4b` |
| Live campaign payouts | _fill on Oct 12–13 (I-9.3)_ |

## How the oracle works ✎

1. A Chainlink CRE workflow (`cre/oracle/`) runs on a cron trigger. It reads the vault's watch list
   (`activeClips`, paged) and `lastRound` from Monad.
2. It calls the YouTube Data API for each clip's views, likes, publish time, visibility and description, checks the
   clipper's claim code (`CR-` + 16 hex, derived from campaign id and clipper address), and rounds counts down (views
   to 50, likes to 5) so a DON's nodes reach identical consensus.
3. It encodes `(round = lastRound + 1, ClipUpdate[])` and writes it through Chainlink's forwarder to the vault's
   `onReport`. Only entries the vault acts on are sent: a Pending clip once its description has the claim code, an
   Active clip when its rounded views rose, and unavailable videos. A run with nothing to send sends nothing.
4. The vault applies every rule on chain: ownership and publish date activate a clip; views only go up; a per-report
   velocity cap, a like-ratio floor, a per-clip cap and the campaign budget limit what accrues; each accrual is a
   tranche released after the hold.
5. On testnet the workflow runs in the CRE simulator with `--broadcast` and reports through Chainlink's
   `MockKeystoneForwarder` (`0xB9F79d863261869B234c481D1f9A7af84AeAd192`); because that forwarder is open, the vault
   only accepts reports broadcast by the pinned oracle wallet `0xe96307086A533Eb4A1eD71AB48b382bD53f129B9`. With CRE
   deploy access the same workflow targets the DON-signed `KeystoneForwarder` and the vault pins the workflow ID and
   owner instead.
6. After each broadcast the workflow re-reads `lastRound` and fails the run if the report didn't land (the mock
   forwarder hides vault reverts).
7. Who runs it during judging: CRE deploy access is still pending, and without it the CRE CLI can't log in on a
   headless runner. So the always-on ops Worker runs the oracle every 5 minutes and right after each registration
   (`ORACLE_MODE=worker`). It imports the workflow's decision logic (`cre/oracle/logic.ts`: claim-code check,
   rounding, which entries to send, report encoding, gas plan) unchanged, and sends the report through the same mock
   forwarder from the same oracle wallet. Each Worker report carries the workflow name `cr-worker` in its header.
   The CRE simulator (`cre workflow simulate --broadcast`) remains the reference runner and can run alongside: the
   Worker backs off for 4 minutes after any round it didn't send. Once CRE deploy access is approved, the GitHub
   Actions runner takes over (`ORACLE_MODE=github`).

## Off-chain services

| Service | Where | Does |
|---|---|---|
| Ops Worker (Cloudflare) | https://cliprail-ops-testnet.cliprail-ops.workers.dev/health | Gasless relays (register, payout address, send-out), YouTube preview, judge sandbox funding, keeper (release, auto-resolve, expire, sweep) every 5 min |
| Indexer (Envio HyperIndex) | https://indexer.dev.hyperindex.xyz/238202f/v1/graphql | Every vault and reputation event for the app |
| App (Next.js, Vercel) | https://cliprail.vercel.app | Brand console, clipper flow, receipts, judge sandbox at `/try` |

Relayer wallet `0xa8869100A6a1A4d134aF2A15600B49394beA04AF` only pays gas: clippers sign EIP-712 requests (EOA or
ERC-1271 passkey accounts) and can always call the vault directly.

## Testing and security

12 invariants and 10,000 fuzz runs in CI, an adversarial suite, fork tests against the live testnet contracts and
Circle's USDC, `contracts/script/Smoke.s.sol` against the deployed contracts (20 checks pass), two internal audits
(`docs/audit/`), Slither in CI with no high or medium findings. Details: `docs/security.md`, gas: `docs/gas.md`.
