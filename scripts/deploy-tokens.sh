#!/usr/bin/env bash
# Deploy 6 ERC-20 resource token contracts to Sepolia
# Usage: bash scripts/deploy-tokens.sh
set -euo pipefail

# Resolution contract is the minter
MINTER="0x1b31a6098f1b9081e925e98cd9627c6a5cce39073e92c3f5bf827cb09abe36b"
RPC="https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8"

# Check env vars
: "${DOJO_ACCOUNT_ADDRESS:?Set DOJO_ACCOUNT_ADDRESS}"
: "${DOJO_PRIVATE_KEY:?Set DOJO_PRIVATE_KEY}"

# First, declare the class
echo "=== Declaring ResourceToken class ==="
CLASS_HASH=$(starkli declare \
  target/sepolia/siege_dojo_ResourceToken.contract_class.json \
  --rpc "$RPC" \
  --account-address "$DOJO_ACCOUNT_ADDRESS" \
  --private-key "$DOJO_PRIVATE_KEY" \
  2>&1 | grep -oE '0x[0-9a-fA-F]+' | tail -1)

echo "Class hash: $CLASS_HASH"

# Deploy 6 tokens
TOKENS=("Iron:IRON" "Linen:LINEN" "Stone:STONE" "Wood:WOOD" "Ember:EMBER" "Seeds:SEEDS")
declare -a ADDRESSES

for token in "${TOKENS[@]}"; do
  NAME="${token%%:*}"
  SYMBOL="${token##*:}"
  echo ""
  echo "=== Deploying $NAME ($SYMBOL) ==="

  ADDR=$(starkli deploy "$CLASS_HASH" \
    str:"$NAME" str:"$SYMBOL" "$MINTER" \
    --rpc "$RPC" \
    --account-address "$DOJO_ACCOUNT_ADDRESS" \
    --private-key "$DOJO_PRIVATE_KEY" \
    2>&1 | grep -oE '0x[0-9a-fA-F]+' | tail -1)

  echo "$NAME: $ADDR"
  ADDRESSES+=("$ADDR")
done

echo ""
echo "=== All tokens deployed ==="
echo "Iron:   ${ADDRESSES[0]}"
echo "Linen:  ${ADDRESSES[1]}"
echo "Stone:  ${ADDRESSES[2]}"
echo "Wood:   ${ADDRESSES[3]}"
echo "Ember:  ${ADDRESSES[4]}"
echo "Seeds:  ${ADDRESSES[5]}"

echo ""
echo "=== Set resource config ==="
echo "Run this sozo command to store token addresses:"
echo ""
echo "DOJO_ACCOUNT_ADDRESS=\"$DOJO_ACCOUNT_ADDRESS\" DOJO_PRIVATE_KEY=\"$DOJO_PRIVATE_KEY\" /tmp/sozo -P sepolia execute siege_dojo-actions_1v1 set_resource_config -c ${ADDRESSES[0]},${ADDRESSES[1]},${ADDRESSES[2]},${ADDRESSES[3]},${ADDRESSES[4]},${ADDRESSES[5]}"
