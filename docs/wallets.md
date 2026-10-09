# Wallets (addresses only, never keys)

Plain EOAs (no EIP-7702 code), all on Monad testnet (10143). Cliprail runs on testnet only.

| Name | Purpose | Address | Key held by |
|---|---|---|---|
| cliprail-deployer | Deployed the contracts; vault owner and guardian | `0xC7e501C18846080439131E31Ad5D4b56f7bcA0F0` | Isaac (local keystore) |
| cliprail-relayer | Pays gas for gasless registration, payout-address changes and send-outs; also the keeper | `0xa8869100A6a1A4d134aF2A15600B49394beA04AF` | Isaac (local keystore `relayer`); Cloudflare secret `RELAYER_PK` |
| cliprail-oracle | Broadcasts CRE reports; the vault's pinned `reportTransmitter` | `0xe96307086A533Eb4A1eD71AB48b382bD53f129B9` | David only (`cre/.env`) |
| brand (Patrick, Mera) | Campaign brand account | | Patrick |

Checked on chain on 2026-10-08: the vault's `owner` and `guardian` are the deployer, and its `reportTransmitter` is
the oracle wallet.

## History
- `0x5eF544B1A110CEe1ecbe9DAAA8e578Ad90b8779d`: the first oracle wallet. Its key was never saved, so it was never
  used. On 2026-10-07 `setReportTransmitter` moved the vault to David's new wallet above.

## Rules
- Keys never go in git, chat, or tickets. The playbook's home for them is Bitwarden (collection "Cliprail").
- The oracle key stays with David; the relayer key exists only in the local keystore and the Worker's secret.
- If a key may have leaked, follow `docs/runbooks/oracle-key-compromise.md` (oracle). For the relayer, replace the
  Worker secret, update `RELAYER_ADDRESS` in `ops/wrangler.toml`, and move the MON. The relayer holds no user funds.
- Keep the relayer above 1 MON on testnet (the keeper logs a warning below that) and the oracle funded for its
  reports: per-action costs are in `docs/gas.md`.
- **Monad's reserve balance:** a transaction that sends MON *as value* reverts if the sender ends below 10 MON, unless
  it is the sender's first transaction in the last 3 blocks. Gas-only transactions are unaffected. Keep it in mind when
  topping up or moving MON between these wallets.
