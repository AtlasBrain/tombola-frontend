#!/usr/bin/env bash
set -euo pipefail

# ── required env vars ──────────────────────────────────────────────────────────
: "${TREASURY_ADDRESS:?Need TREASURY_ADDRESS (base58 pubkey from gen-treasury.mjs)}"
: "${PROGRAM_ID:?Need PROGRAM_ID (qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M)}"
# ────────────────────────────────────────────────────────────────────────────────

DEVNET="https://api.devnet.solana.com"
FAUCET_RESERVE="${FAUCET_RESERVE_SOL:-5000000}"

# Railway injects $PORT — default to 8080 if not set (local testing)
export NGINX_PORT="${PORT:-8080}"

echo "Starting solana-test-validator…"
echo "  Program ID : $PROGRAM_ID"
echo "  Treasury   : $TREASURY_ADDRESS"
echo "  nginx port : $NGINX_PORT"

# ── generate nginx config with the correct port ────────────────────────────────
# envsubst substitutes only ${NGINX_PORT}, leaving nginx's own $variables alone
envsubst '${NGINX_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# ── start validator ────────────────────────────────────────────────────────────
solana-test-validator \
    --reset \
    --bind-address 0.0.0.0 \
    --rpc-port 8899 \
    --ledger /data/ledger \
    --clone "$PROGRAM_ID" \
    --url "$DEVNET" \
    --quiet &
VALIDATOR_PID=$!

# ── wait for RPC ───────────────────────────────────────────────────────────────
echo "Waiting for validator RPC…"
for i in $(seq 1 60); do
    if solana cluster-version --url http://localhost:8899 >/dev/null 2>&1; then
        echo "Validator ready (${i}s)"
        break
    fi
    sleep 1
done

# ── fund treasury ──────────────────────────────────────────────────────────────
echo "Funding treasury with ${FAUCET_RESERVE} SOL…"
solana airdrop "$FAUCET_RESERVE" "$TREASURY_ADDRESS" \
    --url http://localhost:8899 \
    --commitment confirmed
echo "Treasury funded."

# ── start nginx ────────────────────────────────────────────────────────────────
nginx -g "daemon off;" &
NGINX_PID=$!

echo "Ready — RPC+WS on port $NGINX_PORT (proxy to :8899 / :8900)"

wait -n $VALIDATOR_PID $NGINX_PID
