# ops

Cloudflare Worker: relayer, YouTube preview and keeper (PRD §5.5, playbook I-3.1 to I-3.4). Owner: Isaac.
The relayer wallet is also the keeper. It only ever pays gas; it never holds or approves user funds.

| Endpoint / job | What it does |
|---|---|
| `GET /health` | Network, chain id, block, vault and lens, relayer address and MON balance. 503 if the RPC is down or the network has no deployment. |
| `GET /yt/preview?id=&code=` | `{videoId, title, channel, thumb, views, likes, publishedAt, durationSec, public, codeFound}` from YouTube `videos.list`, cached 60 s. Live and unverified; the oracle is what pays. 404 if YouTube doesn't know the video. |
| `POST /relay/register` | `{campaignId, videoId, clipper, nonce, deadline, sig}` → `registerClipWithSig`. Checks: body, deadline, signature (EOA or ERC-1271), nonce = `vault.nonces(clipper)`, 20 per clipper per day, then the same three checks the clip page shows: the Short is public, its description has the clipper's claim code, and it was published after the campaign started. Then simulation. Returns `{txHash}`. |
| `POST /relay/payout-address` | `{clipper, payout, nonce, deadline, sig}` → `setPayoutAddressWithSig`. Same checks, minus the video, and only for known clippers (below). |
| `POST /relay/transfer` | `{from, to, value, validAfter, validBefore, nonce, sig}` → USDC `transferWithAuthorization` (EIP-3009). Only the network's USDC, only for known clippers. |
| `POST /sandbox/fund` | Testnet only. `{address}` → 0.1 MON, then 1,000 MockUSDC, so a judge can create a campaign (~0.031 MON of gas each); returns `{txHash}` (the mint). Fresh accounts only (no transactions, under 0.05 MON); once per address; 10 per IP and 40 in total per UTC day; never below a 1 MON relayer reserve (503). The MON is sent at most once: if its receipt is slow the judge is told it's on its way, and pressing again later only mints. Monad's reserve balance means a MON transfer from a wallet under 10 MON must be its first transaction in 3 blocks, so the sandbox waits for such a moment. |
| cron every 5 min | Keeper: `release` (batches of 25), `autoResolve` expired flags, `expirePending` (in worker mode only for clips the oracle has checked, below), `sweep` closed campaigns; pings Envio. |
| cron 1 min later, and after each `/relay/register` | The view oracle, by `ORACLE_MODE` (below). |

Errors are `{error}` with a sentence the UI can show: 400 for anything the user can fix (bad signature, used nonce,
video not public, or the vault's own revert such as `TierTooLow`), 429 for rate limits, 502 for RPC or YouTube trouble.

## Rules worth knowing

- **Gas.** Monad charges the limit, so every send has an explicit one: relays use estimate × 1.15 and are refused
  above a cap (register 400k, payout and transfer 200k). That cap stops an account whose signature check burns gas
  (an EIP-7702 delegate, audit V1-11) from draining the relayer. `release` uses `1.1 × (110k + 225k × n)` from
  `docs/gas.md`.
- **Simulate first.** Nothing is sent unless `eth_call` succeeds, so a request that would revert costs no gas.
- **Rate limits.** Per IP: 5 relays, and 30 previews or health checks, per minute. All IPs together: 20 relays per
  minute (Workers rate-limiting binding, no KV). Per address: 20 relays of each kind per UTC day (KV, counted only
  when something is sent; KV is eventually consistent, so treat it as a soft limit).
- **Known clippers only** for payout-address changes and send-outs (403 otherwise): the vault nonce is above 0
  (registered through the relayer) or the reputation contract has seen them (paid or rejected). These calls have
  no on-chain precondition, so without this, fresh throwaway addresses could drain the relayer. Registration needs
  no gate: it already needs a public Short carrying the clipper's claim code.
- **Release gas** grows with each clip's matured tranches (`_pay` reads up to 200 per call, ~1.5k gas each), and
  batches are packed under 8M gas. A flat per-clip limit ran out of gas after a flag or an outage left many matured.
- **Keeper safety.** It is safe to run twice: each call is simulated, so work another run already did is skipped.
  A clip whose payout fails (`ReleaseFailed`) backs off for 1 h, 2 h, 4 h, up to 24 h (audit V1-7). At most 8
  transactions per run.
- **Nonces.** Relays and the keeper share one wallet, so two sends can pick the same nonce. Monad rejects the second
  with `Missing or invalid parameters` ("An existing transaction had higher priority"), not "nonce too low", so a
  relay retries any send error up to 4 times with a fresh nonce after a short random wait (5 simultaneous relays on
  testnet all landed). A keeper send that loses the race stops, and the next run picks the work up.
- **Free-plan budget (we stay on it).** CPU, 10 ms per request: the key is only loaded when something is signed
  (reads use the public `RELAYER_ADDRESS`), and noble's secp256k1 table uses a 4-bit window, which cut a cold key
  load from ~70 ms to ~14 ms. Measured live: health 2–8 ms, preview 4 ms, refused relays 7–16 ms, a cold register 40
  ms, an idle keeper run ~28 ms (a cold isolate every 5 minutes). Everything has run `ok` so far, but a cold isolate
  can't get under 10 ms. Watch **Metrics → Errors** for "Exceeded CPU Time Limits". 50 subrequests per run: reads are batched, transactions are signed locally (one request
  each) and receipts are read once. 1,000 KV writes a day: relays write one counter each, the keeper writes only
  when a payout fails (all back-offs live in one key).
