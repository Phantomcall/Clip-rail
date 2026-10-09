# indexer

Envio HyperIndex 3 for Cliprail. Owner: Patrick (P-2.4, P-3.1, P-7.1).

Mirrors `CampaignVault` and `CreatorReputation` into the entities in `schema.graphql`, which the web app reads
through `web/lib/queries.ts` when `NEXT_PUBLIC_ENVIO_GRAPHQL_URL` is set.

| File | What |
|---|---|
| `config.yaml` | Chain 10143, both contracts, the events; testnet v1 addresses and start block by default |
| `abis/` | Copies of the two ABIs, written by `contracts/scripts/export-abi.sh` (CI checks they match) |
| `schema.graphql` | Campaign, Clip, Clipper, Receipt, Payout, Flag, Totals, DailyStat |
| `src/handlers/vault.ts` | One handler per vault event |
| `src/handlers/reputation.ts` | Clipper tier from `ReputationUpdated` |
| `src/effects.ts` | Reads `maxViewsPerReport` / `minLikeBps` once per campaign (not in `CampaignCreated`) |
| `test/vault.test.ts` | Simulated event sequences through Envio's test indexer |

## Commands

```bash
pnpm --filter @cliprail/indexer test        # codegen + handler tests (no chain, no database)
pnpm --filter @cliprail/indexer typecheck
pnpm --filter @cliprail/indexer dev         # local indexer + GraphQL on :8080 (needs Docker)
```

## Env

Nothing is required: `config.yaml` defaults to testnet v1 (vault `0x6D7A…BcAf`, reputation `0x5c38…1913`, start
block `68749763`). Every variable must start with `ENVIO_`.

| Var | Value |
|---|---|
| `ENVIO_API_TOKEN` | HyperSync token (envio.dev → API tokens). Needed locally and on Envio Cloud |
| `ENVIO_VAULT_10143`, `ENVIO_REPUTATION_10143`, `ENVIO_START_BLOCK_10143` | Overrides for a redeploy (`packages/abi/addresses.json`) |
| `ENVIO_RPC_URL_10143` | Optional RPC for the campaign-rules read (defaults to the public Monad RPC) |

## Deploy (Envio Cloud)

1. envio.dev → log in with GitHub → install the Envio Deployments app on `Phantomcall/Clip-rail`.
2. Add Indexer: root directory `indexer`, config file `config.yaml`, deployment branch `envio`.
3. Settings → Environment Variables: `ENVIO_API_TOKEN`.
4. Push `main` to the `envio` branch (`git push origin main:envio`); every push to it redeploys.
5. The dashboard shows the GraphQL endpoint: set it as `NEXT_PUBLIC_ENVIO_GRAPHQL_URL` in Vercel and redeploy.

The free tier allows 100k events and stops after 7 days without queries; keep the web app pointed at it.

## Notes

- `Clipper.paidViews`, `Campaign.verifiedViews` and `Totals.verifiedViews` count views **actually paid**, using
  the vault's tranche formula: capped amounts pay fewer views than the event's `deltaViews`.
- Only a brand reject (`RejectReason.BrandRejected`) counts in `Clipper.rejections`. A missing claim code or a
  duplicate video doesn't.
- Testnet only (`docs/security.md`, 2026-10-09): there is no mainnet chain to add.
