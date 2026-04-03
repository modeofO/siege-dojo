# 1v1 Mode with CLI — Design Spec

## Goal

Add a 1v1 game mode for rapid mechanics testing. Each player controls both attack and defense with a shared budget. A terminal CLI sends moves to Sepolia contracts, bypassing frontend development until mechanics are dialed in.

## Game Mechanics

### Players & Roles

- 2 players (Player A, Player B)
- Each player controls both attack and defense for their side
- Roles: `ROLE_A = 0`, `ROLE_B = 1`

### Budget

- Base budget: **10 points** per player per round
- +1 per controlled node (3 nodes, so max budget is 13)
- Single shared budget covers all allocations:
  - **Attack**: 3 pressure points (p0, p1, p2)
  - **Defense**: 3 gates (g0, g1, g2) + repair (capped at 3)
  - **Node contests**: 3 nodes (nc0, nc1, nc2)
- Budget validation: `p0 + p1 + p2 + g0 + g1 + g2 + repair + nc0 + nc1 + nc2 <= budget`

### Vault HP

- Starting HP: **50** per vault
- Repair capped at 3 per round (same as 2v2)

### Resolution (same math as 2v2)

- Damage per pressure point: `max(0, attack - defense)`
- Total damage: sum across 3 points
- Repair applied before damage
- Node ownership: team with higher total contest spend wins the node; ties keep current owner
- Win: vault HP hits 0, or after 10 rounds highest HP wins; both 0 = draw

### Commit-Reveal

- 2 commits required to unlock reveal phase
- 2 reveals required to trigger resolution
- Poseidon hash: `H(salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2)`
- Timeouts: 300s commit deadline (from first commit), 300s reveal deadline (from last commit)

## Cairo Contracts

Three new contract systems deployed alongside existing 2v2 contracts. Shared world namespace `siege_dojo`.

### Models

**`MatchState1v1`**
```
#[dojo::model]
struct MatchState1v1 {
    #[key] match_id: u64,
    player_a: ContractAddress,
    player_b: ContractAddress,
    vault_a_hp: u8,
    vault_b_hp: u8,
    current_round: u32,
    status: MatchStatus,  // reuse existing enum
}
```

**`RoundMoves1v1`**
```
#[dojo::model]
struct RoundMoves1v1 {
    #[key] match_id: u64,
    #[key] round: u32,
    commit_count: u8,
    reveal_count: u8,
    commit_deadline: u64,
    reveal_deadline: u64,
    // Player A allocations
    a_p0: u8, a_p1: u8, a_p2: u8,
    a_g0: u8, a_g1: u8, a_g2: u8,
    a_repair: u8,
    a_nc0: u8, a_nc1: u8, a_nc2: u8,
    // Player B allocations
    b_p0: u8, b_p1: u8, b_p2: u8,
    b_g0: u8, b_g1: u8, b_g2: u8,
    b_repair: u8,
    b_nc0: u8, b_nc1: u8, b_nc2: u8,
}
```

Reuses existing `Commitment`, `NodeState`, `MatchCounter` models. `Commitment` uses `role: u8` where 0 = Player A, 1 = Player B.

### System: `actions_1v1`

**Interface:**
```
fn create_match_1v1(player_a: ContractAddress, player_b: ContractAddress) -> u64;
fn get_budget_1v1(match_id: u64, is_player_a: bool) -> u8;
```

**Behavior:**
- Increments shared `MatchCounter` (same counter as 2v2 — match IDs are globally unique)
- Writes `MatchState1v1` with `vault_a_hp: 50`, `vault_b_hp: 50`, `current_round: 1`, `status: Active`
- Initializes 3 `NodeState` entries as `None`
- Emits a `MatchCreated1v1` event

### System: `commit_reveal_1v1`

**Interface:**
```
fn commit(match_id: u64, commitment: felt252);
fn reveal(
    match_id: u64, salt: felt252,
    p0: u8, p1: u8, p2: u8,
    g0: u8, g1: u8, g2: u8,
    repair: u8,
    nc0: u8, nc1: u8, nc2: u8,
);
fn force_timeout(match_id: u64);
```

**`commit` behavior:**
- Caller must be `player_a` or `player_b` (panic otherwise)
- Role = 0 for player A, 1 for player B
- Writes `Commitment { match_id, round, role, hash, committed: true, revealed: false }`
- Increments `commit_count`; first commit sets `commit_deadline`; `commit_count == 2` sets `reveal_deadline`

**`reveal` behavior:**
- Requires `commit_count == 2`
- Verifies Poseidon hash: `H(salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2)`
- Budget check: sum of all 10 values <= `get_budget_1v1()`
- Stores values in `RoundMoves1v1`
- When `reveal_count == 2`, calls `resolution_1v1.resolve_round(match_id)`

**`force_timeout` behavior:**
- Same pattern as 2v2 but with 2-player thresholds
- Auto-commits missing player with zero hash on commit timeout
- Auto-reveals with zero moves on reveal timeout

### System: `resolution_1v1`

**Interface:**
```
fn resolve_round(match_id: u64);
```

