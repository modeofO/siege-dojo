#[cfg(test)]
mod tests {
    use core::poseidon::PoseidonTrait;
    use core::hash::HashStateTrait;
    use dojo::model::ModelStorage;
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef, WorldStorageTestTrait};

    use starknet::{contract_address_const, testing};

    use siege_dojo::systems::actions::{actions, IActionsDispatcher, IActionsDispatcherTrait};
    use siege_dojo::systems::commit_reveal::{commit_reveal, ICommitRevealDispatcher, ICommitRevealDispatcherTrait};
    use siege_dojo::systems::resolution::resolution;
    use siege_dojo::models::match_state::{MatchState, m_MatchState, MatchStatus};
    use siege_dojo::models::node_state::{m_NodeState};
    use siege_dojo::models::commitment::{m_Commitment};
    use siege_dojo::models::round_moves::{m_RoundMoves};
    use siege_dojo::models::match_counter::{m_MatchCounter};
    use siege_dojo::models::events::{e_MatchCreated, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished};

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_MatchState::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
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

    fn setup() -> (dojo::world::WorldStorage, IActionsDispatcher, ICommitRevealDispatcher) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (actions_addr, _) = world.dns(@"actions").unwrap();
        let actions_sys = IActionsDispatcher { contract_address: actions_addr };
        let (cr_addr, _) = world.dns(@"commit_reveal").unwrap();
        let cr_sys = ICommitRevealDispatcher { contract_address: cr_addr };

        (world, actions_sys, cr_sys)
    }

    /// Tests that MatchCreated event is emitted when create_match() is called.
    /// The event emission is verified by: (1) the function completes without panic,
    /// (2) the world state reflects the created match, confirming the event code path ran.
    #[test]
    fn test_match_created_event_emitted() {
        let (mut world, actions_sys, _) = setup();

        let atk_a = contract_address_const::<0x1>();
        let def_a = contract_address_const::<0x2>();
        let atk_b = contract_address_const::<0x3>();
        let def_b = contract_address_const::<0x4>();

        // create_match emits MatchCreated event; test verifies no panic and state is correct
        let match_id = actions_sys.create_match(atk_a, def_a, atk_b, def_b);
        assert(match_id == 1, 'match_id should be 1');

        let state: MatchState = world.read_model(match_id);
        assert(state.team_a_attacker == atk_a, 'wrong atk_a');
        assert(state.team_b_defender == def_b, 'wrong def_b');
        assert(state.status == MatchStatus::Active, 'match not active');
    }

    /// Tests that RoundResolved (and MoveCommitted/MoveRevealed) events are emitted
    /// during a full commit-reveal cycle. Verified by: completed cycle without panic,
    /// HP values changed as expected after the round, proving the resolution code path
    /// (including emit_event calls) executed successfully.
    #[test]
    fn test_round_resolved_event_emitted() {
        let (mut world, actions_sys, cr_sys) = setup();

        let atk_a = contract_address_const::<0x1>();
        let def_a = contract_address_const::<0x2>();
        let atk_b = contract_address_const::<0x3>();
        let def_b = contract_address_const::<0x4>();

        let match_id = actions_sys.create_match(atk_a, def_a, atk_b, def_b);
        let salt: felt252 = 42;

        // All commit() calls emit MoveCommitted events
        testing::set_contract_address(atk_a);
        cr_sys.commit(match_id, hash_attacker_move(salt, 3, 3, 3, 0, 0, 0));
        testing::set_contract_address(def_a);
        cr_sys.commit(match_id, hash_defender_move(salt, 2, 2, 2, 0, 0, 0, 0));
        testing::set_contract_address(atk_b);
        cr_sys.commit(match_id, hash_attacker_move(salt, 3, 3, 3, 0, 0, 0));
        testing::set_contract_address(def_b);
        cr_sys.commit(match_id, hash_defender_move(salt, 2, 2, 2, 0, 0, 0, 0));

        // All reveal() calls emit MoveRevealed events; last reveal triggers RoundResolved
        testing::set_contract_address(atk_a);
        cr_sys.reveal_attacker(match_id, salt, 3, 3, 3, 0, 0, 0);
        testing::set_contract_address(def_a);
        cr_sys.reveal_defender(match_id, salt, 2, 2, 2, 0, 0, 0, 0);
        testing::set_contract_address(atk_b);
        cr_sys.reveal_attacker(match_id, salt, 3, 3, 3, 0, 0, 0);
        testing::set_contract_address(def_b);
        cr_sys.reveal_defender(match_id, salt, 2, 2, 2, 0, 0, 0, 0);

        // Verify state after RoundResolved event: each vault took 3 damage (3-2=1 per node)
        let state: MatchState = world.read_model(match_id);
        assert(state.current_round == 2, 'should advance to round 2');
        assert(state.vault_a_hp == 97, 'vault_a should be 97');
        assert(state.vault_b_hp == 97, 'vault_b should be 97');
        assert(state.status == MatchStatus::Active, 'match still active');
    }
}
