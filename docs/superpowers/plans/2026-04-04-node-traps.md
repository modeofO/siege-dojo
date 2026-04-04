# Node Traps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add traps to owned resource nodes — costs 2 budget, deals 5 damage when opponent takes the node. Hidden until reveal.

**Architecture:** Extend `RoundMoves1v1` with 6 trap fields (a_trap0-2, b_trap0-2). Extend `commit_reveal_1v1` reveal to accept 3 trap params with updated Poseidon hash (14 elements) and budget check. Add trap trigger logic to `resolution_1v1` after node contests. Frontend extends allocation array from 10 to 13 elements with trap toggles.

**Tech Stack:** Cairo 2.13.1 / Dojo v1.8.0, starknet.js v8

**Spec:** `docs/superpowers/specs/2026-04-04-node-traps-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/models/round_moves_1v1.cairo` | Add 6 trap fields |
| Modify | `src/systems/commit_reveal_1v1.cairo` | Extend reveal with trap params, update hash + budget |
| Modify | `src/systems/resolution_1v1.cairo` | Trap trigger after node contests |
| Create | `src/tests/test_traps_1v1.cairo` | Trap tests |
| Modify | `src/lib.cairo` | Register test module |
| Modify | `frontend/src/lib/crypto.ts` | Update hash to 14 elements |
| Modify | `frontend/src/lib/contracts1v1.ts` | Extend reveal calldata |
| Modify | `frontend/src/lib/gameState1v1.ts` | Update round history with trap data |
| Modify | `frontend/src/components/AllocationForm1v1.tsx` | Add trap toggles |
| Modify | `frontend/src/app/match-1v1/[id]/page.tsx` | Pass node ownership, extend allocations to 13, show trap results |

---

## Task 1: Extend `RoundMoves1v1` Model

**Files:**
- Modify: `src/models/round_moves_1v1.cairo`

- [ ] **Step 1: Add trap fields**

Replace entire file:

```cairo
#[dojo::model]
#[derive(Drop, Serde)]
pub struct RoundMoves1v1 {
    #[key]
    pub match_id: u64,
    #[key]
    pub round: u32,
    pub commit_count: u8,
    pub reveal_count: u8,
    pub commit_deadline: u64,
    pub reveal_deadline: u64,
    pub a_p0: u8, pub a_p1: u8, pub a_p2: u8,
    pub a_g0: u8, pub a_g1: u8, pub a_g2: u8,
    pub a_repair: u8,
    pub a_nc0: u8, pub a_nc1: u8, pub a_nc2: u8,
    pub a_trap0: u8, pub a_trap1: u8, pub a_trap2: u8,
    pub b_p0: u8, pub b_p1: u8, pub b_p2: u8,
    pub b_g0: u8, pub b_g1: u8, pub b_g2: u8,
    pub b_repair: u8,
    pub b_nc0: u8, pub b_nc1: u8, pub b_nc2: u8,
    pub b_trap0: u8, pub b_trap1: u8, pub b_trap2: u8,
}
```

- [ ] **Step 2: Verify it compiles**

Run: `sozo build`

- [ ] **Step 3: Commit**

```bash
git add src/models/round_moves_1v1.cairo
git commit -m "feat: add trap fields to RoundMoves1v1 model"
```

---

## Task 2: Extend `commit_reveal_1v1` — Reveal with Traps

**Files:**
- Modify: `src/systems/commit_reveal_1v1.cairo`

The reveal function needs:
1. Three new parameters: `trap0, trap1, trap2`
2. Hash updated to 14 elements (salt + 10 allocations + 3 traps)
3. Budget check: `allocations + (trap_count * 2) <= budget`
4. Trap validation: can only trap nodes you own
5. Store trap values in RoundMoves1v1

- [ ] **Step 1: Update the interface**

Change the trait at the top of the file:

```cairo
#[starknet::interface]
pub trait ICommitReveal1v1<T> {
    fn commit(ref self: T, match_id: u64, commitment: felt252);
    fn reveal(
        ref self: T,
        match_id: u64,
        salt: felt252,
        p0: u8, p1: u8, p2: u8,
        g0: u8, g1: u8, g2: u8,
        repair: u8,
        nc0: u8, nc1: u8, nc2: u8,
        trap0: u8, trap1: u8, trap2: u8,
    );
    fn force_timeout(ref self: T, match_id: u64);
}
```

- [ ] **Step 2: Update the reveal implementation**

In the `reveal` function inside `mod commit_reveal_1v1`, update the signature to match the trait, then update the hash, budget check, and storage:

Updated signature:
```cairo
fn reveal(
    ref self: ContractState,
    match_id: u64,
    salt: felt252,
    p0: u8, p1: u8, p2: u8,
    g0: u8, g1: u8, g2: u8,
    repair: u8,
    nc0: u8, nc1: u8, nc2: u8,
    trap0: u8, trap1: u8, trap2: u8,
) {
```

Updated hash (14 elements):
```cairo
// Verify hash: H(salt, p0..p2, g0..g2, repair, nc0..nc2, trap0..trap2)
let mut h = PoseidonTrait::new();
h = h.update(salt);
h = h.update(p0.into());
h = h.update(p1.into());
h = h.update(p2.into());
h = h.update(g0.into());
h = h.update(g1.into());
h = h.update(g2.into());
h = h.update(repair.into());
h = h.update(nc0.into());
h = h.update(nc1.into());
h = h.update(nc2.into());
h = h.update(trap0.into());
h = h.update(trap1.into());
h = h.update(trap2.into());
let computed = h.finalize();
assert(computed == c.hash, 'Invalid reveal');
```

Updated budget check:
```cairo
// Budget check: allocations + trap costs <= budget
let is_player_a = role == ROLE_A;
let budget = calc_budget(@world, match_id, is_player_a);
let trap_cost: u16 = (trap0.into() + trap1.into() + trap2.into()) * 2;
let total: u16 = p0.into() + p1.into() + p2.into()
    + g0.into() + g1.into() + g2.into()
    + repair.into()
    + nc0.into() + nc1.into() + nc2.into()
    + trap_cost;
assert(total <= budget.into(), 'Over budget');
```

Trap validation (add after budget check):
```cairo
// Trap validation: can only trap nodes you own, trap must be 0 or 1
assert(trap0 <= 1 && trap1 <= 1 && trap2 <= 1, 'Invalid trap value');
let owner_team = if is_player_a { NodeOwner::TeamA } else { NodeOwner::TeamB };
if trap0 == 1 {
    let n: NodeState = world.read_model((match_id, 0_u8));
    assert(n.owner == owner_team, 'Cannot trap unowned node');
}
if trap1 == 1 {
    let n: NodeState = world.read_model((match_id, 1_u8));
    assert(n.owner == owner_team, 'Cannot trap unowned node');
}
if trap2 == 1 {
    let n: NodeState = world.read_model((match_id, 2_u8));
    assert(n.owner == owner_team, 'Cannot trap unowned node');
}
```

