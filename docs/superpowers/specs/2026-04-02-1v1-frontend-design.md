# 1v1 Frontend Integration — Design Spec

## Goal

Integrate the 1v1 game mode into the existing Next.js frontend so players can create and play 1v1 matches using their Cartridge Controller wallet — no key management needed.

## Route

New page at `/match-1v1/[id]` alongside the existing `/match/[id]` (2v2). No changes to 2v2.

## Create Match Flow

Add a "1v1 Match" section to the home page (`frontend/src/app/page.tsx`):
- Text input for opponent's Starknet address
- "Create 1v1 Match" button
- On success, redirect to `/match-1v1/<id>`

The `create_match_1v1` contract takes `(player_a, player_b)` — player A is the connected wallet's address.

## Match Page (`/match-1v1/[id]/page.tsx`)

### Layout

- **Header**: Match ID, current round, vault A HP bar, vault B HP bar
- **Nodes**: 3 indicators showing ownership (neutral / A / B)
- **Allocation form** (visible during commit phase only):
  - Attack: 3 number inputs (p0, p1, p2)
  - Defense: 3 number inputs (g0, g1, g2)
  - Repair: 1 number input (max 3)
  - Nodes: 3 number inputs (nc0, nc1, nc2)
  - Running budget total vs available budget
  - "Submit Moves" button (disabled if over budget or already committed)
- **Phase status**: "Waiting for opponent to commit...", "Revealing...", "Waiting for round resolution..."
- **Round results panel**: after resolution, shows damage dealt/taken, HP changes, node changes
- **Round history**: scrollable list of past rounds with moves and damage
- **End screen**: winner/loser/draw overlay when match status is Finished

### Player Role Detection

Compare connected wallet address to `player_a` and `player_b` from on-chain `MatchState1v1`. Show "You are Player A/B" and orient the UI accordingly (your vault on the left, theirs on the right).

If wallet doesn't match either player, show an error.

## Auto-Reveal Flow

1. Player fills allocations, clicks "Submit Moves"
2. Frontend generates salt via `crypto.getRandomValues` (31 bytes)
3. Stores salt + full move allocation in localStorage keyed by `siege_1v1_salt_{matchId}_{round}` and `siege_1v1_move_{matchId}_{round}`
4. Computes Poseidon hash: `H(salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2)`
5. Calls `commit()` on `commit_reveal_1v1` contract
6. Polls Torii every 4s for `commit_count == 2`
7. Once both committed, auto-calls `reveal()` with stored salt + moves
8. Polls for `reveal_count == 2` (resolution triggers on-chain automatically)
9. Fetches updated match state and round moves, displays results
10. Clears stored salt/moves from localStorage
11. Loops to next round (or shows end screen if match finished)

## Data Layer

### `frontend/src/lib/contracts1v1.ts`

Contract call wrappers using the same `AccountInterface` pattern as existing `contracts.ts`:

```typescript
export const CONTRACTS_1V1 = {
  ACTIONS: "0x7cbd822e0dc535d084dd71b76ba332d76cb370954c83a5ebe5625f36cdfa1c",
  COMMIT_REVEAL: "0x516bdf650dcaebe431a06fba09766ee2d4be79c477e73ba220a64c4f6d4af80",
};

export async function createMatch1v1(account, playerA, playerB): Promise<InvokeFunctionResponse>
export async function commitMove1v1(account, matchId, commitment): Promise<InvokeFunctionResponse>
export async function revealMove1v1(account, matchId, salt, move): Promise<InvokeFunctionResponse>
```

Applies `DEVNET_TX_OPTS` in devnet mode, nothing in Sepolia (same pattern as `contracts.ts`).

### `frontend/src/lib/gameState1v1.ts`

Torii polling hooks following the same pattern as `gameState.ts`:

