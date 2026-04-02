# Siege Dojo 🏯

An asymmetric turn-based strategy game where human+AI teams compete to breach each other's vaults. Built on [Dojo](https://dojoengine.org/) (Starknet ECS framework) with MCP integration for AI agent gameplay.

## Overview

Two teams of two (attacker + defender) battle over 10 rounds using commit-reveal mechanics:

- **100 HP vaults** — each team protects one, attacks the other
- **10 budget per turn** — allocated across attack power, pressure points (3), and resource nodes (3)
- **Resource nodes** — controlling nodes grants +1 budget per node per round
- **Pressure points** — strategic targets that amplify damage
- **Commit-reveal turns** — players commit hashed moves, then reveal simultaneously (prevents front-running)
- **Human + AI teams** — attackers and defenders can be humans or AI agents

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Frontend   │────▶│  Torii Indexer    │◀────│   Katana    │
│  (Next.js)   │     │  (GraphQL/gRPC)  │     │   (Devnet)  │
└─────────────┘     └──────────────────┘     └──────┬──────┘
                                                     │
┌─────────────┐     ┌──────────────────┐            │
│  AI Agent    │────▶│  Siege MCP Server │────────────┘
│  (Claude)    │     │  (6 tools)       │
└─────────────┘     └──────────────────┘
       │
       ▼
┌──────────────────┐
│ Starknet MCP     │  (wallet ops, tx signing)
│ (starknet-agent) │
└──────────────────┘
```

- **Dojo Contracts** — Cairo smart contracts using ECS pattern (models + systems)
- **Siege MCP Server** — read-only game state + move-building tools (never touches keys)
- **Starknet MCP Server** — handles wallet operations and transaction submission
- **Frontend** — Next.js + Cartridge Controller for human players

## Project Structure

```
siege_dojo/
├── src/
│   ├── models/           # Dojo ECS models
│   │   ├── match_state.cairo
│   │   ├── match_counter.cairo
│   │   ├── node_state.cairo
│   │   ├── commitment.cairo
│   │   └── round_moves.cairo
│   ├── systems/          # Game logic
│   │   ├── actions.cairo       # create_match, get_team_budget
│   │   ├── commit_reveal.cairo # commit_move, reveal_attacker, reveal_defender
│   │   └── resolution.cairo    # resolve_round
│   └── tests/            # 18 tests
│       ├── test_actions.cairo
│       ├── test_commit_reveal.cairo
│       └── test_resolution.cairo
├── mcp-server/           # Siege MCP server (TypeScript)
│   └── src/
│       ├── index.ts      # 6 MCP tools
│       ├── state.ts      # Torii GraphQL queries
│       └── hash.ts       # Poseidon hash utils
├── frontend/             # Next.js + Cartridge Controller
│   └── src/
│       ├── app/
│       ├── components/
│       └── lib/
├── Scarb.toml
├── dojo_dev.toml
└── manifest_dev.json
```

## Local Development Setup

### Prerequisites

- **Docker** (for Katana and Torii)
- **Node.js** ≥ 18
- **Dojo toolchain**: `curl -L https://install.dojoengine.org | bash && dojoup`

### 1. Start Katana (Starknet Devnet)

```bash
docker run -d --name katana --network host \
  ghcr.io/dojoengine/katana:latest \
  katana --dev --dev.no-fee
```

Runs on `localhost:5050` with 10 prefunded dev accounts.

### 2. Build & Deploy Contracts

```bash
cd siege_dojo
sozo build
sozo migrate
```

Note the world address from migration output.

### 3. Start Torii (Indexer)

```bash
docker run -d --name torii --network host \
  ghcr.io/dojoengine/torii:latest \
  torii --world 0x01fefc7c7bf64546ae186b4818ef444521616b2c4c8e6e9f6075e0b01243f028 \
  --rpc http://localhost:5050 \
  --indexing.controllers
```

GraphQL playground at `http://localhost:8080/graphql`.

### 4. Frontend

```bash
cd frontend
bun install
bun run dev
```

For Sepolia mode, create `frontend/.env.local`:

```
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_ACTIONS_ADDRESS=0x02e7aaec86013c6f4719227f995b91bb935571eb48ae11fed039cd4345ba0d2b
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=0x06c61d75ff72a9b5ccf82cd78b48777f3486d10e8077cf9456a6feff0a0273c8
NEXT_PUBLIC_TORII_URL=https://api.cartridge.gg/x/siege-dojo/torii
NEXT_PUBLIC_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia
```

Omit `.env.local` (or set `NEXT_PUBLIC_NETWORK=devnet`) to use local Katana dev accounts.

### 5. MCP Server

```bash
cd mcp-server
npm install
npm run build
npm start
```

Required env vars:
- `STARKNET_RPC_URL=http://localhost:5050`
- `WORLD_ADDRESS=0x01fefc7c7bf64546ae186b4818ef444521616b2c4c8e6e9f6075e0b01243f028`
- `COMMIT_REVEAL_ADDRESS=0x05b709bbf6c548a4eac4268604b71f7dbd0fc4a43f2a0c9ed5de000531b3fd6a`
- `TORII_URL=http://localhost:8080` (optional, preferred for reads)

### Run Tests

```bash
sozo test
```

18 tests covering match creation, commit-reveal flow, and round resolution.

## Contract Addresses (Local Devnet)

| Contract | Address |
|----------|---------|
| **World** | `0x01fefc7c7bf64546ae186b4818ef444521616b2c4c8e6e9f6075e0b01243f028` |
| **actions** | `0x02b93ff5747a6c5db5a4a616f76c1ad142a98352e54203e3dfa4fe26fe3fd136` |
| **commit_reveal** | `0x05b709bbf6c548a4eac4268604b71f7dbd0fc4a43f2a0c9ed5de000531b3fd6a` |
| **resolution** | `0x0442e1eb68ed2bdf0f58f1344b12f1c6c56605acadffac0e38eb8afb640b2cf1` |

