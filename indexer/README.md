# indexer

Envio HyperIndex 3 for Cliprail. Owner: Patrick (P-2.4, P-3.1, P-7.1).

Mirrors `CampaignVault` and `CreatorReputation` into the entities in `schema.graphql`, which the web app reads
through `web/lib/queries.ts` when `NEXT_PUBLIC_ENVIO_GRAPHQL_URL` is set.

| File | What |
|---|---|
| `config.yaml` | Chain 10143, both contracts, the events; addresses and start block from env |
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

| Var | Value |
|---|---|
| `ENVIO_VAULT_10143` | Vault address from `packages/abi/addresses.json` (Isaac's deploy, H4/H6) |
| `ENVIO_REPUTATION_10143` | Reputation address, same file |
| `ENVIO_START_BLOCK_10143` | The vault's deploy block |
| `ENVIO_RPC_URL_10143` | Optional RPC for the campaign-rules read (defaults to the public Monad RPC) |

Until the deploy, `scripts/with-env.sh` fills in placeholders so codegen, typecheck and tests run.

## Notes

- `Clipper.paidViews`, `Campaign.verifiedViews` and `Totals.verifiedViews` count views **actually paid**, using
  the vault's tranche formula: capped amounts pay fewer views than the event's `deltaViews`.
- Only a brand reject (`RejectReason.BrandRejected`) counts in `Clipper.rejections`. A missing claim code or a
  duplicate video doesn't.
- Production (P-7.1, Oct 10): add chain 143 to `config.yaml` and deploy one multichain indexer.
