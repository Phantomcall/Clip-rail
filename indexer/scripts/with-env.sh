#!/bin/sh
# Runs a command with the env config.yaml interpolates. Defaults are testnet v1 (packages/abi/addresses.json,
# PR #14: start block = the Reputation deploy, the vault followed 10 blocks later). Override them from the
# environment (Envio hosted service / .env) for a redeploy.
export ENVIO_START_BLOCK_10143="${ENVIO_START_BLOCK_10143:-68749763}"
export ENVIO_VAULT_10143="${ENVIO_VAULT_10143:-0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf}"
export ENVIO_REPUTATION_10143="${ENVIO_REPUTATION_10143:-0x5c38812Ec071dEcd89aB2c433f3ddB94E1731913}"
exec "$@"
