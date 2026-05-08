#!/usr/bin/env bash
# Hard-reset the local Solana validator and re-init the Tombola program with
# test-friendly pool durations (Weekly closes in 10 minutes — countdown visibly
# ticks; the rest are 14d/21d/30d).
#
# Run from the frontend repo root:
#   ./scripts/reset-localnet.sh
#
# Optional env:
#   PHANTOM_ADDRESS=<base58>   address to airdrop 1M SOL to (default: skip)
#
# Requires: solana-cli, anchor binary, Node 22 via nvm, the companion repo
# checked out at ~/Desktop/Project Tombola, and yarn install already run there.

set -euo pipefail

# ---- paths + setup ----
COMPANION="${HOME}/Desktop/Project Tombola"
PROGRAM_SO="${COMPANION}/target/deploy/raffle.so"
LEDGER_DIR="${HOME}/.tombola-localnet"
RPC_URL="http://127.0.0.1:8899"
DEFAULT_PROGRAM_ID="qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M"

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"
# Activate Node 22 — Node 24 breaks the SDK's ESM imports.
# shellcheck disable=SC1090
source "${HOME}/.nvm/nvm.sh"
nvm use 22 >/dev/null

if [[ ! -f "${PROGRAM_SO}" ]]; then
  echo "error: program binary not found at ${PROGRAM_SO}" >&2
  echo "       run \`anchor build\` in the companion repo first." >&2
  exit 1
fi

# ---- 1. stop any running validator ----
echo "==> stopping any existing validator"
pkill -f "solana-test-validator" 2>/dev/null || true
sleep 2

# ---- 2. wipe ledger ----
echo "==> wiping ledger at ${LEDGER_DIR}"
rm -rf "${LEDGER_DIR}/test-ledger"
mkdir -p "${LEDGER_DIR}"

# ---- 3. start a fresh validator (background) ----
echo "==> starting solana-test-validator (logs: ${LEDGER_DIR}/validator.log)"
cd "${LEDGER_DIR}"
nohup solana-test-validator --reset --rpc-port 8899 \
  >"${LEDGER_DIR}/validator.log" 2>&1 &
VALIDATOR_PID=$!
echo "${VALIDATOR_PID}" >"${LEDGER_DIR}/validator.pid"

# Wait for RPC + WS both ready (scripts hang on WS race otherwise).
echo -n "==> waiting for RPC ready"
until solana cluster-version --url "${RPC_URL}" >/dev/null 2>&1; do
  echo -n "."
  sleep 1
done
echo -n " WS ready"
until nc -z 127.0.0.1 8900 2>/dev/null; do
  echo -n "."
  sleep 1
done
echo " ✓"
sleep 2 # extra buffer; deploy.ts opens WS too early otherwise

# ---- 4. configure CLI for localhost ----
solana config set --url "${RPC_URL}" >/dev/null

# ---- 5. deploy program ----
echo "==> deploying program"
solana program deploy --url "${RPC_URL}" "${PROGRAM_SO}" >/dev/null
echo "    program id: ${DEFAULT_PROGRAM_ID}"

# ---- 6. init protocol ----
# The companion repo's deploy.ts hits a WS-confirm flake on the local
# validator (the tx lands but sendAndConfirm throws on websocket abort).
# We don't care if the script exits non-zero — what matters is that the
# ProtocolConfig PDA exists on-chain. Verify post-hoc.
echo "==> initializing ProtocolConfig"
DEPLOYER="$(solana address)"
CONFIG_PDA="HNQSJmHby8GPnpf5pUfBc2YYcAjRBEvzVQTnn3pbsJex"
cd "${COMPANION}"
RAFFLE_TREASURY="${DEPLOYER}" \
  RAFFLE_VRF_ORACLE="${DEPLOYER}" \
  ./node_modules/.bin/tsx scripts/deploy.ts localnet >/dev/null 2>&1 || true

if ! solana account "${CONFIG_PDA}" --url "${RPC_URL}" >/dev/null 2>&1; then
  echo "    error: ProtocolConfig PDA still missing — deploy.ts didn't land."
  echo "    check ${LEDGER_DIR}/validator.log and the companion repo's setup."
  exit 1
fi
echo "    ProtocolConfig confirmed at ${CONFIG_PDA}"

# ---- 7. init pools with test durations ----
echo "==> initializing 4 public pools (Weekly 10min / Biweekly 14d / Triweekly 21d / Monthly 30d)"
cd - >/dev/null
npx tsx scripts/init_pools_local.mts

# ---- 8. (optional) airdrop to user wallet ----
if [[ -n "${PHANTOM_ADDRESS:-}" ]]; then
  echo "==> transferring 1,000,000 SOL to ${PHANTOM_ADDRESS}"
  solana transfer "${PHANTOM_ADDRESS}" 1000000 \
    --allow-unfunded-recipient \
    --url "${RPC_URL}" >/dev/null
  BALANCE="$(solana balance "${PHANTOM_ADDRESS}" --url "${RPC_URL}")"
  echo "    ${PHANTOM_ADDRESS}: ${BALANCE}"
fi

echo ""
echo "✓ reset complete. validator pid: ${VALIDATOR_PID}"
echo ""
echo "  Weekly pool will close in ~10 minutes — refresh the dapp to watch the"
echo "  countdown tick down."
echo ""
echo "  To stop the validator later:"
echo "    kill \$(cat ${LEDGER_DIR}/validator.pid)"
