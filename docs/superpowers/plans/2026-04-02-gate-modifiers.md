# Gate Modifiers with vRNG — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-gate modifiers (Narrow Pass, Mirror, Deadlock, Overflow) generated via Cartridge vRNG, changing the rules of engagement each round.

**Architecture:** New `RoundModifiers1v1` model stores per-gate modifiers. `actions_1v1` generates round 1 modifiers at match creation via vRNG. `resolution_1v1` applies modifiers during damage calc and generates next round's modifiers. Frontend displays modifiers and wraps transactions in vRNG multicalls.

**Tech Stack:** Cairo 2.13.1 / Dojo v1.8.0, Cartridge vRNG (`0x051fea...`), starknet.js v8 multicall

**Spec:** `docs/superpowers/specs/2026-04-02-gate-modifiers-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/models/round_modifiers_1v1.cairo` | On-chain model for per-gate modifiers |
| Modify | `src/models/events.cairo` | (no change — reuses existing events) |
| Modify | `src/systems/actions_1v1.cairo` | vRNG call to generate round 1 modifiers |
| Modify | `src/systems/resolution_1v1.cairo` | Apply modifiers during damage calc + generate next round modifiers |
| Modify | `src/lib.cairo` | Register new model + test module |
| Create | `src/tests/test_modifiers_1v1.cairo` | Tests for modifier mechanics |
| Modify | `frontend/src/lib/contracts1v1.ts` | Multicall with request_random |
| Modify | `frontend/src/lib/gameState1v1.ts` | Add useRoundModifiers1v1 hook |
| Modify | `frontend/src/app/providers.tsx` | Add vRNG session policy |
| Modify | `frontend/src/app/match-1v1/[id]/page.tsx` | Display modifiers above gates |
| Modify | `frontend/src/app/match-1v1/create/page.tsx` | Multicall for match creation |

---

## Task 1: New Model — `RoundModifiers1v1`

**Files:**
- Create: `src/models/round_modifiers_1v1.cairo`
- Modify: `src/lib.cairo`

- [ ] **Step 1: Create `round_modifiers_1v1.cairo`**

```cairo
// src/models/round_modifiers_1v1.cairo

// Modifier IDs:
// 0 = Normal
// 1 = Narrow Pass (attack and defense capped at 3)
// 2 = Mirror Gate (attack/defense swap)
// 3 = Deadlock (no damage)
// 4 = Overflow (damage splits to other gates)

#[dojo::model]
#[derive(Drop, Serde)]
pub struct RoundModifiers1v1 {
    #[key]
    pub match_id: u64,
    #[key]
    pub round: u32,
    pub gate_0: u8,
    pub gate_1: u8,
    pub gate_2: u8,
}
```

- [ ] **Step 2: Register in `lib.cairo`**

Add `pub mod round_modifiers_1v1;` to the models block in `src/lib.cairo`, after `round_moves_1v1`:

```cairo
pub mod models {
    pub mod match_state;
    pub mod match_state_1v1;
    pub mod node_state;
    pub mod commitment;
    pub mod round_moves;
    pub mod round_moves_1v1;
    pub mod round_modifiers_1v1;
    pub mod match_counter;
    pub mod events;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `sozo build`
Expected: Successful compilation.

- [ ] **Step 4: Commit**

```bash
git add src/models/round_modifiers_1v1.cairo src/lib.cairo
git commit -m "feat: add RoundModifiers1v1 model"
```

---

## Task 2: Shared vRNG Helper + Update `actions_1v1`

**Files:**
- Modify: `src/systems/actions_1v1.cairo`

The vRNG interface and modifier generation logic will be used by both `actions_1v1` (match creation) and `resolution_1v1` (round resolution). We define the vRNG interface and helper function in `actions_1v1` and import from there, or duplicate the small helper. Since Cairo doesn't support standalone free functions easily across modules in Dojo, we'll define the vRNG interface in each system that uses it (small duplication is acceptable for 2 call sites).

- [ ] **Step 1: Update `actions_1v1.cairo` with vRNG**

Replace the entire file `src/systems/actions_1v1.cairo` with:

```cairo
use starknet::ContractAddress;

#[starknet::interface]
pub trait IActions1v1<T> {
    fn create_match_1v1(
        ref self: T,
        player_a: ContractAddress,
        player_b: ContractAddress,
    ) -> u64;
    fn get_budget_1v1(self: @T, match_id: u64, is_player_a: bool) -> u8;
}

#[starknet::interface]
pub trait IVrfProvider<T> {
    fn consume_random(ref self: T, source: Source) -> felt252;
}

#[derive(Drop, Copy, Clone, Serde)]
pub enum Source {
    Nonce: ContractAddress,
    Salt: felt252,
}

#[dojo::contract]
pub mod actions_1v1 {
    use starknet::{ContractAddress, get_contract_address};
    use dojo::model::ModelStorage;
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::MatchState1v1;
    use siege_dojo::models::node_state::{NodeState, NodeOwner};
    use siege_dojo::models::match_counter::MatchCounter;
    use siege_dojo::models::round_modifiers_1v1::RoundModifiers1v1;
    use siege_dojo::models::events::MatchCreated1v1;
    use dojo::event::EventStorage;
    use super::{IVrfProviderDispatcher, IVrfProviderDispatcherTrait, Source};

