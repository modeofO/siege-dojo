# Siege Dojo — Development Guide

## Local Dev Environment

### Quick Start
```bash
./scripts/local-dev.sh        # starts katana + builds + migrates + starts torii
cd frontend && npm run dev    # start frontend on localhost:3000
docker compose down           # tear down
```

### Docker Notes
- Dojo images have NO ARM64 builds — all services use `platform: linux/amd64` (Rosetta)
- `Dockerfile.build` (siege-dojo-builder) has Rust + sozo 1.8.6 — required for `sozo build` (cargo needed for dojo_cairo_macros)
- The dojo:v1.8.0 image is used for katana (1.7.0) and torii (1.8.3) only

### Katana
- CLI flags: `--http.addr` (not `--host`), `--http.cors_origins "*"` for browser CORS
- Dev accounts change per katana version — current accounts (seed 0, katana 1.7.0) are in `frontend/src/app/providers.tsx` and `scripts/run-test.sh`
- No-fee mode: `--dev --dev.no-fee`

### Dojo Permissions
- `sozo migrate` syncs 0 permissions by default
- Must run `sozo auth grant writer siege_dojo,siege_dojo-actions siege_dojo,siege_dojo-commit_reveal siege_dojo,siege_dojo-resolution` after migration
- `[[writers]]` in dojo_dev.toml is NOT supported in this sozo version — use CLI grant
- `local-dev.sh` handles this automatically

### Torii GraphQL Quirks
- `match_id` must be a quoted string: `where: { match_id: "3" }`
- `round` must be an unquoted integer: `where: { round: 1 }`
- Mixing these up causes silent query failures (returns null, no error)

## Frontend

### Starknet.js v8 API
- Account constructor: `new Account({ provider, address, signer: privateKey })`
- No `maxFee` in `UniversalDetails` — use `resourceBounds` with zero BigInt values for devnet
- `BigInt(0)` not `0n` (tsconfig targets ES2017)

### Dev Mode
- `providers.tsx` uses 4 hardcoded Katana dev accounts with dropdown selector (no Cartridge Controller)
- All contract calls in `contracts.ts` pass `DEVNET_TX_OPTS` to skip fee estimation

### Testing
- `npm test` runs vitest
- `npm install -D vitest --legacy-peer-deps` (peer dep conflicts with React 19)
- Pure game logic exported from `gameState.ts`: `toNum`, `parseMatchId`, `ownerToNode`, `computeBudget`, `computeDamage`

## Gameplay Testing

### Play as opponents (3 bot players)
```bash
cd scripts && MATCH_ID=3 npx tsx play-opponent.js
```
Commits and reveals for Team A Defender, Team B Attacker, Team B Defender. Polls waiting for the human player's commit/reveal.

### Full automated round test
```bash
cd scripts && bash run-test.sh
```
Creates a match, commits all 4, reveals all 4, shows results.

## Cairo Contracts

### Build & Migrate
```bash
docker compose run --rm builder sozo build
docker compose run --rm builder sozo migrate --rpc-url http://katana:5050
```

### Contract Tests
```bash
docker compose run --rm builder sozo test
```

## Project Structure
- `src/systems/` — Cairo contracts (actions, commit_reveal, resolution)
- `src/models/` — Dojo ECS models (match_state, node_state, commitment, round_moves)
- `frontend/src/lib/` — Game logic (gameState.ts, crypto.ts, contracts.ts)
- `frontend/src/components/` — UI components (GateDisplay, NodeMap, VaultDisplay, etc.)
- `scripts/` — Dev scripts (local-dev.sh, play-opponent.js, run-test.sh, test-reveal.js)
- `mcp-server/` — AI agent MCP tools