- **Bodies** over 16 KB get 413; RPC failures on reads get 502.
- **CORS** allows `WEB_ORIGINS` only (production, Vercel previews of this project, localhost). CORS doesn't protect
  anything by itself; the checks above do.
- Addresses come from `packages/abi/addresses.json`. Redeploy the Worker after that file changes.

## Oracle mode

`ORACLE_MODE` in `wrangler.toml` picks who sends view reports. It's one setting so two runners can never both be on:
they share the oracle wallet, and both would send the same round (the second one wastes its gas).

| Mode | What runs | Needs |
|---|---|---|
| `worker` | The Worker is the oracle: the fallback while Chainlink CRE deploy access is pending (the CRE CLI can't log in headless without it). It runs the CRE workflow's own decision logic, `cre/oracle/logic.ts` (imported, not copied), and sends the report through the testnet mock forwarder from the oracle wallet. The testnet vault accepts that: its forwarder is the mock and it only checks `tx.origin == reportTransmitter`. | `ORACLE_ADDRESS` var; `ORACLE_PK` and `YT_API_KEY_ORACLE` secrets |
| `github` | The Worker starts `oracle-runner.yml` (the CRE simulator in GitHub Actions) with `workflow_dispatch`. | `ORACLE_DISPATCH_TOKEN` secret, and `ORACLE_TESTNET_ENABLED=true` in the repo's variables |
| `off` (or anything else) | Nothing. | |

Worker mode, each run:

- Reads `lastRound`, `reportTransmitter` and the vault's watch list at one block, then YouTube in batches of 50.
- Refuses to send if `reportTransmitter` isn't `ORACLE_ADDRESS`. The forwarder would swallow the refusal and the gas would still be spent.
- **Nothing changed:** sends nothing. Otherwise it sends one report of up to 35 entries with gas 200k + 265k per
  entry, the same plan as `cre/oracle/config.testnet.json` (a test checks they match). Monad charges the limit:
  about 0.047 MON for one entry.
- **Confirms the report landed** from the receipt's `ReportProcessed` event and `lastRound`. It logs `applied`, a lost
  race (another runner sent that round first) or `NOT applied` (an error, often out of gas).
- **Each send gets a fresh execution id.** The forwarder refuses one it has already seen. The workflow name in the
  report header is `cr-worker`, so Worker reports can be told apart on chain.
- **Skips while another runner is active.** If `lastRound` moved and the Worker didn't move it, another runner is
  live: for example David's CRE simulator loop, which uses the same key. The Worker then skips for
  `ORACLE_SKIP_SECONDS` (default 240).
- **Debounces registrations.** A register-triggered run is skipped if the Worker oracle ran in the last 2 minutes.
- **Keeper guard.** In worker mode the keeper only expires a Pending clip if a clean Worker oracle run read the
  chain after the clip was registered. An oracle outage leaves clips Pending; it never turns them into rejections.
- **State** is one KV value (`oracle-state:testnet`), written only when the round changes or a clip is Pending.
- **`/health`** shows `oracleMode`, the oracle wallet and its balance, `lastRound` and `oracleCheckedAt`.

Turning on worker mode (the person who holds the oracle key types it; it never goes in chat or a file):

```bash
cd ops
npx wrangler secret put ORACLE_PK            # the oracle wallet key (ORACLE_ADDRESS in wrangler.toml)
npx wrangler secret put YT_API_KEY_ORACLE    # the oracle's own YouTube key, not the preview one
pnpm run deploy                              # with ORACLE_MODE = "worker"
curl https://cliprail-ops-testnet.<account>.workers.dev/health   # oracleMode "worker"
npx wrangler tail                            # "worker oracle (cron) …" every 5 minutes
```

Rehearse first on a fork. Point the forked vault at a throwaway key, so the real key stays out of it:

```bash
anvil --fork-url https://testnet-rpc.monad.xyz --port 8551 --auto-impersonate --network monad
PK=$(cast keccak "worker-oracle-rehearsal"); ADDR=$(cast wallet address --private-key $PK)
cast rpc anvil_setBalance $ADDR 0x56BC75E2D63100000 --rpc-url http://127.0.0.1:8551
cast send 0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf "setReportTransmitter(address)" $ADDR \
  --from 0xC7e501C18846080439131E31Ad5D4b56f7bcA0F0 --unlocked --rpc-url http://127.0.0.1:8551 --gas-limit 100000
# env file (outside the repo): RELAYER_PK=<anvil key>, ORACLE_PK=$PK, ORACLE_ADDRESS=$ADDR,
#   RPC_URL=http://127.0.0.1:8551, YT_API_KEY_ORACLE=<a YouTube key>
npx wrangler dev --port 8788 --test-scheduled --env-file <that file>
curl "localhost:8788/__scheduled?cron=1-59/5+*+*+*+*"   # then read lastRound on the fork
```

## Setup

Wrangler runs on Node. If Node can't reach Cloudflare (`ETIMEDOUT` on a network without working IPv6), set
`NODE_OPTIONS=--dns-result-order=ipv4first`.

```bash
pnpm install
cd ops
npx wrangler login
npx wrangler kv namespace create RATE            # put the id in wrangler.toml
npx wrangler secret put RELAYER_PK               # relayer wallet key; never commit it
#                                                  and set RELAYER_ADDRESS in wrangler.toml to its address
npx wrangler secret put YT_API_KEY_PREVIEW       # the preview key, not the oracle's
pnpm run deploy                                  # testnet → https://cliprail-ops-testnet.<account>.workers.dev
curl https://cliprail-ops-testnet.<account>.workers.dev/health
```

Mainnet: not used. Cliprail runs on testnet only; the `env.mainnet` block in `wrangler.toml` is kept for
reference and must not be deployed (it has no KV, secrets or relayer address).

Logs: `npx wrangler tail` (each keeper run and each Worker oracle run logs one summary line).

## Local run against a fork

```bash
anvil --fork-url https://testnet-rpc.monad.xyz --port 8551 --auto-impersonate --network monad
cp .dev.vars.example .dev.vars   # RELAYER_PK = an anvil test key, never the real one
npx wrangler dev --test-scheduled --var RPC_URL:http://127.0.0.1:8551
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"   # run the keeper once
```

Test clippers need fresh keys: the well-known anvil addresses carry EIP-7702 code on Monad testnet, so their
signatures are checked through that code and fail, on chain and here.

## Tests

`pnpm test` covers the pure rules in `src/logic.ts`: body validation, gas, the preview shape (checked against
`web/lib/youtube.ts`), back-off, rate-limit keys, CORS and revert messages.
