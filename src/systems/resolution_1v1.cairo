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
            // Unused defense at each gate (defense that wasn't consumed by direct attack)
            // Used to block reflected damage at receiving gates
            let mut unused_def_b: [u8; 3] = [0, 0, 0];  // B's unused defense
            let mut unused_def_a: [u8; 3] = [0, 0, 0];  // A's unused defense

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
                    } else {
                        // B's defense exceeded A's attack — track unused defense
                        unused_def_b = match g {
                            0 => [bd - aa, *unused_def_b.span()[1], *unused_def_b.span()[2]],
                            1 => [*unused_def_b.span()[0], bd - aa, *unused_def_b.span()[2]],
                            _ => [*unused_def_b.span()[0], *unused_def_b.span()[1], bd - aa],
                        };
                    }
                    if ba > ad {
                        damage_to_a = match g {
                            0 => [ba - ad, *damage_to_a.span()[1], *damage_to_a.span()[2]],
                            1 => [*damage_to_a.span()[0], ba - ad, *damage_to_a.span()[2]],
                            _ => [*damage_to_a.span()[0], *damage_to_a.span()[1], ba - ad],
                        };
                    } else {
                        unused_def_a = match g {
                            0 => [ad - ba, *unused_def_a.span()[1], *unused_def_a.span()[2]],
                            1 => [*unused_def_a.span()[0], ad - ba, *unused_def_a.span()[2]],
                            _ => [*unused_def_a.span()[0], *unused_def_a.span()[1], ad - ba],
                        };
                    }
                }

                g += 1;
            };

            // Distribute reflection: each reflection gate splits damage to other gates,
            // but reflected damage is reduced by the target's unused defense at the receiving gate
            let mut g2: u32 = 0;
            while g2 < 3 {
                let ovf_b = *overflow_to_b.span()[g2];
                let ovf_a = *overflow_to_a.span()[g2];
                if ovf_b > 0 {
                    let per_gate: u8 = ovf_b / 2;
                    let mut t: u32 = 0;
                    while t < 3 {
                        if t != g2 {
                            let def = *unused_def_b.span()[t];
                            if per_gate > def {
                                let cur = *damage_to_b.span()[t];
                                damage_to_b = match t {
                                    0 => [cur + per_gate - def, *damage_to_b.span()[1], *damage_to_b.span()[2]],
                                    1 => [*damage_to_b.span()[0], cur + per_gate - def, *damage_to_b.span()[2]],
                                    _ => [*damage_to_b.span()[0], *damage_to_b.span()[1], cur + per_gate - def],
                                };
                            }
                            // If def >= per_gate, reflected damage is fully blocked
                        }
                        t += 1;
                    };
                }
                if ovf_a > 0 {
                    let per_gate: u8 = ovf_a / 2;
                    let mut t: u32 = 0;
                    while t < 3 {
                        if t != g2 {
                            let def = *unused_def_a.span()[t];
                            if per_gate > def {
                                let cur = *damage_to_a.span()[t];
                                damage_to_a = match t {
                                    0 => [cur + per_gate - def, *damage_to_a.span()[1], *damage_to_a.span()[2]],
                                    1 => [*damage_to_a.span()[0], cur + per_gate - def, *damage_to_a.span()[2]],
                                    _ => [*damage_to_a.span()[0], *damage_to_a.span()[1], cur + per_gate - def],
                                };
                            }
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