    const VRF_PROVIDER_ADDRESS: felt252 =
        0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    fn random_to_modifiers(random_value: felt252) -> (u8, u8, u8) {
        let r: u256 = random_value.into();
        let roll_0: u8 = (r % 10).try_into().unwrap();
        let roll_1: u8 = ((r / 10) % 10).try_into().unwrap();
        let roll_2: u8 = ((r / 100) % 10).try_into().unwrap();

        let to_modifier = |roll: u8| -> u8 {
            if roll <= 5 { 0 }       // Normal (60%)
            else if roll == 6 { 1 }   // Narrow Pass (10%)
            else if roll == 7 { 2 }   // Mirror Gate (10%)
            else if roll == 8 { 3 }   // Deadlock (10%)
            else { 4 }                // Overflow (10%)
        };

        (to_modifier(roll_0), to_modifier(roll_1), to_modifier(roll_2))
    }

    #[abi(embed_v0)]
    impl Actions1v1Impl of super::IActions1v1<ContractState> {
        fn create_match_1v1(
            ref self: ContractState,
            player_a: ContractAddress,
            player_b: ContractAddress,
        ) -> u64 {
            let mut world = self.world_default();
            let mut counter: MatchCounter = world.read_model(0_u8);
            let match_id = counter.count + 1;
            counter.count = match_id;
            world.write_model(@counter);

            world.write_model(@MatchState1v1 {
                match_id,
                player_a,
                player_b,
                vault_a_hp: 50,
                vault_b_hp: 50,
                current_round: 1,
                status: MatchStatus::Active,
            });

            let mut i: u8 = 0;
            while i < 3 {
                world.write_model(@NodeState {
                    match_id,
                    node_index: i,
                    owner: NodeOwner::None,
                });
                i += 1;
            };

            // Generate round 1 modifiers via vRNG
            let vrf = IVrfProviderDispatcher {
                contract_address: VRF_PROVIDER_ADDRESS.try_into().unwrap(),
            };
            let random_value = vrf.consume_random(Source::Nonce(get_contract_address()));
            let (g0, g1, g2) = random_to_modifiers(random_value);
            world.write_model(@RoundModifiers1v1 {
                match_id,
                round: 1,
                gate_0: g0,
                gate_1: g1,
                gate_2: g2,
            });

            world.emit_event(@MatchCreated1v1 {
                match_id,
                player_a,
                player_b,
            });

            match_id
        }

