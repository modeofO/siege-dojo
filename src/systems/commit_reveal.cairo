#[starknet::interface]
pub trait ICommitReveal<T> {
    fn commit(ref self: T, match_id: u64, commitment: felt252);
    fn reveal_attacker(
        ref self: T,
        match_id: u64,
        salt: felt252,
        p0: u8, p1: u8, p2: u8,
        nc0: u8, nc1: u8, nc2: u8,
    );
    fn reveal_defender(
        ref self: T,
        match_id: u64,
        salt: felt252,
        g0: u8, g1: u8, g2: u8,
        repair: u8,
        nc0: u8, nc1: u8, nc2: u8,
    );
    fn force_timeout(ref self: T, match_id: u64);
}

#[dojo::contract]
pub mod commit_reveal {
    use core::poseidon::PoseidonTrait;
    use core::hash::HashStateTrait;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::world::WorldStorageTrait;
    use siege_dojo::models::match_state::{MatchState, MatchStatus};
    use siege_dojo::models::node_state::{NodeState, NodeOwner};
    use siege_dojo::models::commitment::Commitment;
    use siege_dojo::models::round_moves::RoundMoves;
    use siege_dojo::systems::resolution::{IResolutionDispatcher, IResolutionDispatcherTrait};

    const COMMIT_TIMEOUT: u64 = 300;
    const REVEAL_TIMEOUT: u64 = 300;

    const ROLE_ATK_A: u8 = 0;
    const ROLE_DEF_A: u8 = 1;
    const ROLE_ATK_B: u8 = 2;
    const ROLE_DEF_B: u8 = 3;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    fn get_player_role(state: @MatchState, caller: ContractAddress) -> u8 {
        if caller == *state.team_a_attacker {
            ROLE_ATK_A
        } else if caller == *state.team_a_defender {
            ROLE_DEF_A
        } else if caller == *state.team_b_attacker {
            ROLE_ATK_B
        } else if caller == *state.team_b_defender {
            ROLE_DEF_B
        } else {
            panic!("Not a player in this match")
        }
    }

