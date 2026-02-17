#[cfg(test)]
mod tests {
    use core::poseidon::PoseidonTrait;
    use core::hash::HashStateTrait;
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef, WorldStorageTestTrait};

    use starknet::{contract_address_const, testing};

    use siege_dojo::systems::actions::{actions, IActionsDispatcher, IActionsDispatcherTrait};
    use siege_dojo::systems::commit_reveal::{commit_reveal, ICommitRevealDispatcher, ICommitRevealDispatcherTrait};
    use siege_dojo::systems::resolution::resolution;
    use siege_dojo::models::match_state::{m_MatchState, MatchStatus};
    use siege_dojo::models::node_state::{m_NodeState};
    use siege_dojo::models::commitment::{m_Commitment};
    use siege_dojo::models::round_moves::{RoundMoves, m_RoundMoves};
    use siege_dojo::models::match_counter::{m_MatchCounter};

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_MatchState::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Contract(actions::TEST_CLASS_HASH),
                TestResource::Contract(commit_reveal::TEST_CLASS_HASH),
                TestResource::Contract(resolution::TEST_CLASS_HASH),
            ].span()
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"actions")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"commit_reveal")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"resolution")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    fn hash_attacker_move(salt: felt252, p0: u8, p1: u8, p2: u8, nc0: u8, nc1: u8, nc2: u8) -> felt252 {
        let mut h = PoseidonTrait::new();
        h = h.update(salt);
        h = h.update(p0.into()); h = h.update(p1.into()); h = h.update(p2.into());
        h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
        h.finalize()
    }

    fn hash_defender_move(salt: felt252, g0: u8, g1: u8, g2: u8, repair: u8, nc0: u8, nc1: u8, nc2: u8) -> felt252 {
        let mut h = PoseidonTrait::new();
        h = h.update(salt);
        h = h.update(g0.into()); h = h.update(g1.into()); h = h.update(g2.into());
        h = h.update(repair.into());
        h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
        h.finalize()
    }

    fn setup() -> (dojo::world::WorldStorage, IActionsDispatcher, ICommitRevealDispatcher, u64) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (actions_addr, _) = world.dns(@"actions").unwrap();
        let actions_sys = IActionsDispatcher { contract_address: actions_addr };
        let (cr_addr, _) = world.dns(@"commit_reveal").unwrap();
        let cr_sys = ICommitRevealDispatcher { contract_address: cr_addr };

        let atk_a = contract_address_const::<0x1>();
        let def_a = contract_address_const::<0x2>();
        let atk_b = contract_address_const::<0x3>();
        let def_b = contract_address_const::<0x4>();
        let match_id = actions_sys.create_match(atk_a, def_a, atk_b, def_b);

        (world, actions_sys, cr_sys, match_id)
    }

    #[test]
    fn test_commit_all_four() {
        let (mut world, _, cr_sys, match_id) = setup();

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, 'hash_atk_a');
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, 'hash_def_a');
        testing::set_contract_address(contract_address_const::<0x3>());
        cr_sys.commit(match_id, 'hash_atk_b');
        testing::set_contract_address(contract_address_const::<0x4>());
        cr_sys.commit(match_id, 'hash_def_b');

        let rm: RoundMoves = world.read_model((match_id, 1_u32));
        assert(rm.commit_count == 4, 'should have 4 commits');
    }

    #[test]
    #[should_panic]
    fn test_double_commit_fails() {
        let (_, _, cr_sys, match_id) = setup();
        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, 'hash1');
        cr_sys.commit(match_id, 'hash2');
    }

    #[test]
    #[should_panic]
    fn test_commit_non_player_fails() {
        let (_, _, cr_sys, match_id) = setup();
        testing::set_contract_address(contract_address_const::<0x999>());
        cr_sys.commit(match_id, 'hash');
    }

    #[test]
    fn test_full_commit_reveal_cycle() {
        let (mut world, _, cr_sys, match_id) = setup();

        let salt: felt252 = 42;
        let h_atk_a = hash_attacker_move(salt, 3, 3, 2, 1, 1, 0);
        let h_def_a = hash_defender_move(salt, 2, 2, 2, 2, 1, 1, 0);
        let h_atk_b = hash_attacker_move(salt, 2, 2, 2, 2, 1, 1);
        let h_def_b = hash_defender_move(salt, 1, 1, 1, 3, 2, 1, 1);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h_atk_a);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, h_def_a);
        testing::set_contract_address(contract_address_const::<0x3>());
        cr_sys.commit(match_id, h_atk_b);
        testing::set_contract_address(contract_address_const::<0x4>());
        cr_sys.commit(match_id, h_def_b);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal_attacker(match_id, salt, 3, 3, 2, 1, 1, 0);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.reveal_defender(match_id, salt, 2, 2, 2, 2, 1, 1, 0);
        testing::set_contract_address(contract_address_const::<0x3>());
        cr_sys.reveal_attacker(match_id, salt, 2, 2, 2, 2, 1, 1);
        testing::set_contract_address(contract_address_const::<0x4>());
        cr_sys.reveal_defender(match_id, salt, 1, 1, 1, 3, 2, 1, 1);

        let state: siege_dojo::models::match_state::MatchState = world.read_model(match_id);
        assert(state.vault_a_hp == 100, 'vault_a should be 100');
        assert(state.vault_b_hp == 95, 'vault_b should be 95');
        assert(state.current_round == 2, 'should advance to round 2');
    }

    #[test]
    #[should_panic]
    fn test_over_budget_rejected() {
        let (_, _, cr_sys, match_id) = setup();

        let salt: felt252 = 42;
        let h = hash_attacker_move(salt, 5, 5, 3, 1, 1, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, 'x');
        testing::set_contract_address(contract_address_const::<0x3>());
        cr_sys.commit(match_id, 'y');
        testing::set_contract_address(contract_address_const::<0x4>());
        cr_sys.commit(match_id, 'z');

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal_attacker(match_id, salt, 5, 5, 3, 1, 1, 0);
    }

    #[test]
    #[should_panic]
    fn test_invalid_hash_rejected() {
        let (_, _, cr_sys, match_id) = setup();

        let salt: felt252 = 42;
        let h = hash_attacker_move(salt, 3, 3, 2, 1, 1, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, 'x');
        testing::set_contract_address(contract_address_const::<0x3>());
        cr_sys.commit(match_id, 'y');
        testing::set_contract_address(contract_address_const::<0x4>());
        cr_sys.commit(match_id, 'z');

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal_attacker(match_id, salt, 4, 3, 2, 1, 0, 0);
    }

    #[test]
    fn test_poseidon_hash_consistency() {
        let salt: felt252 = 12345;
        let h1 = hash_attacker_move(salt, 3, 3, 2, 1, 1, 0);
        let h2 = hash_attacker_move(salt, 3, 3, 2, 1, 1, 0);
        assert(h1 == h2, 'same inputs same hash');

        let h3 = hash_attacker_move(salt, 3, 3, 2, 1, 0, 1);
        assert(h1 != h3, 'different inputs different hash');
    }
}