        fn get_budget_1v1(self: @ContractState, match_id: u64, is_player_a: bool) -> u8 {
            let world = self.world_default();
            let target = if is_player_a { NodeOwner::TeamA } else { NodeOwner::TeamB };
            let mut bonus: u8 = 0;
            let mut i: u8 = 0;
            while i < 3 {
                let node: NodeState = world.read_model((match_id, i));
                if node.owner == target {
                    bonus += 1;
                }
                i += 1;
            };
            10 + bonus
        }
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `sozo build`
Expected: Successful compilation.

- [ ] **Step 3: Commit**

```bash
git add src/systems/actions_1v1.cairo
git commit -m "feat: add vRNG modifier generation to actions_1v1"
```

---

## Task 3: Update `resolution_1v1` with Modifier Logic

**Files:**
- Modify: `src/systems/resolution_1v1.cairo`

This is the core change — applying modifiers during damage calculation and generating next round's modifiers.

- [ ] **Step 1: Replace `resolution_1v1.cairo`**

Replace the entire file `src/systems/resolution_1v1.cairo` with:

```cairo
#[starknet::interface]
pub trait IResolution1v1<T> {
    fn resolve_round(ref self: T, match_id: u64);
}

#[starknet::interface]
pub trait IVrfProviderRes<T> {
    fn consume_random(ref self: T, source: Source) -> felt252;
}

#[derive(Drop, Copy, Clone, Serde)]
pub enum Source {
    Nonce: ContractAddress,
    Salt: felt252,
}

use starknet::ContractAddress;

#[dojo::contract]
pub mod resolution_1v1 {
    use starknet::get_contract_address;
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::MatchState1v1;
    use siege_dojo::models::node_state::{NodeState, NodeOwner};
    use siege_dojo::models::round_moves_1v1::RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::RoundModifiers1v1;
    use siege_dojo::models::events::{RoundResolved, MatchFinished};
    use super::{IVrfProviderResDispatcher, IVrfProviderResDispatcherTrait, Source};

    const VRF_PROVIDER_ADDRESS: felt252 =
        0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f;

    // Modifier constants
    const MOD_NORMAL: u8 = 0;
    const MOD_NARROW_PASS: u8 = 1;
    const MOD_MIRROR: u8 = 2;
    const MOD_DEADLOCK: u8 = 3;
    const MOD_OVERFLOW: u8 = 4;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    fn random_to_modifiers(random_value: felt252) -> (u8, u8, u8) {
        let r: u256 = random_value.into();
        let roll_0: u8 = (r % 10).try_into().unwrap();
        let roll_1: u8 = ((r / 10) % 10).try_into().unwrap();
        let roll_2: u8 = ((r / 100) % 10).try_into().unwrap();

        let to_modifier = |roll: u8| -> u8 {
            if roll <= 5 { 0 }
            else if roll == 6 { 1 }
            else if roll == 7 { 2 }
            else if roll == 8 { 3 }
            else { 4 }
        };

        (to_modifier(roll_0), to_modifier(roll_1), to_modifier(roll_2))
    }

    fn min_u8(a: u8, b: u8) -> u8 {
        if a < b { a } else { b }
    }

    #[abi(embed_v0)]
    impl Resolution1v1Impl of super::IResolution1v1<ContractState> {
        fn resolve_round(ref self: ContractState, match_id: u64) {
            let mut world = self.world_default();
            let mut state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Active, 'Match not active');

            let round = state.current_round;
            let rm: RoundMoves1v1 = world.read_model((match_id, round));
            assert(rm.reveal_count == 2, 'Not all revealed');

            // Read modifiers
            let mods: RoundModifiers1v1 = world.read_model((match_id, round));
            let gate_mods: [u8; 3] = [mods.gate_0, mods.gate_1, mods.gate_2];

            // Raw attack/defense values from moves
            let a_atk: [u8; 3] = [rm.a_p0, rm.a_p1, rm.a_p2];
            let a_def: [u8; 3] = [rm.a_g0, rm.a_g1, rm.a_g2];
            let b_atk: [u8; 3] = [rm.b_p0, rm.b_p1, rm.b_p2];
            let b_def: [u8; 3] = [rm.b_g0, rm.b_g1, rm.b_g2];

            // Per-gate damage calculation with modifiers
            // damage_to_b[i] = damage dealt by A to B's vault at gate i
            // damage_to_a[i] = damage dealt by B to A's vault at gate i
            let mut damage_to_b: [u8; 3] = [0, 0, 0];
            let mut damage_to_a: [u8; 3] = [0, 0, 0];
            let mut overflow_to_b: [u8; 3] = [0, 0, 0];
            let mut overflow_to_a: [u8; 3] = [0, 0, 0];

            let mut g: u32 = 0;
            while g < 3 {
                let modifier = *gate_mods.span()[g];
                let mut aa = *a_atk.span()[g]; // A's attack at gate g
                let mut ad = *a_def.span()[g]; // A's defense at gate g
                let mut ba = *b_atk.span()[g]; // B's attack at gate g
                let mut bd = *b_def.span()[g]; // B's defense at gate g

                if modifier == MOD_NARROW_PASS {
                    aa = min_u8(aa, 3);
                    ad = min_u8(ad, 3);
                    ba = min_u8(ba, 3);
                    bd = min_u8(bd, 3);
                }

                if modifier == MOD_MIRROR {
                    // Swap: A's attack becomes A's defense, B's defense becomes B's attack (and vice versa)
                    let tmp_aa = aa;
                    aa = ad; // A's "attack" is now their defense value
                    ad = tmp_aa; // A's "defense" is now their attack value
                    let tmp_ba = ba;
                    ba = bd;
                    bd = tmp_ba;
                }

                if modifier == MOD_DEADLOCK {
                    // No damage at this gate
                    // damage stays 0
                } else if modifier == MOD_OVERFLOW {
                    // Calculate damage but store as overflow
                    if aa > bd {
                        overflow_to_b = match g {
                            0 => [aa - bd, *overflow_to_b.span()[1], *overflow_to_b.span()[2]],
                            1 => [*overflow_to_b.span()[0], aa - bd, *overflow_to_b.span()[2]],
                            _ => [*overflow_to_b.span()[0], *overflow_to_b.span()[1], aa - bd],
                        };
                    }
                    if ba > ad {
                        overflow_to_a = match g {
                            0 => [ba - ad, *overflow_to_a.span()[1], *overflow_to_a.span()[2]],
                            1 => [*overflow_to_a.span()[0], ba - ad, *overflow_to_a.span()[2]],
                            _ => [*overflow_to_a.span()[0], *overflow_to_a.span()[1], ba - ad],
                        };
                    }
                } else {
                    // Normal or NarrowPass or Mirror (after swap): standard damage
                    if aa > bd {
                        damage_to_b = match g {
                            0 => [aa - bd, *damage_to_b.span()[1], *damage_to_b.span()[2]],
                            1 => [*damage_to_b.span()[0], aa - bd, *damage_to_b.span()[2]],
                            _ => [*damage_to_b.span()[0], *damage_to_b.span()[1], aa - bd],
                        };
                    }
                    if ba > ad {
                        damage_to_a = match g {
                            0 => [ba - ad, *damage_to_a.span()[1], *damage_to_a.span()[2]],
                            1 => [*damage_to_a.span()[0], ba - ad, *damage_to_a.span()[2]],
                            _ => [*damage_to_a.span()[0], *damage_to_a.span()[1], ba - ad],
                        };
                    }
                }

                g += 1;
            };

            // Distribute overflow: each overflow gate splits damage evenly to the other two gates
            let mut g2: u32 = 0;
            while g2 < 3 {
                let ovf_b = *overflow_to_b.span()[g2];
                let ovf_a = *overflow_to_a.span()[g2];
                if ovf_b > 0 {
                    let per_gate: u8 = ovf_b / 2;
                    let mut t: u32 = 0;
                    while t < 3 {
                        if t != g2 {
                            let cur = *damage_to_b.span()[t];
                            damage_to_b = match t {
                                0 => [cur + per_gate, *damage_to_b.span()[1], *damage_to_b.span()[2]],
                                1 => [*damage_to_b.span()[0], cur + per_gate, *damage_to_b.span()[2]],
                                _ => [*damage_to_b.span()[0], *damage_to_b.span()[1], cur + per_gate],
                            };
                        }
                        t += 1;
                    };
                }
                if ovf_a > 0 {
                    let per_gate: u8 = ovf_a / 2;
                    let mut t: u32 = 0;
                    while t < 3 {
                        if t != g2 {
                            let cur = *damage_to_a.span()[t];
                            damage_to_a = match t {
                                0 => [cur + per_gate, *damage_to_a.span()[1], *damage_to_a.span()[2]],
                                1 => [*damage_to_a.span()[0], cur + per_gate, *damage_to_a.span()[2]],
                                _ => [*damage_to_a.span()[0], *damage_to_a.span()[1], cur + per_gate],
                            };
                        }
                        t += 1;
                    };
                }
                g2 += 1;
            };

            // Total damage
            let total_dmg_to_b: u8 = *damage_to_b.span()[0] + *damage_to_b.span()[1] + *damage_to_b.span()[2];
            let total_dmg_to_a: u8 = *damage_to_a.span()[0] + *damage_to_a.span()[1] + *damage_to_a.span()[2];

            // Repairs (capped at 3)
            let repair_a = if rm.a_repair > 3 { 3_u8 } else { rm.a_repair };
            let repair_b = if rm.b_repair > 3 { 3_u8 } else { rm.b_repair };

            let mut hp_a = state.vault_a_hp;
            let mut hp_b = state.vault_b_hp;

            // Repair first (capped at 50)
            if hp_a + repair_a > 50 { hp_a = 50; } else { hp_a = hp_a + repair_a; }
            if hp_b + repair_b > 50 { hp_b = 50; } else { hp_b = hp_b + repair_b; }

            // Then damage
            if total_dmg_to_a >= hp_a { hp_a = 0; } else { hp_a = hp_a - total_dmg_to_a; }
            if total_dmg_to_b >= hp_b { hp_b = 0; } else { hp_b = hp_b - total_dmg_to_b; }

            state.vault_a_hp = hp_a;
            state.vault_b_hp = hp_b;

            // Node contests (unaffected by gate modifiers)
            let mut n: u8 = 0;
            while n < 3 {
                let (contest_a, contest_b) = if n == 0 {
                    (rm.a_nc0, rm.b_nc0)
                } else if n == 1 {
                    (rm.a_nc1, rm.b_nc1)
                } else {
                    (rm.a_nc2, rm.b_nc2)
                };

                if contest_a > contest_b {
                    world.write_model(@NodeState { match_id, node_index: n, owner: NodeOwner::TeamA });
                } else if contest_b > contest_a {
                    world.write_model(@NodeState { match_id, node_index: n, owner: NodeOwner::TeamB });
                }
                n += 1;
            };

            world.emit_event(@RoundResolved {
                match_id,
                round,
                vault_a_hp: hp_a.into(),
                vault_b_hp: hp_b.into(),
            });

            // Win condition
            if hp_a == 0 || hp_b == 0 {
                state.status = MatchStatus::Finished;
                let winner_team: u8 = if hp_b == 0 && hp_a > 0 {
                    1_u8
                } else if hp_a == 0 && hp_b > 0 {
                    2_u8
                } else {
                    0_u8
                };
                world.emit_event(@MatchFinished { match_id, winner_team });
            } else if state.current_round >= 10 {
                state.status = MatchStatus::Finished;
                let winner_team: u8 = if hp_a > hp_b {
                    1_u8
                } else if hp_b > hp_a {
                    2_u8
                } else {
                    0_u8
                };
                world.emit_event(@MatchFinished { match_id, winner_team });
            } else {
                state.current_round = round + 1;

                // Generate next round's modifiers via vRNG
                let vrf = IVrfProviderResDispatcher {
                    contract_address: VRF_PROVIDER_ADDRESS.try_into().unwrap(),
                };
                let random_value = vrf.consume_random(Source::Nonce(get_contract_address()));
                let (g0, g1, g2) = random_to_modifiers(random_value);
                world.write_model(@RoundModifiers1v1 {
                    match_id,
                    round: round + 1,
                    gate_0: g0,
                    gate_1: g1,
                    gate_2: g2,
                });
            }

            world.write_model(@state);
        }
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `sozo build`
Expected: Successful compilation. Note: the Cairo compiler may need the `Source` enum and `IVrfProviderRes` interface defined at the module level (before `#[dojo::contract]`). If there are compilation errors about types not being found, ensure they're defined outside the `mod resolution_1v1` block.

- [ ] **Step 3: Commit**

```bash
git add src/systems/resolution_1v1.cairo
git commit -m "feat: add modifier logic and vRNG to resolution_1v1"
```

---

## Task 4: Cairo Tests — `test_modifiers_1v1`

**Files:**
- Create: `src/tests/test_modifiers_1v1.cairo`
- Modify: `src/lib.cairo`

Since vRNG is an external contract that won't exist in the test environment, we test the modifier application by writing `RoundModifiers1v1` directly via `write_model_test` and verifying resolution applies them correctly. The tests cover each modifier type independently.

- [ ] **Step 1: Create `test_modifiers_1v1.cairo`**

```cairo
// src/tests/test_modifiers_1v1.cairo
#[cfg(test)]
mod tests {
    use core::poseidon::PoseidonTrait;
    use core::hash::HashStateTrait;
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef, WorldStorageTestTrait};

    use starknet::{contract_address_const, testing};

    use siege_dojo::systems::actions_1v1::{actions_1v1, IActions1v1Dispatcher, IActions1v1DispatcherTrait};
    use siege_dojo::systems::commit_reveal_1v1::{commit_reveal_1v1, ICommitReveal1v1Dispatcher, ICommitReveal1v1DispatcherTrait};
    use siege_dojo::systems::resolution_1v1::resolution_1v1;
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::{NodeState, m_NodeState, NodeOwner};
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::{RoundMoves1v1, m_RoundMoves1v1};
    use siege_dojo::models::round_modifiers_1v1::{RoundModifiers1v1, m_RoundModifiers1v1};
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::events::{e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished};

    fn hash_1v1(
        salt: felt252,
        p0: u8, p1: u8, p2: u8,
        g0: u8, g1: u8, g2: u8,
        repair: u8,
        nc0: u8, nc1: u8, nc2: u8,
    ) -> felt252 {
        let mut h = PoseidonTrait::new();
        h = h.update(salt);
        h = h.update(p0.into()); h = h.update(p1.into()); h = h.update(p2.into());
        h = h.update(g0.into()); h = h.update(g1.into()); h = h.update(g2.into());
        h = h.update(repair.into());
        h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
        h.finalize()
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
                TestResource::Contract(commit_reveal_1v1::TEST_CLASS_HASH),
                TestResource::Contract(resolution_1v1::TEST_CLASS_HASH),
            ].span()
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"commit_reveal_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"resolution_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    // Setup: create match, inject modifiers, play round via direct model writes
    // (bypasses vRNG since it's an external contract not available in tests)
    fn setup_with_modifiers(
        gate_0: u8, gate_1: u8, gate_2: u8,
        a_move: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
        b_move: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
    ) -> (dojo::world::WorldStorage, u64) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (cr_addr, _) = world.dns(@"commit_reveal_1v1").unwrap();
        let cr_sys = ICommitReveal1v1Dispatcher { contract_address: cr_addr };

        let pa = contract_address_const::<0x1>();
        let pb = contract_address_const::<0x2>();

        // Create match manually (bypasses vRNG in actions_1v1)
        let match_id: u64 = 1;
        world.write_model_test(@siege_dojo::models::match_counter::MatchCounter { id: 0, count: 1 });
        world.write_model_test(@MatchState1v1 {
            match_id, player_a: pa, player_b: pb,
            vault_a_hp: 50, vault_b_hp: 50,
            current_round: 1, status: MatchStatus::Active,
        });
        let mut i: u8 = 0;
        while i < 3 {
            world.write_model_test(@NodeState { match_id, node_index: i, owner: NodeOwner::None });
            i += 1;
        };

        // Write modifiers for round 1
        world.write_model_test(@RoundModifiers1v1 {
            match_id, round: 1,
            gate_0, gate_1, gate_2,
        });

        // Play round
        let salt: felt252 = 99;
        let (ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2) = a_move;
        let (bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2) = b_move;

        let h_a = hash_1v1(salt, ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2);
        let h_b = hash_1v1(salt, bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2);

        testing::set_contract_address(pa);
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(pb);
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(pa);
        cr_sys.reveal(match_id, salt, ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2);
        testing::set_contract_address(pb);
        cr_sys.reveal(match_id, salt, bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2);

        (world, match_id)
    }

    #[test]
    fn test_normal_modifiers_no_change() {
        // All gates Normal (0) — should behave exactly like before
        // A: atk [5,3,0], def [0,0,0], repair 0, nodes [1,1,0] = 10
        // B: atk [0,0,0], def [2,2,2], repair 2, nodes [1,1,0] = 10
        let (mut world, match_id) = setup_with_modifiers(
            0, 0, 0,
            (5, 3, 0, 0, 0, 0, 0, 1, 1, 0),
            (0, 0, 0, 2, 2, 2, 2, 1, 1, 0),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        // Damage to B: max(0,5-2)+max(0,3-2)+max(0,0-2) = 3+1+0 = 4
        // Damage to A: 0
        // Repair B = 2. HP_B = 50+2=52->50, then -4 = 46
        assert(state.vault_a_hp == 50, 'vault_a should be 50');
        assert(state.vault_b_hp == 46, 'vault_b should be 46');
    }

    #[test]
    fn test_narrow_pass_caps_at_3() {
        // Gate 0 has Narrow Pass (1), others Normal
        // A: atk [8,0,0], def [0,0,0], repair 0, nodes [1,1,0] = 10
        // B: atk [0,0,0], def [5,0,0], repair 0, nodes [2,2,1] = 10
        // Without modifier: damage at gate 0 = max(0, 8-5) = 3
        // With Narrow Pass: atk capped to 3, def capped to 3, damage = max(0, 3-3) = 0
        let (mut world, match_id) = setup_with_modifiers(
            1, 0, 0,
            (8, 0, 0, 0, 0, 0, 0, 1, 1, 0),
            (0, 0, 0, 5, 0, 0, 0, 2, 2, 1),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 50, 'narrow pass should cap damage');
    }

    #[test]
    fn test_mirror_gate_swaps_values() {
        // Gate 0 has Mirror (2), others Normal
        // A: atk [0,0,0], def [5,0,0], repair 0, nodes [2,2,1] = 10
        // B: atk [0,0,0], def [0,0,0], repair 0, nodes [5,3,2] = 10
        // At gate 0 with Mirror: A's attack(0) becomes defense, A's defense(5) becomes attack
        // B's attack(0) becomes defense, B's defense(0) becomes attack
        // Damage to B at gate 0: max(0, 5-0) = 5 (A's defense became attack, B's attack became defense)
        // Damage to A at gate 0: max(0, 0-0) = 0
        let (mut world, match_id) = setup_with_modifiers(
            2, 0, 0,
            (0, 0, 0, 5, 0, 0, 0, 2, 2, 1),
            (0, 0, 0, 0, 0, 0, 0, 5, 3, 2),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        // A's defense of 5 becomes attack at mirror gate, dealing 5 damage to B
        assert(state.vault_b_hp == 45, 'mirror should swap: B takes 5');
        assert(state.vault_a_hp == 50, 'A takes 0');
    }

    #[test]
    fn test_deadlock_no_damage() {
        // Gate 0 has Deadlock (3), others Normal
        // A: atk [10,0,0], def [0,0,0], repair 0, nodes [0,0,0] = 10
        // B: atk [0,0,0], def [0,0,0], repair 0, nodes [5,3,2] = 10
        // Gate 0 is deadlocked: no damage despite 10 attack
        let (mut world, match_id) = setup_with_modifiers(
            3, 0, 0,
            (10, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 5, 3, 2),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 50, 'deadlock should prevent damage');
    }

    #[test]
    fn test_overflow_splits_damage() {
        // Gate 0 has Overflow (4), others Normal
        // A: atk [6,0,0], def [0,2,2], repair 0, nodes [0,0,0] = 10
        // B: atk [0,2,2], def [0,0,0], repair 0, nodes [3,2,1] = 10
        // Gate 0 overflow: A attacks 6, B defends 0 -> overflow = 6
        // 6/2 = 3 per gate -> gates 1 and 2 each get +3 bonus damage
        // Gate 1 normal: A atk 0 vs B def 0 = 0 + 3 overflow = 3
        // Gate 2 normal: A atk 0 vs B def 0 = 0 + 3 overflow = 3
        // Total damage to B: 3 + 3 = 6
        let (mut world, match_id) = setup_with_modifiers(
            4, 0, 0,
            (6, 0, 0, 0, 2, 2, 0, 0, 0, 0),
            (0, 2, 2, 0, 0, 0, 0, 3, 2, 1),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        // Damage to B: overflow 6, splits 3+3 to gates 1 and 2
        // Gate 1: 0 base + 3 overflow = 3
        // Gate 2: 0 base + 3 overflow = 3
        // Total: 6. HP_B = 50 - 6 = 44
        assert(state.vault_b_hp == 44, 'overflow should split damage');
    }

    #[test]
    fn test_overflow_odd_rounds_down() {
        // Gate 0 has Overflow (4), others Normal
        // A: atk [5,0,0], def [0,0,0], repair 0, nodes [2,2,1] = 10
        // B: atk [0,0,0], def [0,0,0], repair 0, nodes [5,3,2] = 10
        // Overflow at gate 0: 5 - 0 = 5. 5/2 = 2 per gate (rounded down)
        // Total damage to B: 2 + 2 = 4
        let (mut world, match_id) = setup_with_modifiers(
            4, 0, 0,
            (5, 0, 0, 0, 0, 0, 0, 2, 2, 1),
            (0, 0, 0, 0, 0, 0, 0, 5, 3, 2),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 46, 'overflow odd rounds down');
    }
}
```

- [ ] **Step 2: Register test module in `lib.cairo`**

Update the tests block:

```cairo
#[cfg(test)]
pub mod tests {
    pub mod test_actions;
    pub mod test_actions_1v1;
    pub mod test_commit_reveal;
    pub mod test_commit_reveal_1v1;
    pub mod test_resolution;
    pub mod test_resolution_1v1;
    pub mod test_modifiers_1v1;
    pub mod test_events;
}
```

- [ ] **Step 3: Run tests**

Run: `sozo test -f test_modifiers_1v1`
Expected: All 6 tests pass.

Note: The existing `test_resolution_1v1` tests should also still pass. They write no modifiers, so `RoundModifiers1v1` will read as zeroes (all Normal), which preserves the original behavior. Verify with: `sozo test`

- [ ] **Step 4: Commit**

```bash
git add src/tests/test_modifiers_1v1.cairo src/lib.cairo
git commit -m "test: add modifier tests (narrow pass, mirror, deadlock, overflow)"
```

---

## Task 5: Deploy to Sepolia

**Files:** No file changes — deployment step.

- [ ] **Step 1: Build for Sepolia**

```bash
export DOJO_ACCOUNT_ADDRESS="0x040a26c15f86b70cc384d042ce0d87283e801bb459f369c4f588be3070c37f95"
export DOJO_PRIVATE_KEY="0x045665a95013a3060e87538a4271eeab7738e78fcf317e52f279f16c8cc6c483"
/tmp/sozo build -P sepolia
```

- [ ] **Step 2: Migrate**

```bash
/tmp/sozo -P sepolia migrate
```

- [ ] **Step 3: Grant writer permissions**

```bash
/tmp/sozo -P sepolia auth grant writer \
  siege_dojo,siege_dojo-actions_1v1 \
  siege_dojo,siege_dojo-commit_reveal_1v1 \
  siege_dojo,siege_dojo-resolution_1v1
```

- [ ] **Step 4: Record new contract addresses**

After migration, note the updated contract addresses for `actions_1v1`, `commit_reveal_1v1`, and `resolution_1v1`. Update `frontend/src/lib/contracts1v1.ts` and `frontend/.env.local` if they changed.

- [ ] **Step 5: Commit manifest**

```bash
git add manifest_sepolia.json
git commit -m "deploy: migrate gate modifiers to Sepolia"
```

---

## Task 6: Frontend — Update Contracts for vRNG Multicall

**Files:**
- Modify: `frontend/src/lib/contracts1v1.ts`
- Modify: `frontend/src/app/providers.tsx`

- [ ] **Step 1: Update `contracts1v1.ts` with vRNG multicall**

Replace the entire file with:

```typescript
import type { AccountInterface, UniversalDetails } from "starknet";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

export const VRF_PROVIDER_ADDRESS = "0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f";

export const CONTRACTS_1V1 = {
  ACTIONS: process.env.NEXT_PUBLIC_ACTIONS_1V1_ADDRESS || "0x7cbd822e0dc535d084dd71b76ba332d76cb370954c83a5ebe5625f36cdfa1c",
  COMMIT_REVEAL: process.env.NEXT_PUBLIC_COMMIT_REVEAL_1V1_ADDRESS || "0x516bdf650dcaebe431a06fba09766ee2d4be79c477e73ba220a64c4f6d4af80",
  RESOLUTION: process.env.NEXT_PUBLIC_RESOLUTION_1V1_ADDRESS || "0x1b31a6098f1b9081e925e98cd9627c6a5cce39073e92c3f5bf827cb09abe36b",
};

const DEVNET_TX_OPTS: UniversalDetails = {
  skipValidate: true,
  resourceBounds: {
    l1_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l2_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l1_data_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
  },
};

const TX_OPTS = IS_DEVNET ? DEVNET_TX_OPTS : undefined;

// Source::Nonce(address) encoded for calldata: type=0, then the address
function vrfRequestRandomCall(callerContract: string, signerAddress: string) {
  return {
    contractAddress: VRF_PROVIDER_ADDRESS,
    entrypoint: "request_random",
    calldata: [callerContract, "0", signerAddress],  // caller, Source::Nonce variant (0), address
  };
}

export async function createMatch1v1(
  account: AccountInterface,
  playerA: string,
  playerB: string,
) {
  return account.execute(
    [
      vrfRequestRandomCall(CONTRACTS_1V1.ACTIONS, account.address),
      {
        contractAddress: CONTRACTS_1V1.ACTIONS,
        entrypoint: "create_match_1v1",
        calldata: [playerA, playerB],
      },
    ],
    TX_OPTS,
  );
}

export async function commitMove1v1(
  account: AccountInterface,
  matchId: string,
  commitment: string,
) {
  return account.execute(
    {
      contractAddress: CONTRACTS_1V1.COMMIT_REVEAL,
      entrypoint: "commit",
      calldata: [matchId, commitment],
    },
    TX_OPTS,
  );
}

export async function revealMove1v1(
  account: AccountInterface,
  matchId: string,
  salt: string,
  p0: string, p1: string, p2: string,
  g0: string, g1: string, g2: string,
  repair: string,
  nc0: string, nc1: string, nc2: string,
) {
  // Always include request_random — harmless if not consumed (1st reveal),
  // required when this is the 2nd reveal (triggers resolution which consumes it)
  return account.execute(
    [
      vrfRequestRandomCall(CONTRACTS_1V1.RESOLUTION, account.address),
      {
        contractAddress: CONTRACTS_1V1.COMMIT_REVEAL,
        entrypoint: "reveal",
        calldata: [matchId, salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2],
      },
    ],
    TX_OPTS,
  );
}
```

- [ ] **Step 2: Add vRNG session policy to `providers.tsx`**

Add the VRF provider policy to `SESSION_POLICIES.contracts` in `frontend/src/app/providers.tsx`. Add after the existing `CONTRACTS_1V1.COMMIT_REVEAL` entry:

```typescript
    [VRF_PROVIDER_ADDRESS]: {
      methods: [
        { name: "Request Random", entrypoint: "request_random" },
      ],
    },
```

And add the import at the top (after the CONTRACTS_1V1 import):

```typescript
import { CONTRACTS_1V1, VRF_PROVIDER_ADDRESS } from "@/lib/contracts1v1";
```

(Update the existing import line that only imports `CONTRACTS_1V1`)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/contracts1v1.ts frontend/src/app/providers.tsx
git commit -m "feat: add vRNG multicall to contract wrappers and session policies"
```

---

## Task 7: Frontend — Modifier Display Hook and Match Page Update

**Files:**
- Modify: `frontend/src/lib/gameState1v1.ts`
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx`

- [ ] **Step 1: Add `useRoundModifiers1v1` hook to `gameState1v1.ts`**

Append this function at the end of `frontend/src/lib/gameState1v1.ts`:

```typescript
export const MODIFIER_NAMES: Record<number, string> = {
  0: "Normal",
  1: "Narrow Pass",
  2: "Mirror Gate",
  3: "Deadlock",
  4: "Overflow",
};

export const MODIFIER_DESCRIPTIONS: Record<number, string> = {
  0: "",
  1: "Attack and defense capped at 3",
  2: "Attack and defense values swap",
  3: "No damage dealt at this gate",
  4: "Unblocked damage splits to other gates",
};

export function useRoundModifiers1v1(matchId: string | null, round: number) {
  const [modifiers, setModifiers] = useState<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    if (!matchId) return;
    const id = Number(matchId);

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoRoundModifiers1V1Models: GraphEdges<{
          gate_0: string; gate_1: string; gate_2: string;
        }>;
      }>(`
        query {
          siegeDojoRoundModifiers1V1Models(where: { match_id: "${id}", round: ${round} }) {
            edges { node { gate_0 gate_1 gate_2 } }
          }
        }
      `);
      const node = data?.siegeDojoRoundModifiers1V1Models?.edges?.[0]?.node;
      if (node) {
        setModifiers([toNum(node.gate_0), toNum(node.gate_1), toNum(node.gate_2)]);
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [matchId, round]);

  return modifiers;
}
```

- [ ] **Step 2: Update match page to import and display modifiers**

In `frontend/src/app/match-1v1/[id]/page.tsx`:

Add imports:
```typescript
import {
  useMatchState1v1,
  useRoundStatus1v1,
  useRoundHistory1v1,
  useCommitmentStatus1v1,
  useRoundModifiers1v1,
  MODIFIER_NAMES,
  MODIFIER_DESCRIPTIONS,
} from "@/lib/gameState1v1";
```

Add the hook call after the other hooks (after `useRoundStatus1v1`):
```typescript
const modifiers = useRoundModifiers1v1(matchId, state?.round ?? 1);
```

Update the gate/node display section to show modifiers. Find the "Resource Nodes" section and add a gate modifiers display above it:

```tsx
{/* Gate Modifiers */}
<div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a]">
  <div className="text-xs tracking-wider text-[#6a6a7a] uppercase mb-3">Gate Conditions</div>
  <div className="grid grid-cols-3 gap-4">
    {["East Gate", "West Gate", "Underground"].map((gateName, i) => {
      const mod = modifiers[i];
      const modName = MODIFIER_NAMES[mod] || "Normal";
      const modDesc = MODIFIER_DESCRIPTIONS[mod] || "";
      const modColor = mod === 0 ? "text-[#6a6a7a]"
        : mod === 1 ? "text-[#ffd700]"
        : mod === 2 ? "text-[#00d4ff]"
        : mod === 3 ? "text-[#ff3344]"
        : "text-[#ff8800]";
      return (
        <div key={i} className="text-center space-y-1">
          <div className="text-xs text-[#6a6a7a]">{gateName}</div>
          <div className={`text-sm font-bold ${modColor}`}>{modName}</div>
          {modDesc && <div className="text-[10px] text-[#6a6a7a]">{modDesc}</div>}
        </div>
      );
    })}
  </div>
</div>
```

Insert this JSX block right before the existing `{/* Allocation form */}` comment in the return statement.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/gameState1v1.ts frontend/src/app/match-1v1/[id]/page.tsx
git commit -m "feat: display gate modifiers on match page"
```

---

## Task 8: Update `match-1v1/create/page.tsx` for vRNG Multicall

**Files:**
- Modify: `frontend/src/app/match-1v1/create/page.tsx`

The `createMatch1v1` function in `contracts1v1.ts` already handles the multicall (updated in Task 6), so the create page doesn't need structural changes. However, verify it still works since `account.execute` now receives an array of calls instead of a single call.

- [ ] **Step 1: Test the create flow**

No code changes needed — the create page already calls `createMatch1v1(account, address, opponentAddr)` which now internally does the multicall. Just verify that the flow works end-to-end after deployment.

- [ ] **Step 2: Update CLAUDE.md**

Add a note about gate modifiers to the 1v1 section in `CLAUDE.md`:

After the "Budget Allocation" section in the 1v1 mode docs, add:

```markdown
### Gate Modifiers

Each round, 3 gates independently roll a modifier via Cartridge vRNG:
- **Normal** (60%): No change
- **Narrow Pass** (10%): Attack and defense capped at 3
- **Mirror Gate** (10%): Attack/defense values swap
- **Deadlock** (10%): No damage at this gate
- **Overflow** (10%): Unblocked damage splits to other gates

Modifiers are visible to both players before allocation. vRNG uses `request_random` + `consume_random` — the frontend wraps `create_match_1v1` and `reveal` calls in multicall with `request_random`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add gate modifier docs to CLAUDE.md"
```
