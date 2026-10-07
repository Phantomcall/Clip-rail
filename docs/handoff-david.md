# Handoff: David's workstream (account layer, write hooks, CRE oracle)

_Last updated: 2026-10-07, mid-task. Written so another agent or person can continue exactly where the previous
session stopped. Read sections 1–5 before touching anything; section 5 is the next action._

---

## 1. Read this first

- **You are working for David** (GitHub `Chibey-max`, email `ilorahdavid126@gmail.com` on commits). He is one of
  three people building **Cliprail** for the Monad Metropolis hackathon (Track 03).
- **Teammates:** Isaac (contracts, ops Worker/relayer, deploys) and Patrick (UI, Envio indexer, live campaign,
  demo). Patrick's GitHub account is `Phantomcall`, which also owns the repo.
- **Specs:** `docs/prd/Cliprail-PRD.pdf` (product) and `docs/prd/Cliprail-Task-Playbook.pdf` (day-by-day tasks;
  David's are `D-x.y`, handoffs are `H1`–`H14`). Extract with `pdftotext -layout <file> -`. These PDFs are
  **untracked on purpose** (the repo is public and they contain the budget); don't commit them unless David says so.
- **Timeline:** feature freeze Sun 2026-10-11 23:59 WAT; submission Tue 2026-10-13. Today is 2026-10-07 (Day 4).
- **David's ownership:** Mera passkey auth and sessions, every write in the web app, `packages/shared`, the CRE
  oracle workflow and its runner, the CRE deploy, Vercel deploys, the device matrix, CI (added by David, extended
  by Isaac). Extras later: E1 fingerprinting, E3 Hunyuan, E7 Aurora.

## 2. Working rules (David's standing instructions; follow exactly)

1. **Never add Claude/AI attribution** to commits, pushes or PRs: no `Co-Authored-By: Claude`, no
   "Generated with Claude Code". Plain messages only.
2. **Ask before committing or opening a PR** for new work. Then make **several focused commits**, not one bulk commit.
3. **Update this file after every change** (status, branch state, next steps, a dated log line). Never put secrets in it.
4. **Read every diff before staging.** Never `git add` a whole file or folder you haven't just reviewed. Scan staged
   diffs for secrets (pattern: `AIza[0-9A-Za-z_-]{35}`, PEM private keys, 64-hex values after `_PK=`/`PRIVATE_KEY=`).
   Two incidents happened from skipping this (section 13).
5. **Never print secret values.** When checking keys, print only derived addresses, balances or HTTP status.
6. **Merging to `main` needs a teammate review.** The auto-mode classifier blocks `gh pr merge` without review; don't
   work around it. David or a teammate merges.
7. Destructive git (history rewrite, force-push) only with David's explicit go-ahead.
8. Explain things plainly; David isn't always familiar with the tooling (he needed step-by-step help with Google
   Cloud keys, CRE login, Bitwarden).

## 3. Environment

- Repo: `/home/phantom-call/Projects/Hackathon/Clip-rail` (Linux, zsh). pnpm 11 workspace, Node 22.
- Remotes: `origin` = David's fork `Chibey-max/Clip-rail`; **`upstream` = team repo `Phantomcall/Clip-rail`**.
  The team pushes branches directly to `upstream` (`david/*`, `isaac/*`, `patrick/*`) and opens PRs into `upstream/main`.
  `gh` is logged in as Chibey-max with WRITE (not admin) on the team repo.
- Before npm/pnpm network commands on this machine:
  `export NODE_OPTIONS="--dns-result-order=ipv4first --network-family-autoselection-attempt-timeout=5000"`
- Tools installed by the previous session: **bun 1.4.2** (`~/.bun/bin`), **CRE CLI v1.36.0** (`~/.cre/bin`), both
  added to `~/.zshrc`; in a non-login shell prefix `export PATH="$HOME/.bun/bin:$HOME/.cre/bin:$PATH"`.
  Vercel CLI 61 is installed and logged in as `chibey-max`. ffmpeg is available.
