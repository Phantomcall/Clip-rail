# Cliprail

**Get paid for every verified view.** Brands lock a clipping budget in escrow on Monad. Clippers post YouTube Shorts with a
claim code, a Chainlink CRE workflow verifies real view and like counts, and clippers are paid in USDC per verified view
after a short fraud hold. Every payout builds an onchain reputation the clipper owns.

> "Most platforms ask you to trust a view count. We made the view count pay, and the payment is the proof."

Built for **Monad Metropolis** · Track 03 (Social, Attention & Culture).

| | |
|---|---|
| Demo video | _link (≤ 3 min), added Oct 12_ |
| Live app | _link_ |
| Judge sandbox | _link_/try (testnet, no wallet or gas needed) |
| Live testnet campaign | _link_ |

## The problem

Clipping is a real and growing creator economy: platforms pay clippers tens of thousands of dollars a day, and much of
the workforce is in Nigeria and India. It runs on trust that breaks on both sides:

- **Clippers** wait weeks for payouts marked "upcoming", lose out when budgets run dry before their views are verified,
  and get rejected after their views are already in.
- **Brands** pay for bot views and can't see the rules or the money flow.

## How it works

1. **A brand funds a campaign**: budget, rate per 1,000 views, per-clip cap, like-ratio floor, velocity cap, hold window.
   The budget is locked in the `CampaignVault` contract before anyone posts.
2. **A clipper registers a Short**: they sign in with a passkey (Mera), get a claim code, put it in the Short's
   description and paste the link. Registration is a signed message; our relayer pays the gas.
3. **Chainlink CRE verifies views**: on a schedule, the workflow reads active clips, fetches view/like counts from the
   YouTube Data API with oracle consensus, checks the claim code and publish date, and writes a report onchain.
4. **The vault pays per verified view**: rules run onchain (views only go up, velocity cap, like floor, per-clip cap,
   budget never overdrawn). Earnings are reserved immediately and released after the hold window; the brand can flag a
   clip during the window. A keeper pushes payouts, so clippers never need gas.
5. **Reputation**: every payout updates `CreatorReputation`, which only the vault can write. Tiers gate premium campaigns.

## Architecture

```
Brand (passkey) ──createCampaign──▶ CampaignVault ◀──onReport── KeystoneForwarder ◀── CRE workflow (cron)
Clipper (passkey) ─EIP-712 sig─▶ ops Worker (relayer) ─registerClipWithSig─┘    reads activeClips()     YouTube Data API
                                ops Worker (keeper) ──release()────────────┘    └── CreatorReputation
Envio HyperIndex ◀── events (receipts, payouts, flags) ── Next.js app reads GraphQL; writes via viem + Mera
```

## Why Monad

- Sub-second finality makes many small accruals and payouts per oracle round practical.
- Cheap transactions let us pay clippers per verified view instead of batching monthly.
- Mera passkeys give clippers a real account with no app, seed phrase or extension.
- Chainlink CRE supports Monad, so view verification is a CRE workflow a decentralized oracle network can run.

## Repo

| Path | What |
|---|---|
| `contracts/` | Foundry: `CampaignVault`, `CreatorReputation`, `MockUSDC` |
| `cre/` | Chainlink CRE oracle workflow (TypeScript) |
| `ops/` | Cloudflare Worker: relayer, YouTube preview, keeper, sandbox |
| `indexer/` | Envio HyperIndex schema and handlers |
| `web/` | Next.js app |
| `packages/shared` | Claim code, link parsing, EIP-712 types (shared by web, ops and CRE) |
| `packages/abi` | ABIs and deployed addresses |

## Contracts

**Monad testnet (10143), v1** (deployed at block 68749763). Source of truth: `packages/abi/addresses.json`.

