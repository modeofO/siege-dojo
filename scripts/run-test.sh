#!/usr/bin/env bash
# Run test-reveal.js with the current Katana dev accounts
set -euo pipefail

cd "$(dirname "$0")"

# Katana dev accounts (seed 0, katana 1.7.0)
export SIEGE_ACC0_ADDRESS="0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec"
export SIEGE_ACC0_PK="0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912"
export SIEGE_ACC1_ADDRESS="0x13d9ee239f33fea4f8785b9e3870ade909e20a9599ae7cd62c1c292b73af1b7"
export SIEGE_ACC1_PK="0x1c9053c053edf324aec366a34c6901b1095b07af69495bffec7d7fe21effb1b"
export SIEGE_ACC2_ADDRESS="0x17cc6ca902ed4e8baa8463a7009ff18cc294fa85a94b4ce6ac30a9ebd6057c7"
export SIEGE_ACC2_PK="0x14d6672dcb4b77ca36a887e9a11cd9d637d5012468175829e9c6e770c61642"
export SIEGE_ACC3_ADDRESS="0x2af9427c5a277474c079a1283c880ee8a6f0f8fbf73ce969c08d88befec1bba"
export SIEGE_ACC3_PK="0x1800000000300000180000000000030000000000003006001800006600"

# Contract addresses from current deployment
export ACTIONS_ADDRESS="0x02e7aaec86013c6f4719227f995b91bb935571eb48ae11fed039cd4345ba0d2b"
export COMMIT_REVEAL_ADDRESS="0x06c61d75ff72a9b5ccf82cd78b48777f3486d10e8077cf9456a6feff0a0273c8"

export STARKNET_RPC_URL="http://localhost:5050"

npx tsx test-reveal.js
