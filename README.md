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
| Judge sandbox | _link_/judges (testnet, no wallet or gas needed) |
| Live mainnet campaign | _link_ |

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
- Chainlink CRE supports Monad mainnet, so verification runs through a decentralized oracle network.

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

**Monad testnet (10143), v1** (deployed at block 68749763). Source of truth: `packages/abi/addresses.json`. Source verification on MonadVision: pending.

| Contract | Address |
|---|---|
| CampaignVault | [`0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf`](https://testnet.monadvision.com/address/0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf) |
| CampaignVaultLens | [`0x6f8d90BD1D58c592876391Db01db780b69A64938`](https://testnet.monadvision.com/address/0x6f8d90BD1D58c592876391Db01db780b69A64938) |
| CreatorReputation | [`0x5c38812Ec071dEcd89aB2c433f3ddB94E1731913`](https://testnet.monadvision.com/address/0x5c38812Ec071dEcd89aB2c433f3ddB94E1731913) |
| MockUSDC | [`0x92cE6862a977Fe61D966C3903e8E5f5d7d84a7ec`](https://testnet.monadvision.com/address/0x92cE6862a977Fe61D966C3903e8E5f5d7d84a7ec) |

The v0 vault (`0xf9B2…Af45`) is retired: its release and close were stubs, so it can no longer pay out.

_Mainnet (143) addresses, function table and invariants: added by Isaac (I-8.3)._

## Oracle (Chainlink CRE)

_Flow, consensus approach, quota maths, simulator vs deployed, evidence: added by David (D-8.3)._

## Accounts and gasless design

_Mera account layer, relayer design, supported browsers: added by David (D-8.3)._

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
- **Testnet v0** defaults: start block `68486852` (the Reputation deploy; the vault followed 4 blocks later).

## Fraud model and limits

_Rules, what they stop, what they don't, security notes: added by Isaac (I-7.3)._

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
