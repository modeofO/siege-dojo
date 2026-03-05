#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef, WorldStorageTestTrait};

    use starknet::contract_address_const;

    use siege_dojo::systems::actions::{actions, IActionsDispatcher, IActionsDispatcherTrait};
    use siege_dojo::systems::commit_reveal::commit_reveal;
    use siege_dojo::systems::resolution::resolution;
    use siege_dojo::models::match_state::{MatchState, m_MatchState, MatchStatus};
    use siege_dojo::models::node_state::{NodeState, m_NodeState, NodeOwner};
    use siege_dojo::models::commitment::{m_Commitment};
    use siege_dojo::models::round_moves::{m_RoundMoves};
    use siege_dojo::models::match_counter::{MatchCounter, m_MatchCounter};
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

    fn setup() -> (dojo::world::WorldStorage, IActionsDispatcher) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());
        let (actions_addr, _) = world.dns(@"actions").unwrap();
        let actions_sys = IActionsDispatcher { contract_address: actions_addr };
        (world, actions_sys)
    }

    #[test]
    fn test_create_match() {
        let (mut world, actions_sys) = setup();
        let atk_a = contract_address_const::<0x1>();
        let def_a = contract_address_const::<0x2>();
        let atk_b = contract_address_const::<0x3>();
        let def_b = contract_address_const::<0x4>();

        let match_id = actions_sys.create_match(atk_a, def_a, atk_b, def_b);
        assert(match_id == 1, 'match_id should be 1');

        let state: MatchState = world.read_model(match_id);
        assert(state.vault_a_hp == 100, 'vault_a should be 100');
        assert(state.vault_b_hp == 100, 'vault_b should be 100');
        assert(state.current_round == 1, 'round should be 1');
        assert(state.status == MatchStatus::Active, 'status should be Active');
        assert(state.team_a_attacker == atk_a, 'wrong atk_a');
        assert(state.team_b_defender == def_b, 'wrong def_b');
    }

    #[test]
    fn test_match_counter_increments() {
        let (mut world, actions_sys) = setup();
        let a = contract_address_const::<0x1>();
        let b = contract_address_const::<0x2>();
        let c = contract_address_const::<0x3>();
        let d = contract_address_const::<0x4>();

        let id1 = actions_sys.create_match(a, b, c, d);
        let id2 = actions_sys.create_match(a, b, c, d);
        assert(id1 == 1, 'first should be 1');
        assert(id2 == 2, 'second should be 2');

        let counter: MatchCounter = world.read_model(0_u8);
        assert(counter.count == 2, 'counter should be 2');
    }

    #[test]
    fn test_nodes_initialized_none() {
        let (mut world, actions_sys) = setup();
        let a = contract_address_const::<0x1>();
        let b = contract_address_const::<0x2>();
        let c = contract_address_const::<0x3>();
        let d = contract_address_const::<0x4>();

        let match_id = actions_sys.create_match(a, b, c, d);

        let n0: NodeState = world.read_model((match_id, 0_u8));
        let n1: NodeState = world.read_model((match_id, 1_u8));
        let n2: NodeState = world.read_model((match_id, 2_u8));
        assert(n0.owner == NodeOwner::None, 'node 0 should be None');
        assert(n1.owner == NodeOwner::None, 'node 1 should be None');
        assert(n2.owner == NodeOwner::None, 'node 2 should be None');
    }

    #[test]
    fn test_base_budget_is_10() {
        let (_, actions_sys) = setup();
        let a = contract_address_const::<0x1>();
        let b = contract_address_const::<0x2>();
        let c = contract_address_const::<0x3>();
        let d = contract_address_const::<0x4>();

        let match_id = actions_sys.create_match(a, b, c, d);
        let budget_a = actions_sys.get_team_budget(match_id, true);
        let budget_b = actions_sys.get_team_budget(match_id, false);
        assert(budget_a == 10, 'team A budget should be 10');
        assert(budget_b == 10, 'team B budget should be 10');
    }

    #[test]
    fn test_budget_with_node_bonus() {
        let (mut world, actions_sys) = setup();
        let a = contract_address_const::<0x1>();
        let b = contract_address_const::<0x2>();
        let c = contract_address_const::<0x3>();
        let d = contract_address_const::<0x4>();

        let match_id = actions_sys.create_match(a, b, c, d);

        world.write_model_test(@NodeState { match_id, node_index: 0, owner: NodeOwner::TeamA });
        world.write_model_test(@NodeState { match_id, node_index: 1, owner: NodeOwner::TeamA });

        let budget_a = actions_sys.get_team_budget(match_id, true);
        let budget_b = actions_sys.get_team_budget(match_id, false);
        assert(budget_a == 12, 'team A should be 12');
        assert(budget_b == 10, 'team B should be 10');
    }
}
