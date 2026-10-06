# indexer

Envio HyperIndex. Owner: Patrick.

- `schema.graphql`: entities for the app (done, P-2.4).
- Next: once ABI v0 lands (H3), run `pnpx envio init` → Contract Import → Local ABI (`packages/abi`), chain 10143, then write handlers in `src/EventHandlers.ts` updating these entities.
- Production (P-7.1, Oct 10): one multichain deployment indexing 143 and 10143.