```typescript
// Core match state
export function useMatchState1v1(matchId: string | null): { state, loading, refresh }

// Round commit/reveal status for current round
export function useRoundStatus1v1(matchId: string | null, round: number): { commitCount, revealCount }

// Round moves (after resolution) for results display
export function useRoundMoves1v1(matchId: string | null, round: number): RoundMoves1v1 | null

// Match players
export function useMatchPlayers1v1(matchId: string | null): { playerA, playerB } | null

// Round history
export function useRoundHistory1v1(matchId: string | null): RoundResult1v1[]
```

Torii model names:
- `siegeDojoMatchState1v1Models`
- `siegeDojoRoundMoves1v1Models`
- `siegeDojoNodeStateModels` (shared with 2v2)
- `siegeDojoCommitmentModels` (shared with 2v2, roles 0-1)

### `frontend/src/lib/crypto.ts` additions

Add 1v1 commitment function:
```typescript
export function computeCommitment1v1(
  salt: string,
  p0: number, p1: number, p2: number,
  g0: number, g1: number, g2: number,
  repair: number,
  nc0: number, nc1: number, nc2: number
): string
```

Add 1v1 localStorage helpers:
```typescript
export function storeMove1v1(matchId: string, round: number, move: MoveAllocation1v1): void
export function getMove1v1(matchId: string, round: number): MoveAllocation1v1 | null
export function storeSalt1v1(matchId: string, round: number, salt: string): void
export function getSalt1v1(matchId: string, round: number): string | null
```

## Session Policies

Update `frontend/src/app/providers.tsx` to add the 1v1 contract policies to the existing `SESSION_POLICIES`:

```typescript
const SESSION_POLICIES: SessionPolicies = {
  contracts: {
    // existing 2v2 policies...
    [CONTRACTS_1V1.ACTIONS]: {
      methods: [{ name: "Create 1v1 Match", entrypoint: "create_match_1v1" }],
    },
    [CONTRACTS_1V1.COMMIT_REVEAL]: {
      methods: [
        { name: "Commit Move", entrypoint: "commit" },
        { name: "Reveal Move", entrypoint: "reveal" },
      ],
    },
  },
};
```

## Components

### New Components

- **`AllocationForm.tsx`** — the 10-input form with budget tracking and validation. Inputs: attack [3], defense [3], repair [1], nodes [3]. Shows running total vs budget. Submit button disabled when over budget or already committed.
- **`MatchHeader1v1.tsx`** — match ID, round, two HP bars, player labels
- **`RoundResults1v1.tsx`** — damage dealt/taken breakdown, HP changes, node changes after a round resolves
- **`PhaseStatus1v1.tsx`** — shows current phase ("Your turn", "Waiting for opponent", "Revealing...", "Resolving...")

### Reused Components

- `Navbar.tsx` / `ConnectWallet.tsx` — wallet connection
- `EndScreen.tsx` — can adapt or create a simpler 1v1 version
- `NodeMap.tsx` — node ownership display (if compatible, otherwise inline a simpler version)

## Home Page Changes

Add to `frontend/src/app/page.tsx`:
- A "1v1 Mode" section below or alongside any existing content
- Input for opponent address
- "Create 1v1 Match" button
- On success: `router.push('/match-1v1/<id>')`
- A "Join 1v1 Match" input for entering a match ID

## Environment Variables

The 1v1 contract addresses are hardcoded in `contracts1v1.ts` (same pattern as `contracts.ts` reading from `NEXT_PUBLIC_*` env vars). Add to `frontend/.env.local`:

```
NEXT_PUBLIC_ACTIONS_1V1_ADDRESS=0x7cbd822e0dc535d084dd71b76ba332d76cb370954c83a5ebe5625f36cdfa1c
NEXT_PUBLIC_COMMIT_REVEAL_1V1_ADDRESS=0x516bdf650dcaebe431a06fba09766ee2d4be79c477e73ba220a64c4f6d4af80
```

## What Is NOT Changing

- Existing 2v2 route (`/match/[id]`)
- Existing 2v2 components, hooks, contracts
- Existing devnet account selector
- Backend/contract code (already deployed)

## Out of Scope

- Spectator mode
- Match listing / discovery
- AI opponent integration
- Mobile responsiveness optimization
- Animations / transitions