| Contract | Address |
|---|---|
| CampaignVault | [`0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf`](https://testnet.monadvision.com/address/0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf) |
| CampaignVaultLens | [`0x6f8d90BD1D58c592876391Db01db780b69A64938`](https://testnet.monadvision.com/address/0x6f8d90BD1D58c592876391Db01db780b69A64938) |
| CreatorReputation | [`0x5c38812Ec071dEcd89aB2c433f3ddB94E1731913`](https://testnet.monadvision.com/address/0x5c38812Ec071dEcd89aB2c433f3ddB94E1731913) |
| MockUSDC | [`0x92cE6862a977Fe61D966C3903e8E5f5d7d84a7ec`](https://testnet.monadvision.com/address/0x92cE6862a977Fe61D966C3903e8E5f5d7d84a7ec) |

The v0 vault (`0xf9B2…Af45`) is retired: its release and close were stubs, so it can no longer pay out.

Cliprail runs on Monad testnet only: with Monad charging the full gas limit, the oracle and keeper would cost more
mainnet MON than we have (decision log in `docs/security.md`).

## Oracle (Chainlink CRE)

The CRE workflow pages the vault's active clips, fetches YouTube metadata in batches of 50, and produces a canonical
report of rounded view and like counts. Nodes must agree on that entire report before it is written onchain. Rounding
absorbs small timing differences between YouTube API calls; a disagreement writes nothing and is retried next round.

- Claim-code ownership, public visibility, publish time and unavailable videos are checked before a report is built.
- Views are rounded down to 50 and likes to 5. Active clips with unchanged counts are skipped; pending clips are always
  reported so they can activate or expire.
- The workflow caps reports at 35 entries under the measured v1 gas plan. Status changes are prioritised before the
  largest view gains.
- A successful forwarder transaction alone is not treated as proof: the workflow verifies that `lastRound()` advanced,
  because the testnet mock forwarder can swallow a vault revert.

Run `pnpm --filter @cliprail/cre-oracle test` for pure workflow logic tests. A broadcast additionally needs the CRE
credentials, an oracle key and a funded network wallet; those values are never stored in this repository.

## Accounts and gasless design

Cliprail uses a Mera passkey to create a deterministic signing account without a seed phrase or browser extension. The
derived key lives only in memory; passkey metadata is stored locally so a returning user can unlock the same account.

Clippers sign EIP-712 messages for clip registration, payout-address changes and USDC send-outs. The relayer checks and
submits those messages, so clippers do not need MON for gas. Brands fund a campaign from their own account. Production
passkey support is designed for iPhone Safari and Chrome with Google Password Manager; unsupported PRF/passkey setups
receive an explicit browser guidance message.

## Indexer (Envio)

Envio HyperIndex 3 mirrors `CampaignVault` and `CreatorReputation` into the entities in `indexer/schema.graphql`: Campaign,
Clip, Clipper, Receipt (one per `ViewsVerified` event), Payout, Flag, Totals and DailyStat. It powers every read-only
screen: the campaign feed and pages, clipper dashboard, brand console, profiles, leaderboard and landing-page totals.

- **Handlers** (`indexer/src/handlers/`) keep the same books as the vault. Paid views use the vault's tranche formula, so
  a capped payout never credits more views than it paid for; only a brand reject counts against a clipper's reputation.
- **Live screens:** with `NEXT_PUBLIC_ENVIO_GRAPHQL_URL` set, dashboards poll every 4 s and server pages re-render every
  5 s while open. Clip titles come from YouTube's public oEmbed; money and view counts only ever come from the chain.
- **Tests** (`indexer/test/`) replay simulated event sequences through Envio's test indexer: the capped-payout worked
  example and a flag → reject → release → payout lifecycle.
- **Testnet v1** defaults: start block `68749763` (the Reputation deploy; the vault followed 10 blocks later).

## Fraud model and limits

The protocol is deliberately rule-based rather than claiming to identify every bot. A report must find the clipper's
claim code in the Short description. The vault only pays views that increase, respects the campaign's velocity cap,
requires its like-ratio floor, and never lets a clip exceed its per-clip cap or the campaign exceed its escrow.

Earnings stay in a hold window before release. A brand may flag a clip once while there are earnings still in hold;
matured earnings are released first. An unresolved flag auto-accepts after its deadline, and a rejected amount returns
to the campaign budget. Brand reject history is indexed and shown before a clipper joins a campaign. This limits common
fraud and dispute paths, but does not prove that all organic-looking attention is human; oracle, YouTube availability
and relayer operations remain explicit trust assumptions.

## Live campaign results

_Clippers, verified views, USDC paid, payout transaction links: added Oct 11._

## Run locally

```bash
# This machine needs IPv4-first networking for npm:
export NODE_OPTIONS="--dns-result-order=ipv4first --network-family-autoselection-attempt-timeout=5000"
pnpm install                             # CI uses pnpm 11
pnpm test                                # shared, oracle and indexer tests
pnpm --filter @cliprail/web dev          # http://localhost:3000
(cd contracts && forge test)             # contracts
# Mock signed-in session (no contracts needed):
NEXT_PUBLIC_MOCK_AUTH=clipper pnpm --filter @cliprail/web dev
```

Environment variables are listed in `.env.example`. With `NEXT_PUBLIC_ENVIO_GRAPHQL_URL` unset, the app runs on mock data.

## AI tool disclosure

Required by Metropolis Rules §4.1.4. _To be completed before submission: list each AI tool used and what it was used for._

## Prior work

None. All code in this repository was written during the Metropolis build window (Oct 3–13, 2026).

## Team

Isaac (contracts, backend) · David (accounts, oracle) · Patrick (product, indexer, growth)

## Roadmap

TikTok, Instagram and X support · advances against pending verified earnings · yield on escrowed budgets · payouts to local
currency · agency accounts.

## License

MIT
