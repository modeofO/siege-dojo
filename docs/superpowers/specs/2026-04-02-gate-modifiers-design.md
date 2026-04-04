# Gate Modifiers with vRNG — Design Spec

## Goal

Add per-gate modifiers that change the rules of engagement each round, using Cartridge's verifiable random number generator (vRNG) for on-chain randomness. Both players see the modifiers before allocating, creating shared-information strategic dilemmas.

## Modifier Set

Each gate independently rolls a modifier at the start of each round. Probabilities weight heavily toward Normal.

| Modifier | ID | Probability | Effect |
|----------|-----|------------|--------|
| **Normal** | 0 | 60% | No change |
| **Narrow Pass** | 1 | 10% | Attack and defense capped at 3 on this gate |
| **Mirror Gate** | 2 | 10% | Attack and defense values swap at this gate — your attack points become defense, their defense becomes attack |
| **Deadlock** | 3 | 10% | No damage dealt at this gate — all points spent here are wasted for damage purposes |
| **Overflow** | 4 | 10% | Unblocked damage at this gate splits evenly (rounded down) across the other two gates as bonus damage |

### Probability Distribution

Per gate: 60% Normal, 10% each for the 4 modifiers. Three independent rolls per round.

Expected distribution per round:
- ~22% of rounds: 0 modifiers (all three gates Normal)
- ~44% of rounds: 1 modifier
- ~28% of rounds: 2 modifiers
- ~6% of rounds: 3 modifiers

## Modifier Mechanics (Detailed)

### Narrow Pass (ID 1)
- Before damage calculation, clamp: `attack = min(attack, 3)`, `defense = min(defense, 3)`
- Does not affect node contest allocations

### Mirror Gate (ID 2)
- At this gate, swap the attack and defense values: Player A's attack points at this gate become their defense, Player B's defense at this gate becomes their attack (and vice versa)
- Specifically: damage at this gate is calculated as `max(0, defense_B - attack_A)` dealt to vault A, and `max(0, defense_A - attack_B)` dealt to vault B
- Players who anticipate the swap can game it: put high "attack" knowing it'll actually defend

### Deadlock (ID 3)
- Skip damage calculation entirely for this gate
- Points allocated to attack/defense here produce zero damage
- Node contest allocations are unaffected
- Players who spot the Deadlock can reallocate elsewhere; players who don't waste points

