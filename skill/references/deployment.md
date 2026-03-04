# Siege Deployment Reference

## Live URLs
| Service | URL |
|---------|-----|
| Katana (devnet) | https://siege-katana-production.up.railway.app |
| Torii indexer | https://siege-torii-production.up.railway.app |
| Torii GraphQL | https://siege-torii-production.up.railway.app/graphql |
| Torii SQL | https://siege-torii-production.up.railway.app/sql |
| Torii MCP | https://siege-torii-production.up.railway.app/mcp |

## Contract Addresses (Sepolia/Katana)
| Contract | Address |
|----------|---------|
| World | `0x064292a23c373a7924d98de184eccb8a7e6743e8545c8a20d9725dd4e1fc8205` |
| Actions | `0x12d4981543abf6fc60e5c4a8342863c8595d4cd6a7f661e958b95ca9da8fef2` |
| CommitReveal | `0xe16d296481697b59298a5c46437fb82712b7820f8f7b6eaad19700f681cecb` |
| Resolution | `0x7eb552a50df359a53d85d6e5e83a97ec853b7e9f644ec0e53e5c4e3f0654a67` |

## Railway Projects
- Katana: https://railway.com/project/b627e5d0-92ab-4e5b-9b06-e6bb78d5befb
- Torii: https://railway.com/project/a1f37ec0-bffd-4814-b061-acc6a1f90123

## Toolchain
- Dojo v1.8.6 Docker image (sozo 1.8.6, scarb 2.13.1, Cairo 2.13.1)
- Custom `dojo-builder` Docker image with rustup for compilation

## Dojo Models (5 registered)
MatchCounter, RoundMoves, Commitment, MatchState, NodeState

## MCP Server Env Vars
```
TORII_URL=https://siege-torii-production.up.railway.app/graphql
STARKNET_RPC_URL=<katana or sepolia RPC>
WORLD_ADDRESS=0x064292a23c373a7924d98de184eccb8a7e6743e8545c8a20d9725dd4e1fc8205
COMMIT_REVEAL_ADDRESS=0xe16d296481697b59298a5c46437fb82712b7820f8f7b6eaad19700f681cecb
POLL_INTERVAL_MS=5000
```

## Notes
- Katana running in dev mode (no fees)
- Torii indexing with controllers enabled
- No auto-deploy on git push — redeploy manually via Railway
