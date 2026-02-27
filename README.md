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
npm install
npm run dev
```

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

_Coming soon_ — update `Scarb.toml` with Sepolia RPC and account, then:

```bash
sozo migrate --profile sepolia
```

## License

MIT