## MCP Tools

The Siege MCP server exposes 6 tools (no private key handling):

| Tool | Description |
|------|-------------|
| `siege_get_match_state` | Read current match state (HP, round, status) |
| `siege_get_round_history` | Get past round moves and outcomes |
| `siege_get_my_status` | Check player's current status in a match |
| `siege_build_commit` | Build commitment hash + calldata for move submission |
| `siege_build_reveal_attacker` | Build attacker reveal calldata |
| `siege_build_reveal_defender` | Build defender reveal calldata |

### Agent Architecture (No-Key Design)

Agents use **two MCP servers**:
1. **Siege MCP** — game state reads + move building (this server)
2. **Starknet MCP** (`starknet-agentic`) — wallet operations, transaction signing/submission

This separation means the game server never handles private keys. Agents build transactions via Siege MCP, then submit them via the Starknet MCP.

### Ask Torii (Remote MCP)

For development and querying on-chain state, you can use [Ask Torii](https://liquid-data.dev/) — a remote MCP server that accepts natural language queries against any Torii-indexed world.

**Endpoint:** `https://asktorii.com/mcp` (POST, JSON-RPC)

**Tools:**
- `list-worlds` — discover active worlds and their Torii URLs
- `query-world` — ask natural language questions about on-chain state (players, troops, structures, etc.)

Once Siege Dojo is deployed with a Torii indexer, point `query-world` at the Torii URL to query match states, commitments, round results, and more — no custom read tooling needed.

Built by [@frontboat](https://github.com/frontboat).

## Game Mechanics

### Turn Flow
1. Both teams **commit** hashed moves (Poseidon hash of allocation + salt)
2. Both teams **reveal** their actual moves
3. System **resolves** the round: calculates damage, updates HP, transfers node control
4. Repeat for up to 10 rounds or until a vault reaches 0 HP

### Budget Allocation
- Base budget: **10** per team per round
- Bonus: **+1** per controlled resource node (max 3 nodes)
- Attackers allocate: attack power + pressure points
- Defenders allocate: defense power + resource node contest

## Deployment (Sepolia)

Contracts are live on Starknet Sepolia as of 2026-03-29.

### Contract Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| **World** | `0x07ba32eaaa2a25145ea713e17ad1f42dc7f9f08355a2fd058a9a875e609fa8c0` |
| **actions** | `0x06e730a23bd927ff424985dedef2cd84b7ce1bfbf1c3083411e150a297c114cc` |
| **commit_reveal** | `0x0435bfc2a56e3a4b3561b9936970e87db527b447bb30f47370dfb9d4964f6038` |
| **resolution** | `0x0558ea4d31edbc24293bf8468fb96a435a21ca24452e82da217b4168e03a0f71` |

**RPC:** `https://api.cartridge.gg/x/starknet/sepolia`

### Redeploying

#### Prerequisites

- **sozo >= v1.8.1** (v1.8.6 recommended) — blake2s CASM hashing required for Starknet v0.14.1+
- **scarb 2.13.1** / **cairo 2.13.1**
- A funded Starknet Sepolia account (needs STRK for gas)

If your local sozo is older, grab the binary directly:
```bash
# macOS ARM64
curl -sL "https://github.com/dojoengine/dojo/releases/download/sozo%2Fv1.8.6/sozo_v1.8.6_darwin_arm64.tar.gz" | tar xz -C /usr/local/bin
```

#### Create a deployer account (if needed)

```bash
# Install starkli
curl https://get.starkli.sh | sh && starkliup

# Generate keypair
starkli signer gen-keypair
# Save the private key and public key output

# Init OZ account (use the v0_8 RPC for starkli compatibility)
starkli account oz init \
  --private-key <PRIVATE_KEY> \
  ~/.starkli/deployer_account.json

# Fund the printed address via https://starknet-faucet.vercel.app/

# Deploy account
starkli account deploy \
  --rpc https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8 \
  --private-key <PRIVATE_KEY> \
  ~/.starkli/deployer_account.json
```

#### Build and migrate

```bash
export DOJO_ACCOUNT_ADDRESS="0x..."
export DOJO_PRIVATE_KEY="0x..."

sozo build -P sepolia
sozo -P sepolia migrate
```

sozo v1.8.1+ auto-detects blake2s from the `"sepolia"` string in the RPC URL. No extra flags needed.

#### Grant permissions

```bash
sozo -P sepolia auth grant writer \
  siege_dojo,siege_dojo-actions \
  siege_dojo,siege_dojo-commit_reveal \
  siege_dojo,siege_dojo-resolution
```

### Toolchain Notes

The original deployment blocker was a CASM compiled class hash mismatch. Root cause: Starknet v0.14.1 (Nov 2025) switched from Poseidon to blake2s for `compiled_class_hash`. sozo v1.8.0 predated this change. Upgrading to v1.8.1+ (which auto-detects and uses blake2s) resolved it.

## Roadmap

- [x] **Cartridge Controller integration** — session policies for `create_match`, `commit`, `reveal_attacker`, `reveal_defender`
- [x] **Frontend Sepolia mode** — env-driven toggle (`NEXT_PUBLIC_NETWORK=sepolia`) between local devnet and Cartridge Controller
- [x] **Torii indexer on Sepolia** — hosted on Slot at `https://api.cartridge.gg/x/siege-dojo/torii`
- [ ] **AI agent end-to-end on Sepolia** — MCP servers pointing at live contracts

## License

MIT