**Behavior:**
- Requires `reveal_count == 2`
- Damage to vault B: `sum(max(0, a_pN - b_gN))` for N in 0..3
- Damage to vault A: `sum(max(0, b_pN - a_gN))` for N in 0..3
- Repair (capped at 3), applied before damage
- Node contests: compare `a_ncN` vs `b_ncN` per node, higher wins; tie keeps current owner
- Win condition: HP hits 0 or round 10 reached
- Advances `current_round` or sets `status: Finished`
- Emits `RoundResolved` and `MatchFinished` events

### Events

```
MatchCreated1v1 { match_id, player_a, player_b }
```

Reuses existing `MoveCommitted`, `MoveRevealed`, `RoundResolved`, `MatchFinished` events.

### Permissions

After migration:
```bash
sozo -P sepolia auth grant writer \
  siege_dojo,siege_dojo-actions_1v1 \
  siege_dojo,siege_dojo-commit_reveal_1v1 \
  siege_dojo,siege_dojo-resolution_1v1
```

## CLI Tool

### Location

`scripts/siege-cli/` — standalone TypeScript CLI using starknet.js and `@cartridge/controller`.

### Dependencies

- `starknet` (RPC, hashing, account interface)
- `@cartridge/controller` (SessionProvider for Cartridge auth)
- `readline` (Node built-in, for interactive prompts)

### Authentication Modes

**Cartridge Controller (default):**
- Uses `SessionProvider` from `@cartridge/controller/session/node`
- First run opens browser for authentication, session saved to `.cartridge/` directory
- Subsequent runs reuse session — no browser needed
- Session policies cover `create_match_1v1`, `commit`, `reveal` on 1v1 contracts
- Paymaster handles gas (gasless for players)

**Raw private key (fallback):**
- Enabled via `--use-private-key` flag
- Reads `DOJO_ACCOUNT_ADDRESS` and `DOJO_PRIVATE_KEY` from environment
- For local Katana testing

### Commands

**Create a match:**
```bash
# Cartridge mode
npx tsx siege-cli.ts --create --opponent 0x<their_address>

# Private key mode (local dev)
npx tsx siege-cli.ts --create --opponent 0x<addr> --use-private-key
```
- Creates match, prints match ID
- Enters interactive loop for round 1

**Join a match:**
```bash
npx tsx siege-cli.ts --match <id>
```
- Detects player role from caller address
- Enters interactive loop at current round

### Interactive Mode (default)

```
=== Siege Dojo 1v1 === Match #7 ===

Round 1 | Budget: 10 | Vault A: 50 HP | Vault B: 50 HP
Nodes: [neutral] [neutral] [neutral]
You are: Player A

--- Allocate your budget (10 points) ---
Attack (p0 p1 p2): 3 2 1
Defense (g0 g1 g2): 2 1 0
Repair (0-3): 1
Nodes (nc0 nc1 nc2): 0 0 0
Total: 10/10

Committing... done.
Waiting for opponent to commit...
Both committed. Revealing... done.
Waiting for opponent to reveal...

--- Round 1 Results ---
Your attack [3,2,1] vs their defense [2,1,1]
  Damage dealt: 2
Their attack [2,2,2] vs your defense [2,1,0]
  Damage taken: 3
Vault A: 48 HP | Vault B: 49 HP
Nodes: [A] [neutral] [neutral]

Round 2 | Budget: 11 | ...
```

**Input validation:**
- Rejects non-numeric input
- Rejects negative values
- Rejects if total exceeds budget
- Rejects if repair > 3
- Prompts again on invalid input

### JSON Mode (for scripting)

```bash
npx tsx siege-cli.ts --match 7 --json '{"attack":[3,2,1],"defense":[2,1,0],"repair":1,"nodes":[0,0,0]}'
```

- Auto-detects current round from on-chain state
- Validates budget, commits, waits for opponent, reveals, waits for resolution
- Prints round results as JSON to stdout, then exits
- Exit code 0 = round complete, 1 = error, 2 = match finished

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_RPC_URL` | `https://api.cartridge.gg/x/starknet/sepolia` | Starknet RPC |
| `NEXT_PUBLIC_TORII_URL` | `https://api.cartridge.gg/x/siege-dojo/torii` | Torii indexer |
| `CARTRIDGE_STORAGE_PATH` | `./.cartridge` | Session storage dir |
| `DOJO_ACCOUNT_ADDRESS` | — | For `--use-private-key` mode |
| `DOJO_PRIVATE_KEY` | — | For `--use-private-key` mode |

Contract addresses are read from the Sepolia deployment (hardcoded after migration). For local dev with `--use-private-key`, override via `ACTIONS_1V1_ADDRESS` and `COMMIT_REVEAL_1V1_ADDRESS` env vars.

## Deployment

### Build & Migrate

```bash
sozo build -P sepolia
sozo -P sepolia migrate
sozo -P sepolia auth grant writer \
  siege_dojo,siege_dojo-actions_1v1 \
  siege_dojo,siege_dojo-commit_reveal_1v1 \
  siege_dojo,siege_dojo-resolution_1v1
```

### Torii

Existing Torii instance on Slot will auto-index the new models (same world). No Torii config changes needed.

## Out of Scope

- Frontend UI for 1v1 (future work after mechanics are validated)
- AI opponent via MCP (future work — JSON mode enables this)
- Matchmaking / lobby system
- Spectator mode
- Changes to existing 2v2 contracts