    fn calc_team_budget(world: @dojo::world::WorldStorage, match_id: u64, is_team_a: bool) -> u8 {
        let target = if is_team_a { NodeOwner::TeamA } else { NodeOwner::TeamB };
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

    #[abi(embed_v0)]
    impl CommitRevealImpl of super::ICommitReveal<ContractState> {
        fn commit(ref self: ContractState, match_id: u64, commitment: felt252) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let state: MatchState = world.read_model(match_id);
            assert(state.status == MatchStatus::Active, 'Match not active');

            let role = get_player_role(@state, caller);
            let round = state.current_round;

            let existing: Commitment = world.read_model((match_id, round, role));
            assert(!existing.committed, 'Already committed');

            world.write_model(@Commitment {
                match_id, round, role,
                hash: commitment,
                committed: true,
                revealed: false,
            });

            let mut rm: RoundMoves = world.read_model((match_id, round));
            rm.commit_count += 1;

            if rm.commit_count == 1 {
                rm.commit_deadline = get_block_timestamp() + COMMIT_TIMEOUT;
            }
            if rm.commit_count == 4 {
                rm.reveal_deadline = get_block_timestamp() + REVEAL_TIMEOUT;
            }

            world.write_model(@rm);
        }

        fn reveal_attacker(
            ref self: ContractState,
            match_id: u64,
            salt: felt252,
            p0: u8, p1: u8, p2: u8,
            nc0: u8, nc1: u8, nc2: u8,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let state: MatchState = world.read_model(match_id);
            assert(state.status == MatchStatus::Active, 'Match not active');

            let role = get_player_role(@state, caller);
            let round = state.current_round;

            let rm: RoundMoves = world.read_model((match_id, round));
            assert(rm.commit_count == 4, 'Not all committed');

            let mut c: Commitment = world.read_model((match_id, round, role));
            assert(c.committed, 'Not committed');
            assert(!c.revealed, 'Already revealed');

            // Verify hash
            let mut h = PoseidonTrait::new();
            h = h.update(salt);
            h = h.update(p0.into());
            h = h.update(p1.into());
            h = h.update(p2.into());
            h = h.update(nc0.into());
            h = h.update(nc1.into());
            h = h.update(nc2.into());
            let computed = h.finalize();
            assert(computed == c.hash, 'Invalid reveal');

            // Budget check
            let is_team_a = role == ROLE_ATK_A;
            let budget = calc_team_budget(@world, match_id, is_team_a);
            let total: u16 = p0.into() + p1.into() + p2.into() + nc0.into() + nc1.into() + nc2.into();
            assert(total <= budget.into(), 'Over budget');

            c.revealed = true;
            world.write_model(@c);

            let mut rm: RoundMoves = world.read_model((match_id, round));
            rm.reveal_count += 1;

            if role == ROLE_ATK_A {
                rm.atk_a_p0 = p0; rm.atk_a_p1 = p1; rm.atk_a_p2 = p2;
                rm.atk_a_nc0 = nc0; rm.atk_a_nc1 = nc1; rm.atk_a_nc2 = nc2;
            } else {
                rm.atk_b_p0 = p0; rm.atk_b_p1 = p1; rm.atk_b_p2 = p2;
                rm.atk_b_nc0 = nc0; rm.atk_b_nc1 = nc1; rm.atk_b_nc2 = nc2;
            }

            world.write_model(@rm);

            if rm.reveal_count == 4 {
                let (res_addr, _) = world.dns(@"resolution").unwrap();
                let res = IResolutionDispatcher { contract_address: res_addr };
                res.resolve_round(match_id);
            }
        }

        fn reveal_defender(
            ref self: ContractState,
            match_id: u64,
            salt: felt252,
            g0: u8, g1: u8, g2: u8,
            repair: u8,
            nc0: u8, nc1: u8, nc2: u8,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let state: MatchState = world.read_model(match_id);
            assert(state.status == MatchStatus::Active, 'Match not active');

            let role = get_player_role(@state, caller);
            let round = state.current_round;

            let rm: RoundMoves = world.read_model((match_id, round));
            assert(rm.commit_count == 4, 'Not all committed');

            let mut c: Commitment = world.read_model((match_id, round, role));
            assert(c.committed, 'Not committed');
            assert(!c.revealed, 'Already revealed');

            // Verify hash
            let mut h = PoseidonTrait::new();
            h = h.update(salt);
            h = h.update(g0.into());
            h = h.update(g1.into());
            h = h.update(g2.into());
            h = h.update(repair.into());
            h = h.update(nc0.into());
            h = h.update(nc1.into());
            h = h.update(nc2.into());
            let computed = h.finalize();
            assert(computed == c.hash, 'Invalid reveal');

            // Budget check
            let is_team_a = role == ROLE_DEF_A;
            let budget = calc_team_budget(@world, match_id, is_team_a);
            let total: u16 = g0.into() + g1.into() + g2.into() + repair.into() + nc0.into() + nc1.into() + nc2.into();
            assert(total <= budget.into(), 'Over budget');

            c.revealed = true;
            world.write_model(@c);

            let mut rm: RoundMoves = world.read_model((match_id, round));
            rm.reveal_count += 1;

            if role == ROLE_DEF_A {
                rm.def_a_g0 = g0; rm.def_a_g1 = g1; rm.def_a_g2 = g2;
                rm.def_a_repair = repair;
                rm.def_a_nc0 = nc0; rm.def_a_nc1 = nc1; rm.def_a_nc2 = nc2;
            } else {
                rm.def_b_g0 = g0; rm.def_b_g1 = g1; rm.def_b_g2 = g2;
                rm.def_b_repair = repair;
                rm.def_b_nc0 = nc0; rm.def_b_nc1 = nc1; rm.def_b_nc2 = nc2;
            }

            world.write_model(@rm);

            if rm.reveal_count == 4 {
                let (res_addr, _) = world.dns(@"resolution").unwrap();
                let res = IResolutionDispatcher { contract_address: res_addr };
                res.resolve_round(match_id);
            }
        }

        fn force_timeout(ref self: ContractState, match_id: u64) {
            let mut world = self.world_default();
            let state: MatchState = world.read_model(match_id);
            assert(state.status == MatchStatus::Active, 'Match not active');

            let round = state.current_round;
            let now = get_block_timestamp();
            let mut rm: RoundMoves = world.read_model((match_id, round));

            if rm.commit_count < 4 && rm.commit_count > 0 {
                assert(now >= rm.commit_deadline, 'Commit deadline not reached');
                let mut r: u8 = 0;
                while r < 4 {
                    let c: Commitment = world.read_model((match_id, round, r));
                    if !c.committed {
                        world.write_model(@Commitment {
                            match_id, round, role: r,
                            hash: 0,
                            committed: true,
                            revealed: true,
                        });
                        rm.reveal_count += 1;
                    }
                    r += 1;
                };
                rm.commit_count = 4;
                rm.reveal_deadline = now + REVEAL_TIMEOUT;
                world.write_model(@rm);
            }

            if rm.commit_count == 4 && rm.reveal_count < 4 {
                assert(now >= rm.reveal_deadline, 'Reveal deadline not reached');
                let mut r: u8 = 0;
                while r < 4 {
                    let c: Commitment = world.read_model((match_id, round, r));
                    if !c.revealed {
                        world.write_model(@Commitment {
                            match_id, round, role: r,
                            hash: c.hash,
                            committed: true,
                            revealed: true,
                        });
                        rm.reveal_count += 1;
                    }
                    r += 1;
                };
                world.write_model(@rm);

                let (res_addr, _) = world.dns(@"resolution").unwrap();
                let res = IResolutionDispatcher { contract_address: res_addr };
                res.resolve_round(match_id);
            }
        }
    }
}