- CRE: `cre login` done (David's account, org `org_7ShWYgklnm8VWwzA`). **Deploy access requested 2026-10-05, not
  approved yet.** API keys (needed for the GitHub runner) can only be created after approval.
- Secrets live in `cre/.env` (git-ignored; template `cre/.env.example`). Current state of `cre/.env`:
  `YT_API_KEY_ORACLE` set and working, `YT_API_KEY_PREVIEW` set and working (belongs in Isaac's Worker, harmless
  here), RPCs set, `CRE_ETH_PRIVATE_KEY` set locally for David's new oracle wallet
  `0xe96307086A533Eb4A1eD71AB48b382bD53f129B9`. Never print or share the private key.
- Untracked and intentionally left alone: `docs/prd/`, `.claude/settings.json` (David's local Claude Code permissions).
- Local-only branch `backup/pre-key-scrub` holds the old tip with the revoked keys; safe to delete
  (`git branch -D backup/pre-key-scrub`). `david/accounts-oracle` is merged (PR #7).

## 4. Current state snapshot

- **`upstream/main`** = `0f75ee5` (PR #14, vault v1). Merged PRs: #7 (David's Day 1–3 + CI), #8–#11, #14 (Isaac:
  contracts, ABI, vault core, testnet deploys), #12–#13 (Patrick: indexer, live data, auth UI, mobile, clip titles).
- **PR #15 OPEN**, branch `david/abi-v0-sync`, https://github.com/Phantomcall/Clip-rail/pull/15. All 5 CI checks
  green on its pushed tip `e0cbc4f`. Pushed commits:
  1. Stop tracking the CRE CLI build artifact (`cre/oracle/.cre_build_tmp.js`, now in `.gitignore`)
  2. Oracle: `ClipStatus` matches the vault enum (`None=0, Pending=1, Active=2, Flagged=3, Rejected=4, Ended=5`),
     with a test that parses `ICampaignVault.sol`
  3. Oracle: generated vault ABI (`@cliprail/abi`), typed reads, `activeClips` paging
  4. Web: generated vault ABI; `nonce` added to `/relay/register` and `/relay/payout-address` bodies
  5–8. Handoff log; oracle testnet config → v1 vault; handoff updates
- **Uncommitted on `david/abi-v0-sync` (not pushed; David hasn't yet approved committing them):**
  - `cre/oracle/config.testnet.json`, `config.mainnet.json`: `gasBase` `200000`, `gasPerEntry` `265000`
    (Isaac measured ~850k gas for a report that activates 3 clips on v1; the old 150k + 60k × n = 330k ran out of gas).
  - `cre/oracle/logic.ts`: `RECEIVER_REVERTED = 1` and `reportNotApplied(round, lastRoundAfter, receiverStatus)`.
  - `cre/oracle/main.ts`: after `writeReport`, if no tx hash (dry run) log and return; otherwise read `lastRound()`
    at `LATEST_BLOCK_NUMBER` and throw unless the receiver didn't revert and `lastRound == round`. `callVault` takes
    an optional block; `MAX_PAGES` 12 → 11 (15 EVM reads per run: lastRound + watchListLength + post-check + pages).
  - `cre/oracle/logic.test.ts`: tests for `reportNotApplied` and that both configs give 35 entries / 995k for 3 clips.
  - `cre/README.md`, this file.
  - Verified: oracle typecheck clean, **14 oracle tests pass**, `cre-compile` builds the WASM, dry run (below) OK.
  - Suggested commits when approved: (a) "Oracle: v1 gas plan (200k + 265k per entry)" = configs + config test;
    (b) "Oracle: fail the run if the vault didn't apply the report" = logic.ts, main.ts, reportNotApplied tests, README;
    (c) "Handoff log" = this file. Push to `upstream david/abi-v0-sync` (normal push; PR #15 updates).
- **First broadcast complete (2026-10-07 11:25 UTC):** `round 0 · 3 active clips`; clips 1–3 `views=0 likes=0
  flags=1` (claim code found); `report round=1 entries=3 gasLimit=995000`; applied in tx
  `0x20fb1dfde6ba91aadd4a2f5fc65e400236de7fb7e9d0b7621147358a476ecffe`. Confirmed on chain: `lastRound() == 1`,
  clips 1–3 are `Active` (`status == 2`) with `lastViews == 0`, `lastLikes == 0`, and no accrued earnings yet.
- **Live app:** https://cliprail.vercel.app (Vercel project `cliprail`, scope `chibey-maxs-projects`, root `web/`).
  Last deployed from David's local branch on 2026-10-05; **not linked to GitHub**, so it does NOT include anything
  merged since. Env: `NEXT_PUBLIC_NETWORK=testnet` (all envs), `NEXT_PUBLIC_RP_ID=cliprail.vercel.app` (production only).
  `NEXT_PUBLIC_OPS_URL` and `NEXT_PUBLIC_ENVIO_GRAPHQL_URL` not set yet.

## 5. Next action: get a non-zero accrual, then M1

The first real oracle broadcast is done. David generated a new oracle wallet locally because Isaac never saved the
original key; Isaac rotated `reportTransmitter` to David's address and the broadcast landed.

1. **Tell Isaac the broadcast result:**
   ```text
   First oracle broadcast landed.
   tx: 0x20fb1dfde6ba91aadd4a2f5fc65e400236de7fb7e9d0b7621147358a476ecffe
   gasLimit/gasUsed: 995000
   lastRound: 0 -> 1
   clips 1-3: Active, views=0, likes=0, accrued=0
   ```
2. **Get views/likes on the Shorts** so the next report accrues. They only earn once each has ≥ 50 views and passes
   the 0.5% like floor (at least 1 like per 200 views). Hidden likes count as zero.
3. **Run another dry run and broadcast** after the counts move:
   ```bash
   cre workflow simulate oracle --target testnet --non-interactive --trigger-index 0
   cre workflow simulate oracle --target testnet --broadcast --non-interactive --trigger-index 0
   ```
   Expect `round=2`. Confirm `lastRound() == 2` and that `ViewsVerified` events/clip accrual appear only if counts
   passed the like floor.
4. **M1 full-loop test (D-3.4)** once Isaac shares the ops Worker URL: create → gasless register → oracle report →
   accrue → release → USDC in clipper account. Then device matrix (D-0.4/D-1.6); runner on GitHub once CRE approves
   deploy access.

## 6. Testnet v1 (chain 10143)

Source of truth for addresses: `packages/abi/addresses.json`. v1 replaced v0 (`0xf9B2…Af45`, retired) on 2026-10-06.

| What | Value |
|---|---|
| CampaignVault | `0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf` |
| CampaignVaultLens (`claimCode` and other views moved here in v1) | `0x6f8d90BD1D58c592876391Db01db780b69A64938` |
| CreatorReputation | `0x5c38812Ec071dEcd89aB2c433f3ddB94E1731913` |
| MockUSDC | `0x92cE6862a977Fe61D966C3903e8E5f5d7d84a7ec` |
| Circle testnet USDC | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| Forwarder (mock, open to anyone) | `0xB9F79d863261869B234c481D1f9A7af84AeAd192` |
| Oracle wallet = `reportTransmitter` | `0xe96307086A533Eb4A1eD71AB48b382bD53f129B9`, funded by David. The vault rejects reports unless `tx.origin` is this wallet. The original `0x5eF544B1A110CEe1ecbe9DAAA8e578Ad90b8779d` key was never saved and has been replaced. |
| Isaac's wallet (owner, brand of campaign #1) | `0xC7e501C18846080439131E31Ad5D4b56f7bcA0F0` |
| `pendingTimeout` | 600 s (Pending clips without ownership are rejected after 10 min) |
| Mainnet (143) | not deployed; vault/reputation/lens null |

**Campaign #1:** MockUSDC, budget 1,000, cpm $1 per 1k views, maxPerClip $20, holdSecs 600, minLikeBps 50 (0.5%),
minTier 0, starts 2026-10-05 21:43:13 UTC, ends 2026-11-04. Claim code (campaign 1, Isaac's wallet):
**`CR-0E9A273285510A02`** (verified against the lens and `@cliprail/shared`).

**Registered clips (Pending, registered by Isaac from his wallet):** all on channel **Dev_Dave** (David's), 21 s
vertical generated clips, public, not made for kids, code in title and description, published after the campaign start:
- clip 1: https://youtube.com/shorts/GJcHrS4vWbc (published 2026-10-06 20:55 UTC)
- clip 2: https://youtube.com/shorts/J0O7BJN1tmQ (21:06 UTC)
- clip 3: https://youtube.com/shorts/BQuUJ_-7VrU (21:08 UTC)

They **activate** on the first report but only **earn** once each has ≥ 50 views (the oracle floors views to 50) and
≥ 1 like per 200 views (0.5% floor; 0 likes with views = SuspectReport, no pay). Source clip files were in the
previous session's temp scratchpad and may be gone; regenerate with ffmpeg if needed.

## 7. Contracts and interfaces this work depends on

- Report (PRD §5.2): `abi.encode(uint64 round, ClipUpdate[] u)`, `ClipUpdate {uint256 clipId; uint64 views;
  uint64 likes; uint64 publishedAt; uint8 flags}`, flags `1 = OWNERSHIP_OK`, `2 = UNAVAILABLE`. `round` must be
  `> lastRound`.
- `activeClips(offset, limit)` → `ActiveClip {clipId, campaignId, clipper, videoId, status (uint8), lastViews,
  lastLikes}`. It walks `limit` watch-list entries and **skips** flagged clips and closed/empty campaigns, so pages
  can be short: page until `offset >= watchListLength()`.
- `ClipStatus`: `None 0, Pending 1, Active 2, Flagged 3, Rejected 4, Ended 5`.
- Claim code: `"CR-" + upper(hex(keccak256(abi.encodePacked(uint256 campaignId, address clipper))))[2:18]`
  (16 hex chars since an audit fix). Vectors: `(1, 0x1111…1111) = CR-F3A32C19D9D554E9`,
  `(42, 0x…dEaD) = CR-BD9D77C0603F18F8`. Implemented in `packages/shared/src/claim.ts` (`@cliprail/shared/claim`).
- EIP-712 domain `{name: "Cliprail", version: "1", chainId, verifyingContract: vault}` (`cliprailDomain()` in shared);
  types `RegisterClip(uint256 campaignId,string videoId,address clipper,uint256 nonce,uint256 deadline)` and
  `SetPayout(address clipper,address payout,uint256 nonce,uint256 deadline)`; one `nonces(clipper)` counter for both.
  Verified: the v0 domain separator matched; v1 uses the same scheme.
- **Relayer API (Isaac's ops Worker, URL not shared yet):** POST bodies, all numbers as decimal strings; response
  `{txHash}` or `{error}`:
  - `/relay/register {campaignId, videoId, clipper, nonce, deadline, sig}`
  - `/relay/payout-address {clipper, payout, nonce, deadline, sig}`
  - `/relay/transfer {from, to, value, validAfter, validBefore, nonce, sig}` (USDC EIP-3009
    `TransferWithAuthorization`; domain read from USDC `name()`/`version()`)
  - `/sandbox/fund` (testnet; not wired yet)
- Isaac's gas measurements: report activating 3 clips ≈ 850k gas. He mentioned a `docs/gas.md` table; it was not on
  any pushed branch as of 2026-10-07.

## 8. CRE oracle (`cre/`)

Files: `project.yaml` (targets `testnet`/`mainnet`, RPCs `${MONAD_TESTNET_RPC}`/`${MONAD_MAINNET_RPC}`),
`secrets.yaml` (`YT_API_KEY` ← env `YT_API_KEY_ORACLE`), `oracle/workflow.yaml`, `oracle/main.ts` (CRE glue),
`oracle/logic.ts` (pure, unit-tested), `oracle/abi.ts` (re-exports `campaignVaultAbi`), `oracle/config.*.json`,
`oracle/fixtures/videos.json`, `scripts/oracle-loop.sh` (simulate + broadcast every 60 s), `README.md` (full detail).

Flow per tick: cron → `lastRound()` + `watchListLength()` + paged `activeClips()` (last finalized block) →
YouTube `videos.list` in batches of 50 (node mode, `fields=` filter) → `buildUpdates` (ownership code, unavailable,
floor views to 50 / likes to 5, skip unchanged Active clips, always send Pending) → `prioritize` to `maxEntries`
(35 with the v1 gas plan) inside node mode → `consensusIdenticalAggregation` on one canonical string →
`encodeReport(lastRound + 1, updates)` → `writeReport` with `gasLimit = gasBase + gasPerEntry × n` (cap 9.5M) →
(uncommitted) verify `lastRound` moved.

CRE limits that shaped the code: 15 HTTP calls/run, 15 EVM reads/run, 250 KB HTTP response, 25 KB consensus
observation, 50 KB report, 10M gas per write, cron ≥ 30 s. The `EVM ReceiverContractExecutionStatus` enum isn't
exported by the SDK (`SUCCESS=0, REVERTED=1`); `TxStatus` is (`FATAL=0, REVERTED=1, SUCCESS=2`).

Commands: `pnpm --filter @cliprail/cre-oracle test` (node strip-types), `… typecheck`,
`cd cre/oracle && bun x cre-compile main.ts /tmp/x.wasm`, simulate as in section 5. For a dry run without the
real key, pass `-e <env file>` with `CRE_ETH_PRIVATE_KEY` = `000…001` plus the real YouTube key.

Runner: `.github/workflows/oracle-runner.yml` every 5 min per network, gated by repo variables
`ORACLE_TESTNET_ENABLED` / `ORACLE_MAINNET_ENABLED` = `true`; needs GitHub secrets `CRE_API_KEY` (only after CRE
approval), `CRE_ETH_PRIVATE_KEY`, `YT_API_KEY_ORACLE`. Until approval, run `cre/scripts/oracle-loop.sh testnet` locally.

## 9. Web account layer and writes (`web/`)

- `lib/mera.ts`: passkey PRF (32 bytes) → BIP-39 entropy → seed → BIP-32 `m/44'/60'/0'/0/0` → Mera secp256k1
  signing session. Credential metadata (not secret) in `localStorage` `cliprail.accounts.v1`; rpId from
  `NEXT_PUBLIC_RP_ID` (fallback hostname). Error mapping: PRF unsupported → "Use iPhone Safari or Chrome with Google
  Password Manager", cancel → silent.
- `lib/auth.tsx`: `useAuth()` → `{address, handle, status: signed-out|signing-in|locked|signed-in, error, isMock,
  signUp, signIn, signOut, getAccount, mockAs?}`. Key only in memory; wiped on sign-out and after 30 min hidden;
  after reload the account is `locked` and `getAccount()` re-prompts the passkey once. `NEXT_PUBLIC_MOCK_AUTH=
  clipper|brand` keeps fake identities. Patrick added `handle` and a new account menu (`components/auth/SignInButton.tsx`).
- `lib/tx.ts`: `sendTx` = estimateGas × 1.15 as an explicit limit (Monad bills the limit), wait for receipt.
- `lib/chains.ts`, `lib/balances.ts` (`useBalances`, react-query, 15 s), `lib/relay.ts` (`postRelay`),
  `lib/abi.ts` (vault ABI re-export + ERC-20 fragment incl. FiatToken `version()`).
- `lib/actions.ts`: real `useCreateCampaign` (approve if needed → createCampaign), `useRegisterClip`, `useSendOut`,
  `useSetPayout` (sign → relay → wait). **Still mocked:** `useFlag`, `useResolve`, `useTopUp`, `useClose` (D-5.1),
  `useSandboxFund` (D-6.3). Verify v1 ABI signatures for these when implementing (v1 changed flag/resolve rules).

## 10. CI (`.github/workflows/ci.yml`)

Jobs: secret scan (fails on tracked `.env*` or key patterns), workspace typecheck/lint/test + web build, CRE oracle
WASM compile, forge fmt/build/test (ci profile, 10k fuzz) + ABI-in-sync check, Slither (fail on medium+).
Making these **required checks** needs a repo admin (Patrick) in Settings → Branches → main.

## 11. Task status (playbook D-tasks)

| Task | Status |
|---|---|
| D-0.1 YouTube keys | Done (second pair; first pair leaked and revoked) |
| D-0.2 CRE CLI + access | CLI + login done; access requested, pending |
| D-0.3 Vercel | Done (personal scope; not Git-linked) |
| D-0.4 / D-1.6 device matrix | Not started (`docs/device-matrix.md` empty) |
| D-1.1–D-1.5 web account layer | Done (PR #7) |
| D-2.1–D-2.5 oracle | Done (PR #7, fixes in PR #15 + uncommitted gas/check) |
| D-3.1 first broadcast | Next; blocked on oracle key |
| D-3.2 runner | Done; enable after CRE approval |
| D-3.3 write hooks | Done for create/register/send-out/payout |
| D-3.4 M1 | Needs D-3.1 + ops Worker URL |
| D-4.x mainnet oracle, D-5.x brand flows/send-out/device matrix | Not started |

## 12. Open coordination

- **Isaac:** first broadcast result to send:
  > First oracle broadcast landed. tx: `0x20fb1dfde6ba91aadd4a2f5fc65e400236de7fb7e9d0b7621147358a476ecffe`.
  > Gas was 995k for the 3 clips. Confirmed `lastRound()` 0→1 and clips 1–3 are Active (`status == 2`). Views and
  > likes are still 0, so no earnings yet.
- **Isaac owes:** ops Worker URL (`NEXT_PUBLIC_OPS_URL`), `docs/gas.md`.
- **Patrick:** `indexer/scripts/with-env.sh` defaults `ENVIO_VAULT_10143` to the retired v0 vault (flagged in PR #15).
  Patrick owns repo admin (required checks) and the Envio URL.
- **Vercel:** redeploy after merges (`vercel deploy --prod` from repo root) and add `NEXT_PUBLIC_OPS_URL` /
  `NEXT_PUBLIC_ENVIO_GRAPHQL_URL` when available. Keep the production domain `cliprail.vercel.app` (passkeys are bound to it).

## 13. Incidents, lessons, gotchas

- **2026-10-05, API keys pushed:** real YouTube keys had been put in `.env.example`; the whole file was staged and
  pushed (`9634e20`). GitHub secret scanning flagged it; keys revoked (confirmed HTTP 400), new keys made, branch
  history rewritten, CI secret scan added. Real values go only in `cre/.env`.
- **2026-10-06, build artifact committed:** `cre/oracle/.cre_build_tmp.js` (1 MB, written by `cre workflow simulate`)
  went into PR #7 via `git add cre/oracle`; untracked and ignored in PR #15.
- **Silent oracle failure:** the testnet mock forwarder swallows vault reverts, so `writeReport` returns success even
  when nothing changed. Always verify `lastRound()` (now automated, uncommitted).
- Gotchas: zsh treats `$F:t` as a path modifier (write `${F}`); ffmpeg in scripts needs `-nostdin`;
  `node --experimental-strip-types` can't import `@cliprail/abi` (extensionless import) — use bun for ad-hoc scripts;
  `git stash push` flags go before `--`; Vercel `link` appends `.env*` to `.gitignore` (revert it, it hides
  `.env.example`); `gh pr edit` fails on a Projects-classic deprecation — use
  `gh api -X PATCH repos/Phantomcall/Clip-rail/pulls/N -F body=@file`; the Chrome extension's element finder can hit
  usage limits — fall back to `read_page`.

## 14. Decisions

- Standard BIP-44 path so a passkey account can be recovered in any wallet.
- Identical-aggregation consensus on floored counts (D-2.3 rationale in `cre/README.md`).
- Oracle and web import the generated ABI so interface drift fails CI.
- Passkey domain `cliprail.vercel.app`, never to change after launch.

## 15. Log (newest first)

- **2026-10-07** – Isaac registered the 3 Shorts on v1 (clips 1–3, Pending) and flagged gas. Set 200k + 265k, added
  the post-write check, MAX_PAGES 11, tests (14 pass). Dry run on v1 OK. Uncommitted, awaiting David's approval.
  Rewrote this handoff for a full context transfer.
- **2026-10-07** – Isaac did not have the old oracle private key, so David generated a new local oracle wallet
  (`0xe96307086A533Eb4A1eD71AB48b382bD53f129B9`), funded it, and Isaac rotated `reportTransmitter`. First broadcast
  landed at `0x20fb1dfde6ba91aadd4a2f5fc65e400236de7fb7e9d0b7621147358a476ecffe`; `lastRound()` is 1 and clips 1–3
  are Active with 0 views/likes/accrual.
- **2026-10-06 (night)** – Committed and rebased `david/abi-v0-sync` onto main (25 new commits incl. v1), regenerated
  the lockfile, pointed the oracle at v1, re-verified live, opened PR #15 (CI green).
- **2026-10-06** – Generated 3 test clips with ffmpeg; uploaded clip 1 via YouTube Studio (browser automation),
  David uploaded clips 2–3; verified all 3 via the YouTube API. Removed the tracked build artifact.
- **2026-10-05 (late)** – Synced main (ABI v0, vault core): fixed `ClipStatus`, generated ABI, paging, relay
  nonces; verified claim codes, EIP-712 domain and transmitter on the live v0 vault.
- **2026-10-05** – PR #7 merged (auth, writes, oracle, runner, CI). Vercel deploy, bun + CRE CLI install, CRE login
  and access request, key-leak cleanup.
