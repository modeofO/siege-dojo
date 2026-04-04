# Node Traps — Design Spec

## Goal

Add traps to resource nodes. Players can sacrifice a node they own to deal 5 damage to the opponent who takes it. Traps cost 2 budget points and are hidden until reveal.

## Mechanics

### Eligibility
- You can only trap nodes you currently own (TeamA/TeamB)
- You cannot trap neutral nodes

### Cost
- 2 budget points per trap, deducted from the shared budget
- Budget validation: `attack + defense + repair + nodes + (2 * trap_count) <= budget`

### Placement
- Trapping a node means you give up contesting it — your contest spend at that node is effectively 0 during resolution
- Setting trap=1 on a node you own signals intent to booby-trap it

### Trigger
- After node contests resolve, if a node changed ownership AND the previous owner had a trap on it, the new owner's vault takes **5 damage**
- If the opponent doesn't contest the node (spend 0), they don't take it, trap isn't triggered, you keep the node
- Traps are consumed each round — must be re-placed next round if desired

### Visibility
- Traps are hidden in the commit hash — opponent doesn't know which nodes are trapped until reveal phase
- Both players see trap results after resolution

## On-chain Changes

### Model: `RoundMoves1v1` — add 6 trap fields

Add to `src/models/round_moves_1v1.cairo`:
```
pub a_trap0: u8,
pub a_trap1: u8,
pub a_trap2: u8,
pub b_trap0: u8,
pub b_trap1: u8,
pub b_trap2: u8,
```

Values are 0 (no trap) or 1 (trap placed). These are stored alongside the existing allocation fields.

### System: `commit_reveal_1v1` — extend reveal

Updated interface:
```
fn reveal(
    match_id: u64, salt: felt252,
    p0: u8, p1: u8, p2: u8,
    g0: u8, g1: u8, g2: u8,
    repair: u8,
    nc0: u8, nc1: u8, nc2: u8,
    trap0: u8, trap1: u8, trap2: u8,
);
```

**Poseidon hash** — 14 elements:
`H(salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2)`

**Budget validation:**
```
total = p0+p1+p2 + g0+g1+g2 + repair + nc0+nc1+nc2 + (trap0*2) + (trap1*2) + (trap2*2)
assert(total <= budget)
```

**Trap validation:**
- A player can only set trap=1 on a node they own
- Read current `NodeState` for the node — if player A and `node.owner != TeamA`, reject
- trap values must be 0 or 1

**Storage:** Write trap fields to `RoundMoves1v1` alongside other allocations.

### System: `resolution_1v1` — trap trigger

After node contests resolve (ownership may have changed), check for traps:

```
For each node n (0, 1, 2):
  Read the node's owner BEFORE this round's contest resolution (from the pre-contest state)
  Read the node's owner AFTER contest resolution
  If owner changed:
    If previous owner was TeamA and a_trapN == 1:
      damage_to_b += 5  (trap triggers on Player B who took the node)
    If previous owner was TeamB and b_trapN == 1:
      damage_to_a += 5  (trap triggers on Player A who took the node)
```

The trap damage is added to the total vault damage AFTER the gate damage is calculated but BEFORE repairs are applied. Actually, to keep it simple and impactful: trap damage is applied after all gate damage and repair. It's a separate damage source that cannot be repaired.

Resolution order (updated):
1. Apply gate modifiers and calculate gate damage
2. Apply repair (capped at 3), then gate damage
3. Resolve node contests (ownership changes)
4. Apply trap damage (5 per triggered trap, after repair, not repairable)
5. Check win condition
6. Generate next round modifiers via vRNG

### Commit hash update

The commit hash now includes 14 elements instead of 11:
`H(salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2)`

This is a **breaking change** — matches created before this update use the 11-element hash. Old matches will not be compatible with the new reveal function.

## Frontend Changes

### `crypto.ts`
Update `computeCommitment1v1` to accept and hash 3 trap flags (14 elements total).

Add storage helpers:
```typescript
export function computeCommitment1v1(
  salt: string,
  p0-nc2: ...,   // existing 10 values
  trap0: number, trap1: number, trap2: number,
): string
```

### `contracts1v1.ts`
Update `revealMove1v1` to pass 3 additional trap params in calldata.

### `gameState1v1.ts`
- Update `RoundResult1v1` to include trap data
- Query trap fields from `RoundMoves1v1` in round history
- Add trap trigger info to `GateDamage` or a new `TrapResult` type

### `AllocationForm1v1.tsx`
- Accept node ownership data as a prop
- For each node the player owns, show a "TRAP" toggle button
- When trap is toggled on:
  - Disable the contest slider for that node (set to 0)
  - Deduct 2 from available budget
  - Show visual indicator (e.g., red mine icon)
- Budget display accounts for trap cost

### Match page (`match-1v1/[id]/page.tsx`)
- Pass node ownership + isPlayerA to the allocation form
- Include trap values (indices 10-12) in the allocations array (extend from 10 to 13)
- Show trap results in round history ("Node 1 trapped! -5 HP")

### Allocation array layout
```
Index: 0  1  2  3  4  5  6      7   8   9   10    11    12
Field: p0 p1 p2 g0 g1 g2 repair nc0 nc1 nc2 trap0 trap1 trap2
```

## Out of Scope

- Trap stacking (placing multiple traps on same node)
- Trap persistence across rounds (traps are consumed each round)
- Trap types (only one type: 5 damage)
- Counter-trap abilities (future: abilities feature)
