# Siege Dojo — Development Guide

## Toolchain

| Tool | Version | Notes |
|------|---------|-------|
| sozo | **v1.8.6** | Must be >= v1.8.1 for Sepolia (blake2s CASM hashing) |
| scarb | 2.13.1 | Matches dojo v1.8.0 core dependency |
| cairo | 2.13.1 | |
| dojo deps | v1.8.0 | In `Scarb.toml` |
| starkli | 0.4.2 | For account management only |

## Local Dev

```bash
./scripts/local-dev.sh        # starts katana + builds + migrates + starts torii
cd frontend && npm run dev    # frontend on localhost:3000
docker compose down           # tear down
```

- Dojo images have NO ARM64 builds — all services use `platform: linux/amd64` (Rosetta)
- Katana CLI flags: `--http.addr` (not `--host`), `--http.cors_origins "*"` for CORS
- Dev accounts change per katana version — current accounts (seed 0, katana 1.7.0) in `frontend/src/app/providers.tsx`

## Sepolia

**World:** `0x07ba32eaaa2a25145ea713e17ad1f42dc7f9f08355a2fd058a9a875e609fa8c0`
**RPC:** `https://api.cartridge.gg/x/starknet/sepolia` (spec v0.9.0 — required by sozo v1.8.6)

```bash
export DOJO_ACCOUNT_ADDRESS="0x..."
export DOJO_PRIVATE_KEY="0x..."

sozo build -P sepolia
sozo -P sepolia migrate
sozo -P sepolia auth grant writer \
  siege_dojo,siege_dojo-actions \
  siege_dojo,siege_dojo-commit_reveal \
  siege_dojo,siege_dojo-resolution
```

**starkli uses a different RPC spec** — use the v0_8 endpoint:
`https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8`

## Dojo Permissions

- `sozo migrate` syncs 0 permissions by default
- Must run `sozo auth grant writer` after every migration (local and Sepolia)
- `[[writers]]` in dojo_dev.toml is NOT supported in this sozo version — use CLI grant
- `local-dev.sh` handles this automatically for local

## Frontend

- `providers.tsx` uses 4 hardcoded Katana dev accounts with dropdown selector (dev mode)
- All contract calls in `contracts.ts` pass `DEVNET_TX_OPTS` to skip fee estimation
- Starknet.js v8: `new Account({ provider, address, signer: privateKey })`
- `BigInt(0)` not `0n` (tsconfig targets ES2017)
- `npm test` runs vitest (`--legacy-peer-deps` needed for React 19)

## Torii GraphQL Quirks

- `match_id` must be a quoted string: `where: { match_id: "3" }`
- `round` must be an unquoted integer: `where: { round: 1 }`
- Mixing these up causes silent query failures (returns null, no error)

## Gameplay Testing

```bash
cd scripts && MATCH_ID=3 npx tsx play-opponent.js   # 3 bot players
cd scripts && bash run-test.sh                       # full automated round
```

## Contract Tests

```bash
sozo test                                            # local (18 tests)
docker compose run --rm builder sozo test            # via Docker
```

## Project Structure

- `src/systems/` — Cairo contracts (actions, commit_reveal, resolution)
- `src/models/` — Dojo ECS models (match_state, node_state, commitment, round_moves)
- `frontend/src/lib/` — Game logic (gameState.ts, crypto.ts, contracts.ts)
- `frontend/src/components/` — UI components (GateDisplay, NodeMap, VaultDisplay, etc.)
- `scripts/` — Dev scripts (local-dev.sh, play-opponent.js, run-test.sh, test-reveal.js)
- `mcp-server/` — AI agent MCP tools
- `dojo_dev.toml` — Local dev config (gitignored, has dev private keys)
- `dojo_sepolia.toml` — Sepolia config (reads env vars for credentials)
