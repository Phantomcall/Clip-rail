#!/bin/sh
# Runs a command with the env config.yaml interpolates. Defaults are testnet v0 (packages/abi/addresses.json,
# PR #11: start block = the Reputation deploy, the vault followed 4 blocks later). Override them from the
# environment (Envio hosted service / .env) for a redeploy.
export ENVIO_START_BLOCK_10143="${ENVIO_START_BLOCK_10143:-68486852}"
export ENVIO_VAULT_10143="${ENVIO_VAULT_10143:-0xf9B2B301B94Aa534a872f0e54fAAAA319061Af45}"
export ENVIO_REPUTATION_10143="${ENVIO_REPUTATION_10143:-0x530E1171f7b49E20A567376671f3Fb72f8dcAc8d}"
exec "$@"