### Overflow (ID 4)
- Calculate damage at this gate normally: `overflow_dmg = max(0, attack - defense)`
- This damage is NOT applied to the vault directly
- Instead, `floor(overflow_dmg / 2)` is added as bonus damage to each of the other two gates (after their own damage is calculated)
- Overflow bonus damage is NOT subject to the other gates' defense — it's pure additional damage
- Overflow does not chain (overflow from one gate doesn't re-overflow from another)

## Resolution Order

1. Read `RoundModifiers1v1` for the current round
2. For each gate, apply Narrow Pass clamping (if applicable)
3. For each gate, apply Mirror swap (if applicable)
4. Calculate raw damage per gate:
   - Normal gates: `max(0, attack - defense)`
   - Deadlock gates: 0
   - Overflow gates: calculate `max(0, attack - defense)` but store as overflow, not direct damage
5. Distribute overflow: for each Overflow gate, add `floor(overflow_dmg / 2)` to each of the other two gates' damage totals
6. Sum all damage to each vault
7. Apply repair (capped at 3) before damage, HP capped at 50
8. Apply total damage
9. Node contests (unaffected by gate modifiers)
10. Generate next round's modifiers via vRNG
11. Check win condition

## vRNG Integration

### Contract Address
Sepolia: `0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f`

### Interface
```cairo
#[starknet::interface]
trait IVrfProvider<TContractState> {
    fn request_random(self: @TContractState, caller: ContractAddress, source: Source);
    fn consume_random(ref self: TContractState, source: Source) -> felt252;
}

enum Source {
    Nonce: ContractAddress,
    Salt: felt252,
}
```

### When Randomness Is Consumed

**Match creation (`actions_1v1.create_match_1v1`):**
- Consumes one random value to generate round 1 modifiers
- Source: `Source::Nonce(contract_address)` where contract_address is the actions_1v1 contract

**Round resolution (`resolution_1v1.resolve_round`):**
- Consumes one random value to generate next round's modifiers
- Source: `Source::Nonce(contract_address)` where contract_address is the resolution_1v1 contract

### Random Value → Modifier Mapping

One `felt252` random value produces three gate modifiers:

```
gate_0_roll = random_value % 10        // 0-9
gate_1_roll = (random_value / 10) % 10 // 0-9
gate_2_roll = (random_value / 100) % 10 // 0-9

For each roll:
  0-5 → Normal (60%)
  6   → Narrow Pass (10%)
  7   → Mirror Gate (10%)
  8   → Deadlock (10%)
  9   → Overflow (10%)
```

## New Model

```cairo
#[dojo::model]
#[derive(Drop, Serde)]
pub struct RoundModifiers1v1 {
    #[key]
    pub match_id: u64,
    #[key]
    pub round: u32,
    pub gate_0: u8,  // 0=Normal, 1=NarrowPass, 2=Mirror, 3=Deadlock, 4=Overflow
    pub gate_1: u8,
    pub gate_2: u8,
}
```

## Contract Changes

### `actions_1v1.cairo`
- Import vRNG dispatcher
- In `create_match_1v1`: consume random, compute 3 modifiers, write `RoundModifiers1v1` for round 1

### `resolution_1v1.cairo`
- Import vRNG dispatcher
- Apply modifier logic during damage calculation (see Resolution Order above)
- After resolution: consume random, compute 3 modifiers, write `RoundModifiers1v1` for next round
- Only generate next round modifiers if match is still Active (not Finished)

### `commit_reveal_1v1.cairo`
- No changes needed — modifiers don't affect commit/reveal logic

## Frontend Changes

### Multicall for vRNG

The `request_random` call must be the first call in a multicall. This affects:

**`create_match_1v1`** — frontend must send multicall:
```typescript
account.execute([
  { contractAddress: VRF_PROVIDER, entrypoint: "request_random", calldata: [ACTIONS_1V1_ADDR, { type: 0, address: account.address }] },
  { contractAddress: ACTIONS_1V1, entrypoint: "create_match_1v1", calldata: [playerA, playerB] },
]);
```

**`reveal`** (2nd reveal triggers resolution which consumes random) — frontend must send multicall:
```typescript
account.execute([
  { contractAddress: VRF_PROVIDER, entrypoint: "request_random", calldata: [RESOLUTION_1V1_ADDR, { type: 0, address: account.address }] },
  { contractAddress: COMMIT_REVEAL_1V1, entrypoint: "reveal", calldata: [...] },
]);
```

Note: Only the 2nd reveal triggers resolution. The 1st reveal doesn't need `request_random`. The frontend can always include it (harmless if not consumed) or check `commitCount` to decide.

### `contracts1v1.ts`
- Update `createMatch1v1` to multicall with `request_random`
- Update `revealMove1v1` to multicall with `request_random`
- Add `VRF_PROVIDER_ADDRESS` constant

### `gameState1v1.ts`
- Add `useRoundModifiers1v1(matchId, round)` hook
- Queries `siegeDojoRoundModifiers1V1Models` (note uppercase V)
- Returns `{ gate0: number, gate1: number, gate2: number }`

### Match page (`match-1v1/[id]/page.tsx`)
- Display modifiers above each gate in the allocation form
- Modifier labels with visual indicators (icon or color per modifier type)
- Show modifier descriptions on hover or inline

### Session Policies
- Add `request_random` on VRF provider address to Cartridge Controller policies

## Constants

```
VRF_PROVIDER_ADDRESS = 0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f
RESOLUTION_1V1_ADDRESS = 0x1b31a6098f1b9081e925e98cd9627c6a5cce39073e92c3f5bf827cb09abe36b
```

## Out of Scope

- Traps (future feature, builds on gate modifiers)
- Special abilities (future feature)
- Modifier history display in round history panel (nice-to-have, not required)
- Custom modifier probability curves