Updated storage (add trap fields after node contest fields):
```cairo
if role == ROLE_A {
    rm.a_p0 = p0; rm.a_p1 = p1; rm.a_p2 = p2;
    rm.a_g0 = g0; rm.a_g1 = g1; rm.a_g2 = g2;
    rm.a_repair = repair;
    rm.a_nc0 = nc0; rm.a_nc1 = nc1; rm.a_nc2 = nc2;
    rm.a_trap0 = trap0; rm.a_trap1 = trap1; rm.a_trap2 = trap2;
} else {
    rm.b_p0 = p0; rm.b_p1 = p1; rm.b_p2 = p2;
    rm.b_g0 = g0; rm.b_g1 = g1; rm.b_g2 = g2;
    rm.b_repair = repair;
    rm.b_nc0 = nc0; rm.b_nc1 = nc1; rm.b_nc2 = nc2;
    rm.b_trap0 = trap0; rm.b_trap1 = trap1; rm.b_trap2 = trap2;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `sozo build`

- [ ] **Step 4: Commit**

```bash
git add src/systems/commit_reveal_1v1.cairo
git commit -m "feat: extend reveal with trap params, hash, budget, and validation"
```

---

## Task 3: Add Trap Trigger to `resolution_1v1`

**Files:**
- Modify: `src/systems/resolution_1v1.cairo`

Trap damage is applied AFTER gate damage + repair, AFTER node contests resolve. It's a separate damage source not subject to repair.

- [ ] **Step 1: Add trap logic after node contests**

In `resolution_1v1.cairo`, find the node contest loop (starts with `// Node contests`). After the node contest `while` loop ends (after the closing `};`), and BEFORE the `world.emit_event(@RoundResolved {...})` call, insert:

```cairo
            // Trap damage: if a node changed owner and the previous owner had a trap, deal 5 damage
            let mut trap_dmg_to_a: u8 = 0;
            let mut trap_dmg_to_b: u8 = 0;

            // Check each node for traps
            // We need to compare pre-contest and post-contest owners
            // Pre-contest owners were read before the contest loop above
            // Post-contest: re-read from world (updated by contest loop)
            let a_traps: [u8; 3] = [rm.a_trap0, rm.a_trap1, rm.a_trap2];
            let b_traps: [u8; 3] = [rm.b_trap0, rm.b_trap1, rm.b_trap2];

            let mut tn: u8 = 0;
            while tn < 3 {
                let pre_owner = *pre_node_owners.span()[tn.into()];
                let post_node: NodeState = world.read_model((match_id, tn));
                let post_owner = post_node.owner;

                // Node ownership changed?
                if pre_owner != post_owner {
                    // Did previous owner have a trap?
                    if pre_owner == NodeOwner::TeamA && *a_traps.span()[tn.into()] == 1 {
                        // Player A trapped this node, Player B took it → B takes 5 damage
                        trap_dmg_to_b += 5;
                    }
                    if pre_owner == NodeOwner::TeamB && *b_traps.span()[tn.into()] == 1 {
                        // Player B trapped this node, Player A took it → A takes 5 damage
                        trap_dmg_to_a += 5;
                    }
                }
                tn += 1;
            };

            // Apply trap damage (post-repair, cannot be repaired)
            if trap_dmg_to_a >= hp_a { hp_a = 0; } else { hp_a = hp_a - trap_dmg_to_a; }
            if trap_dmg_to_b >= hp_b { hp_b = 0; } else { hp_b = hp_b - trap_dmg_to_b; }

            state.vault_a_hp = hp_a;
            state.vault_b_hp = hp_b;
```

- [ ] **Step 2: Save pre-contest node owners**

Before the node contest loop, add code to snapshot node owners. Find the line `// Node contests (unaffected by gate modifiers)` and add before it:

```cairo
            // Snapshot node owners before contest resolution (for trap detection)
            let pre_n0: NodeState = world.read_model((match_id, 0_u8));
            let pre_n1: NodeState = world.read_model((match_id, 1_u8));
            let pre_n2: NodeState = world.read_model((match_id, 2_u8));
            let pre_node_owners: [NodeOwner; 3] = [pre_n0.owner, pre_n1.owner, pre_n2.owner];
```

- [ ] **Step 3: Update the RoundResolved event and win condition to use trap-adjusted HP**

