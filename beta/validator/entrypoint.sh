#!/usr/bin/env bash
set -euo pipefail

# ── required env vars ──────────────────────────────────────────────────────────
: "${TREASURY_ADDRESS:?Need TREASURY_ADDRESS (base58 pubkey from gen-treasury.mjs)}"
: "${PROGRAM_ID:?Need PROGRAM_ID (qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M)}"
# ────────────────────────────────────────────────────────────────────────────────

DEVNET="https://api.devnet.solana.com"
FAUCET_RESERVE="${FAUCET_RESERVE_SOL:-5000000}"   # pre-fund treasury (5 million SOL)

echo "Starting solana-test-validator…"
echo "  Program ID : $PROGRAM_ID"
echo "  Treasury   : $TREASURY_ADDRESS"

# Clone the deployed Tombola program from devnet so testers can use the real contract.
# --reset wipes the ledger on each restart (clean state for every deploy).
solana-test-validator \
    --reset \
    --bind-address 0.0.0.0 \
    --rpc-port 8899 \
    --ledger /data/ledger \
    --clone "$PROGRAM_ID" \
    --url "$DEVNET" \
    --quiet &
VALIDATOR_PID=$!

# ── wait for RPC to be ready ───────────────────────────────────────────────────
echo "Waiting for validator RPC…"
for i in $(seq 1 60); do
    if solana cluster-version --url http://localhost:8899 >/dev/null 2>&1; then
        echo "Validator ready (${i}s)"
        break
    fi
    sleep 1
done

# ── fund the treasury from the built-in faucet ────────────────────────────────
# solana-test-validator has no airdrop limits — we can mint any amount.
echo "Funding treasury with ${FAUCET_RESERVE} SOL…"
solana airdrop "$FAUCET_RESERVE" "$TREASURY_ADDRESS" \
    --url http://localhost:8899 \
    --commitment confirmed
echo "Treasury funded."

# ── start nginx proxy ─────────────────────────────────────────────────────────
# HTTP RPC (8899) and WebSocket (8900) both exposed on port 80.
nginx -g "daemon off;" &
NGINX_PID=$!

echo "Ready — RPC + WS on port 80 (proxy to :8899 / :8900)"

# Keep running until any child exits
wait -n $VALIDATOR_PID $NGINX_PID
