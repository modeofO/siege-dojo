#[starknet::interface]
pub trait IResolution1v1<T> {
    fn resolve_round(ref self: T, match_id: u64);
}

#[dojo::contract]
pub mod resolution_1v1 {
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::MatchState1v1;
    use siege_dojo::models::node_state::{NodeState, NodeOwner};
    use siege_dojo::models::round_moves_1v1::RoundMoves1v1;
    use siege_dojo::models::events::{RoundResolved, MatchFinished};

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
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

            // Damage to vault B (Player A attacks, Player B defends)
            let mut damage_to_b: u8 = 0;
            if rm.a_p0 > rm.b_g0 {
                damage_to_b += rm.a_p0 - rm.b_g0;
            }
            if rm.a_p1 > rm.b_g1 {
                damage_to_b += rm.a_p1 - rm.b_g1;
            }
            if rm.a_p2 > rm.b_g2 {
                damage_to_b += rm.a_p2 - rm.b_g2;
            }

            // Damage to vault A (Player B attacks, Player A defends)
            let mut damage_to_a: u8 = 0;
            if rm.b_p0 > rm.a_g0 {
                damage_to_a += rm.b_p0 - rm.a_g0;
            }
            if rm.b_p1 > rm.a_g1 {
                damage_to_a += rm.b_p1 - rm.a_g1;
            }
            if rm.b_p2 > rm.a_g2 {
                damage_to_a += rm.b_p2 - rm.a_g2;
            }

            // Repairs (capped at 3)
            let repair_a = if rm.a_repair > 3 { 3_u8 } else { rm.a_repair };
            let repair_b = if rm.b_repair > 3 { 3_u8 } else { rm.b_repair };

            let mut hp_a = state.vault_a_hp;
            let mut hp_b = state.vault_b_hp;

            // Repair first (capped at 50)
            if hp_a + repair_a > 50 { hp_a = 50; } else { hp_a = hp_a + repair_a; }
            if hp_b + repair_b > 50 { hp_b = 50; } else { hp_b = hp_b + repair_b; }

            // Then damage
            if damage_to_a >= hp_a { hp_a = 0; } else { hp_a = hp_a - damage_to_a; }
            if damage_to_b >= hp_b { hp_b = 0; } else { hp_b = hp_b - damage_to_b; }

            state.vault_a_hp = hp_a;
            state.vault_b_hp = hp_b;

            // Node contests (1v1: a_ncN vs b_ncN directly)
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
                    1_u8 // Player A wins
                } else if hp_a == 0 && hp_b > 0 {
                    2_u8 // Player B wins
                } else {
                    0_u8 // Draw
                };
                world.emit_event(@MatchFinished { match_id, winner_team });
            } else if state.current_round >= 10 {
                // Max round limit reached -- game ends, winner by HP
                state.status = MatchStatus::Finished;
                let winner_team: u8 = if hp_a > hp_b {
                    1_u8 // Player A wins by HP
                } else if hp_b > hp_a {
                    2_u8 // Player B wins by HP
                } else {
                    0_u8 // Draw
                };
                world.emit_event(@MatchFinished { match_id, winner_team });
            } else {
                state.current_round = round + 1;
            }

            world.write_model(@state);
        }
    }
}
