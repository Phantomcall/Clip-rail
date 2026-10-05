#!/bin/sh
# Runs a command with the env config.yaml interpolates. Real values come from the environment (Envio hosted
# service / .env); until Isaac deploys (H4/H6), placeholders keep codegen, typecheck and tests working.
export ENVIO_START_BLOCK_10143="${ENVIO_START_BLOCK_10143:-0}"
export ENVIO_VAULT_10143="${ENVIO_VAULT_10143:-0x0000000000000000000000000000000000000001}"
export ENVIO_REPUTATION_10143="${ENVIO_REPUTATION_10143:-0x0000000000000000000000000000000000000002}"
exec "$@"