The `state.vault_a_hp = hp_a; state.vault_b_hp = hp_b;` that was set after gate damage needs to be removed (since we're now setting it after trap damage). Find and remove the duplicate assignment that's currently at the line right after gate damage:

```cairo
            // Then damage
            if total_dmg_to_a >= hp_a { hp_a = 0; } else { hp_a = hp_a - total_dmg_to_a; }
            if total_dmg_to_b >= hp_b { hp_b = 0; } else { hp_b = hp_b - total_dmg_to_b; }

            state.vault_a_hp = hp_a;   // REMOVE this line
            state.vault_b_hp = hp_b;   // REMOVE this line
```

The `state.vault_a_hp = hp_a; state.vault_b_hp = hp_b;` now happens after trap damage instead.

- [ ] **Step 4: Verify it compiles**

Run: `sozo build`

- [ ] **Step 5: Commit**

```bash
git add src/systems/resolution_1v1.cairo
git commit -m "feat: add trap trigger logic to resolution_1v1"
```

---

## Task 4: Cairo Tests — `test_traps_1v1`

**Files:**
- Create: `src/tests/test_traps_1v1.cairo`
- Modify: `src/lib.cairo`

Tests bypass vRNG by writing models directly (same pattern as `test_modifiers_1v1`). Use `current_round: 10` to avoid vRNG call in resolution.

- [ ] **Step 1: Create `test_traps_1v1.cairo`**

Tests needed:
1. `test_trap_deals_5_damage` — Player A owns node 0, traps it. Player B contests and wins. B takes 5 damage.
2. `test_trap_not_triggered_if_not_contested` — Player A traps node 0, Player B doesn't contest. No damage, A keeps node.
3. `test_trap_only_on_owned_nodes` — Player A tries to trap a neutral node. Should panic.
4. `test_trap_costs_2_budget` — Player A sets trap + allocations totaling exactly budget (with 2-point trap cost). Verify it works.
5. `test_trap_over_budget_rejected` — Player A sets trap + allocations exceeding budget. Should panic.

The test file follows the same pattern as `test_modifiers_1v1.cairo` — manual match creation via `write_model_test`, write `RoundModifiers1v1` (all normal), and play via commit_reveal.

Important: The hash for commit must now include trap values (14 elements):
```cairo
fn hash_1v1_with_traps(
    salt: felt252,
    p0: u8, p1: u8, p2: u8,
    g0: u8, g1: u8, g2: u8,
    repair: u8,
    nc0: u8, nc1: u8, nc2: u8,
    trap0: u8, trap1: u8, trap2: u8,
) -> felt252 {
    let mut h = PoseidonTrait::new();
    h = h.update(salt);
    h = h.update(p0.into()); h = h.update(p1.into()); h = h.update(p2.into());
    h = h.update(g0.into()); h = h.update(g1.into()); h = h.update(g2.into());
    h = h.update(repair.into());
    h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
    h = h.update(trap0.into()); h = h.update(trap1.into()); h = h.update(trap2.into());
    h.finalize()
}
```

The reveal call now takes 3 extra params:
```cairo
cr_sys.reveal(match_id, salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2);
```

For `test_trap_deals_5_damage`:
- Setup: Player A owns node 0 (write `NodeState { node_index: 0, owner: TeamA }`)
- Player A: atk [0,0,0], def [0,0,0], repair 0, nodes [0,0,0], traps [1,0,0] = total 2 (trap cost). Budget 11 (10 + 1 node).
- Player B: atk [0,0,0], def [0,0,0], repair 0, nodes [5,0,0], traps [0,0,0] = total 5. Budget 10.
- Player B contests node 0 with 5 vs A's 0 → B wins node 0
- Trap triggers: B takes 5 damage
- Expected: HP_A = 50, HP_B = 45

For `test_trap_not_triggered_if_not_contested`:
- Player A owns node 0, traps it. Player B doesn't contest (nc0=0).
- Node stays with A (A's nc0=0 too, tie keeps current owner).
- No ownership change → trap not triggered.
- Expected: HP_A = 50, HP_B = 50

For `test_trap_only_on_owned_nodes`:
- All nodes neutral. Player A tries trap0=1. Should panic with 'Cannot trap unowned node'.

For `test_trap_costs_2_budget`:
- Player A owns node 0 (budget=11). Allocates: atk [3,3,0], def [0,0,0], repair 0, nodes [0,0,0], traps [1,0,0] = 6+2=8. Under budget. Should succeed.

For `test_trap_over_budget_rejected`:
- Player A owns node 0 (budget=11). Allocates: atk [5,3,0], def [0,0,0], repair 0, nodes [1,0,0], traps [1,0,0] = 9+2=11. Player B also needs valid budget. Actually let's make it clearer: budget=11, allocations=5+3+2=10, trap cost=2, total=12 > 11. Should panic.

- [ ] **Step 2: Register test in `lib.cairo`**

Add `pub mod test_traps_1v1;` to the tests block.

- [ ] **Step 3: Run tests**

Run: `sozo test -f test_traps_1v1`
Expected: All 5 tests pass (or 3 pass + 2 should_panic pass).

- [ ] **Step 4: Commit**

```bash
git add src/tests/test_traps_1v1.cairo src/lib.cairo
git commit -m "test: add trap tests (trigger, no-trigger, validation, budget)"
```

---

## Task 5: Deploy to Sepolia

**Files:** No code changes — deployment step.

- [ ] **Step 1: Build and migrate**

```bash
export DOJO_ACCOUNT_ADDRESS="0x040a26c15f86b70cc384d042ce0d87283e801bb459f369c4f588be3070c37f95"
export DOJO_PRIVATE_KEY="0x045665a95013a3060e87538a4271eeab7738e78fcf317e52f279f16c8cc6c483"
/tmp/sozo build -P sepolia
/tmp/sozo -P sepolia migrate
```

- [ ] **Step 2: Grant permissions**

```bash
/tmp/sozo -P sepolia auth grant writer \
  siege_dojo,siege_dojo-actions_1v1 \
  siege_dojo,siege_dojo-commit_reveal_1v1 \
  siege_dojo,siege_dojo-resolution_1v1
```

- [ ] **Step 3: Check contract addresses and commit manifest**

```bash
git add manifest_sepolia.json
git commit -m "deploy: migrate node traps to Sepolia"
```

---

## Task 6: Frontend — Update Crypto, Contracts, Game State

**Files:**
- Modify: `frontend/src/lib/crypto.ts`
- Modify: `frontend/src/lib/contracts1v1.ts`
- Modify: `frontend/src/lib/gameState1v1.ts`

- [ ] **Step 1: Update `computeCommitment1v1` in `crypto.ts`**

Replace the existing function with:

```typescript
export function computeCommitment1v1(
  salt: string,
  p0: number, p1: number, p2: number,
  g0: number, g1: number, g2: number,
  repair: number,
  nc0: number, nc1: number, nc2: number,
  trap0: number, trap1: number, trap2: number,
): string {
  return hash.computePoseidonHashOnElements([
    salt,
    p0.toString(), p1.toString(), p2.toString(),
    g0.toString(), g1.toString(), g2.toString(),
    repair.toString(),
    nc0.toString(), nc1.toString(), nc2.toString(),
    trap0.toString(), trap1.toString(), trap2.toString(),
  ]);
}
```

- [ ] **Step 2: Update `revealMove1v1` in `contracts1v1.ts`**

Add 3 trap params to the function signature and calldata:

```typescript
export async function revealMove1v1(
  account: AccountInterface,
  matchId: string,
  salt: string,
  p0: string, p1: string, p2: string,
  g0: string, g1: string, g2: string,
  repair: string,
  nc0: string, nc1: string, nc2: string,
  trap0: string, trap1: string, trap2: string,
  includeVrf: boolean,
) {
  const revealCall = {
    contractAddress: CONTRACTS_1V1.COMMIT_REVEAL,
    entrypoint: "reveal",
    calldata: [matchId, salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2],
  };

  if (includeVrf) {
    return account.execute(
      [vrfRequestRandomCall(CONTRACTS_1V1.RESOLUTION), revealCall],
      TX_OPTS,
    );
  }

  return account.execute(revealCall, TX_OPTS);
}
```

- [ ] **Step 3: Update `RoundResult1v1` and round history in `gameState1v1.ts`**

Add trap fields to the `RoundResult1v1` interface:

```typescript
export interface RoundResult1v1 {
  round: number;
  aAttack: number[];
  aDefense: number[];
  bAttack: number[];
  bDefense: number[];
  damageToA: number;
  damageToB: number;
  modifiers: [number, number, number];
  gateBreakdown: GateDamage[];
  aTraps: [number, number, number];
  bTraps: [number, number, number];
  trapDmgToA: number;
  trapDmgToB: number;
}
```

Update the GraphQL query in `useRoundHistory1v1` to fetch trap fields — add `a_trap0 a_trap1 a_trap2 b_trap0 b_trap1 b_trap2` to the query fields.

Update the result mapping to include trap data. After computing `gateBreakdown`, add:

```typescript
const aTraps: [number, number, number] = [toNum(n.a_trap0), toNum(n.a_trap1), toNum(n.a_trap2)];
const bTraps: [number, number, number] = [toNum(n.b_trap0), toNum(n.b_trap1), toNum(n.b_trap2)];
// Trap damage is not computable client-side (requires pre/post node ownership)
// So we report trap state and let the HP diff tell the story
```

Set `trapDmgToA: 0, trapDmgToB: 0` for now — exact trap damage is reflected in the HP change from the contract. The trap flags show which nodes were trapped.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/crypto.ts frontend/src/lib/contracts1v1.ts frontend/src/lib/gameState1v1.ts
git commit -m "feat: update crypto, contracts, game state for trap params"
```

---

## Task 7: Frontend — AllocationForm1v1 Trap Toggles

**Files:**
- Modify: `frontend/src/components/AllocationForm1v1.tsx`

- [ ] **Step 1: Update the component**

The form now:
- Accepts `nodes` (ownership) and `isPlayerA` props
- Manages 13-element allocations array (indices 10-12 are traps)
- Shows trap toggle for each node the player owns
- Toggling trap: sets trap=1, disables node contest slider, deducts 2 from budget

Replace the entire file:

```typescript
"use client";

import type { NodeOwner } from "@/lib/gameState1v1";

interface AllocationForm1v1Props {
  budget: number;
  allocations: number[];
  onChange: (allocations: number[]) => void;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
  isPlayerA: boolean;
}

const GATE_LABELS = [
  "Attack: East Gate",
  "Attack: West Gate",
  "Attack: Underground",
  "Defend: East Gate",
  "Defend: West Gate",
  "Defend: Underground",
  "Repair",
];

const NODE_LABELS = ["Node 1", "Node 2", "Node 3"];

const SECTION_BREAKS: Record<number, string> = {
  0: "ATTACK",
  3: "DEFENSE",
  6: "SUPPORT",
};

export function AllocationForm1v1({ budget, allocations, onChange, nodes, isPlayerA }: AllocationForm1v1Props) {
  const trapCost = ((allocations[10] || 0) + (allocations[11] || 0) + (allocations[12] || 0)) * 2;
  const allocationTotal = allocations.slice(0, 10).reduce((a, b) => a + b, 0);
  const total = allocationTotal + trapCost;
  const remaining = budget - total;

  const myTeam: NodeOwner = isPlayerA ? "teamA" : "teamB";

  const handleChange = (index: number, value: number) => {
    const clamped = Math.max(0, value);
    const newAlloc = [...allocations];
    newAlloc[index] = clamped;
    const newTrapCost = ((newAlloc[10] || 0) + (newAlloc[11] || 0) + (newAlloc[12] || 0)) * 2;
    const newTotal = newAlloc.slice(0, 10).reduce((a, b) => a + b, 0) + newTrapCost;
    if (newTotal <= budget) {
      onChange(newAlloc);
    }
  };

  const handleTrapToggle = (nodeIndex: number) => {
    const trapIdx = 10 + nodeIndex;
    const newAlloc = [...allocations];
    if (newAlloc[trapIdx] === 1) {
      // Untrap
      newAlloc[trapIdx] = 0;
    } else {
      // Trap — also zero out the node contest
      newAlloc[trapIdx] = 1;
      newAlloc[7 + nodeIndex] = 0;
    }
    const newTrapCost = ((newAlloc[10] || 0) + (newAlloc[11] || 0) + (newAlloc[12] || 0)) * 2;
    const newTotal = newAlloc.slice(0, 10).reduce((a, b) => a + b, 0) + newTrapCost;
    if (newTotal <= budget) {
      onChange(newAlloc);
    }
  };

  return (
    <div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a] space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs tracking-wider text-[#6a6a7a] uppercase">
          Allocate Your Budget
        </span>
        <span className={`text-sm font-bold ${remaining === 0 ? "text-green-400" : remaining < 0 ? "text-red-400" : "text-[#ffd700]"}`}>
          Remaining: {remaining}
        </span>
      </div>

      {/* Attack, Defense, Repair (indices 0-6) */}
      {GATE_LABELS.map((label, i) => (
        <div key={label}>
          {SECTION_BREAKS[i] && (
            <div className="text-[10px] tracking-wider text-[#6a6a7a] uppercase mt-2 mb-1 border-t border-[#2a2a3a] pt-2">
              {SECTION_BREAKS[i]}
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#6a6a7a] w-32 truncate">{label}</span>
            <input
              type="range"
              min={0}
              max={budget}
              value={allocations[i] || 0}
              onChange={(e) => handleChange(i, parseInt(e.target.value))}
              className="flex-1"
            />
            <input
              type="number"
              min={0}
              max={budget}
              value={allocations[i] || 0}
              onChange={(e) => handleChange(i, Math.max(0, parseInt(e.target.value) || 0))}
              className="w-12 text-center bg-[#1a1a26] border border-[#2a2a3a] rounded text-sm py-1"
            />
          </div>
        </div>
      ))}

      {/* Nodes (indices 7-9) with trap toggles (indices 10-12) */}
      <div className="text-[10px] tracking-wider text-[#6a6a7a] uppercase mt-2 mb-1 border-t border-[#2a2a3a] pt-2">
        NODES
      </div>
      {NODE_LABELS.map((label, ni) => {
        const nodeIdx = 7 + ni;
        const trapIdx = 10 + ni;
        const isTrapped = allocations[trapIdx] === 1;
        const canTrap = nodes[ni] === myTeam;

        return (
          <div key={label} className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#6a6a7a] w-32 truncate">{label}</span>
              {isTrapped ? (
                <div className="flex-1 text-center text-xs text-[#ff3344]">TRAPPED (cost: 2)</div>
              ) : (
                <>
                  <input
                    type="range"
                    min={0}
                    max={budget}
                    value={allocations[nodeIdx] || 0}
                    onChange={(e) => handleChange(nodeIdx, parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min={0}
                    max={budget}
                    value={allocations[nodeIdx] || 0}
                    onChange={(e) => handleChange(nodeIdx, Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-12 text-center bg-[#1a1a26] border border-[#2a2a3a] rounded text-sm py-1"
                  />
                </>
              )}
              {canTrap && (
                <button
                  onClick={() => handleTrapToggle(ni)}
                  className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                    isTrapped
                      ? "border-[#ff3344] bg-[#ff3344]/20 text-[#ff3344]"
                      : "border-[#2a2a3a] text-[#6a6a7a] hover:border-[#ff3344] hover:text-[#ff3344]"
                  }`}
                >
                  {isTrapped ? "DISARM" : "TRAP"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex justify-between text-xs text-[#6a6a7a] pt-2 border-t border-[#2a2a3a]">
        <span>
          Points: {allocationTotal} + Traps: {trapCost} = {total} / {budget}
        </span>
        {remaining !== 0 && (
          <span className="text-[#ffd700]">Must allocate exactly {budget}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/AllocationForm1v1.tsx
git commit -m "feat: add trap toggles to allocation form"
```

---

## Task 8: Frontend — Match Page Integration

**Files:**
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx`

- [ ] **Step 1: Extend allocations array from 10 to 13**

Find the useState for allocations and change:
```typescript
const [allocations, setAllocations] = useState<number[]>(new Array(13).fill(0));
```

Also update the reset on round change:
```typescript
setAllocations(new Array(13).fill(0));
```

- [ ] **Step 2: Pass node ownership to AllocationForm1v1**

Update the AllocationForm1v1 usage to pass nodes and isPlayerA:

```tsx
{state.phase === "committing" && !committed && (
  <AllocationForm1v1
    budget={budget}
    allocations={allocations}
    onChange={setAllocations}
    nodes={state.nodes}
    isPlayerA={isPlayerA}
  />
)}
```

- [ ] **Step 3: Update commit handler to hash 14 elements**

Update `computeCommitment1v1` call:
```typescript
const commitment = computeCommitment1v1(
  salt,
  allocations[0], allocations[1], allocations[2],
  allocations[3], allocations[4], allocations[5],
  allocations[6],
  allocations[7], allocations[8], allocations[9],
  allocations[10], allocations[11], allocations[12],
);
```

- [ ] **Step 4: Update auto-reveal to pass trap values**

Update the `revealMove1v1` call in the auto-reveal effect:

```typescript
await revealMove1v1(
  account, matchId, salt,
  move[0].toString(), move[1].toString(), move[2].toString(),
  move[3].toString(), move[4].toString(), move[5].toString(),
  move[6].toString(),
  move[7].toString(), move[8].toString(), move[9].toString(),
  move[10].toString(), move[11].toString(), move[12].toString(),
  includeVrf,
);
```

- [ ] **Step 5: Add trap info to round history display**

In the round history section, after the gate breakdown grid, add trap info if any traps were placed:

```tsx
{(r.aTraps.some(t => t > 0) || r.bTraps.some(t => t > 0)) && (
  <div className="text-[10px] text-[#ff3344] mt-1">
    {[0, 1, 2].map(ni => {
      const myTrap = isPlayerA ? r.aTraps[ni] : r.bTraps[ni];
      const theirTrap = isPlayerA ? r.bTraps[ni] : r.aTraps[ni];
      if (myTrap) return <div key={`mt${ni}`}>You trapped Node {ni + 1}</div>;
      if (theirTrap) return <div key={`tt${ni}`}>Enemy trapped Node {ni + 1}!</div>;
      return null;
    })}
  </div>
)}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/match-1v1/[id]/page.tsx
git commit -m "feat: integrate traps into match page (allocations, reveal, display)"
```

---

## Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add trap docs after Gate Modifiers section**

```markdown
### Node Traps

Players can trap resource nodes they own:
- **Cost**: 2 budget points per trap
- **Effect**: When opponent takes a trapped node, they take 5 vault damage (post-repair, not repairable)
- **Constraints**: Can only trap nodes you own. Trapping gives up contesting (your contest spend = 0)
- **Hidden**: Traps are committed in the Poseidon hash and revealed with all other allocations
- **Consumed**: Traps last one round — must be re-placed each round

Allocation array is 13 elements: `[p0,p1,p2, g0,g1,g2, repair, nc0,nc1,nc2, trap0,trap1,trap2]`
Poseidon hash is 14 elements (salt + 13 allocations).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add node trap docs to CLAUDE.md"
```
