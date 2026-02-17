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
    use siege_dojo::models::match_state::{MatchState, m_MatchState, MatchStatus};
    use siege_dojo::models::node_state::{NodeState, m_NodeState, NodeOwner};
    use siege_dojo::models::commitment::{m_Commitment};
    use siege_dojo::models::round_moves::{m_RoundMoves};
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

    fn hash_attacker(salt: felt252, p0: u8, p1: u8, p2: u8, nc0: u8, nc1: u8, nc2: u8) -> felt252 {
        let mut h = PoseidonTrait::new();
        h = h.update(salt);
        h = h.update(p0.into()); h = h.update(p1.into()); h = h.update(p2.into());
        h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
        h.finalize()
    }

    fn hash_defender(salt: felt252, g0: u8, g1: u8, g2: u8, repair: u8, nc0: u8, nc1: u8, nc2: u8) -> felt252 {
        let mut h = PoseidonTrait::new();
        h = h.update(salt);
        h = h.update(g0.into()); h = h.update(g1.into()); h = h.update(g2.into());
        h = h.update(repair.into());
        h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
        h.finalize()
    }

    fn setup_and_play_round(
        atk_a: (u8, u8, u8, u8, u8, u8),
        def_a: (u8, u8, u8, u8, u8, u8, u8),
        atk_b: (u8, u8, u8, u8, u8, u8),
        def_b: (u8, u8, u8, u8, u8, u8, u8),
    ) -> (dojo::world::WorldStorage, u64) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (actions_addr, _) = world.dns(@"actions").unwrap();
        let actions_sys = IActionsDispatcher { contract_address: actions_addr };
        let (cr_addr, _) = world.dns(@"commit_reveal").unwrap();
        let cr_sys = ICommitRevealDispatcher { contract_address: cr_addr };

        let addr1 = contract_address_const::<0x1>();
        let addr2 = contract_address_const::<0x2>();
        let addr3 = contract_address_const::<0x3>();
        let addr4 = contract_address_const::<0x4>();

        let match_id = actions_sys.create_match(addr1, addr2, addr3, addr4);

        let salt: felt252 = 99;
        let (ap0, ap1, ap2, anc0, anc1, anc2) = atk_a;
        let (dg0, dg1, dg2, dr, dnc0, dnc1, dnc2) = def_a;
        let (bp0, bp1, bp2, bnc0, bnc1, bnc2) = atk_b;
        let (bg0, bg1, bg2, br, bgnc0, bgnc1, bgnc2) = def_b;

        let h1 = hash_attacker(salt, ap0, ap1, ap2, anc0, anc1, anc2);
        let h2 = hash_defender(salt, dg0, dg1, dg2, dr, dnc0, dnc1, dnc2);
        let h3 = hash_attacker(salt, bp0, bp1, bp2, bnc0, bnc1, bnc2);
        let h4 = hash_defender(salt, bg0, bg1, bg2, br, bgnc0, bgnc1, bgnc2);

        testing::set_contract_address(addr1);
        cr_sys.commit(match_id, h1);
        testing::set_contract_address(addr2);
        cr_sys.commit(match_id, h2);
        testing::set_contract_address(addr3);
        cr_sys.commit(match_id, h3);
        testing::set_contract_address(addr4);
        cr_sys.commit(match_id, h4);

        testing::set_contract_address(addr1);
        cr_sys.reveal_attacker(match_id, salt, ap0, ap1, ap2, anc0, anc1, anc2);
        testing::set_contract_address(addr2);
        cr_sys.reveal_defender(match_id, salt, dg0, dg1, dg2, dr, dnc0, dnc1, dnc2);
        testing::set_contract_address(addr3);
        cr_sys.reveal_attacker(match_id, salt, bp0, bp1, bp2, bnc0, bnc1, bnc2);
        testing::set_contract_address(addr4);
        cr_sys.reveal_defender(match_id, salt, bg0, bg1, bg2, br, bgnc0, bgnc1, bgnc2);

        (world, match_id)
    }

    #[test]
    fn test_damage_calculation() {
        let (mut world, match_id) = setup_and_play_round(
            (5, 3, 2, 0, 0, 0),
            (3, 3, 2, 0, 1, 1, 0),
            (4, 3, 3, 0, 0, 0),
            (2, 2, 2, 2, 1, 1, 0),
        );

        let state: MatchState = world.read_model(match_id);
        // Damage to B: (5-2)+(3-2)+(2-2) = 3+1+0 = 4
        // Damage to A: (4-3)+(3-3)+(3-2) = 1+0+1 = 2
        // Repair A = 0, Repair B = 2
        // HP_A = 100 + 0 → 100, then -2 = 98
        // HP_B = 100 + 2 → capped 100, then -4 = 96
        assert(state.vault_a_hp == 98, 'vault_a should be 98');
        assert(state.vault_b_hp == 96, 'vault_b should be 96');
    }

    #[test]
    fn test_repair_capped_at_3() {
        let (mut world, match_id) = setup_and_play_round(
            (5, 3, 2, 0, 0, 0),
            (0, 0, 0, 5, 2, 2, 1),
            (0, 0, 0, 5, 3, 2),
            (0, 0, 0, 5, 2, 2, 1),
        );

        let state: MatchState = world.read_model(match_id);
        // Repair A: capped at 3. HP_A = 100+3=103->100. Damage from B = 0. HP_A = 100
        // Repair B: capped at 3. HP_B = 100+3=103->100. Damage from A = 5+3+2 = 10. HP_B = 90
        assert(state.vault_a_hp == 100, 'vault_a capped at 100');
        assert(state.vault_b_hp == 90, 'vault_b should be 90');
    }

    #[test]
    fn test_node_contest_resolution() {
        let (mut world, match_id) = setup_and_play_round(
            (3, 3, 0, 3, 0, 1),
            (0, 0, 0, 0, 3, 3, 4),
            (3, 3, 0, 0, 3, 1),
            (0, 0, 0, 0, 0, 3, 7),
        );

        let n0: NodeState = world.read_model((match_id, 0_u8));
        let n1: NodeState = world.read_model((match_id, 1_u8));
        let n2: NodeState = world.read_model((match_id, 2_u8));
        // Node 0: A=3+3=6, B=0+0=0 => TeamA
        // Node 1: A=0+3=3, B=3+3=6 => TeamB
        // Node 2: A=1+4=5, B=1+7=8 => TeamB
        assert(n0.owner == NodeOwner::TeamA, 'node 0 should be TeamA');
        assert(n1.owner == NodeOwner::TeamB, 'node 1 should be TeamB');
        assert(n2.owner == NodeOwner::TeamB, 'node 2 should be TeamB');
    }

    #[test]
    fn test_win_condition_vault_zero() {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (actions_addr, _) = world.dns(@"actions").unwrap();
        let actions_sys = IActionsDispatcher { contract_address: actions_addr };
        let (cr_addr, _) = world.dns(@"commit_reveal").unwrap();
        let cr_sys = ICommitRevealDispatcher { contract_address: cr_addr };

        let addr1 = contract_address_const::<0x1>();
        let addr2 = contract_address_const::<0x2>();
        let addr3 = contract_address_const::<0x3>();
        let addr4 = contract_address_const::<0x4>();
        let match_id = actions_sys.create_match(addr1, addr2, addr3, addr4);

        // Set vault B HP low
        world.write_model_test(@MatchState {
            match_id,
            team_a_attacker: addr1, team_a_defender: addr2,
            team_b_attacker: addr3, team_b_defender: addr4,
            vault_a_hp: 100, vault_b_hp: 5,
            current_round: 1,
            status: MatchStatus::Active,
        });

        let salt: felt252 = 7;
        let h1 = hash_attacker(salt, 5, 3, 2, 0, 0, 0);
        let h2 = hash_defender(salt, 5, 3, 2, 0, 0, 0, 0);
        let h3 = hash_attacker(salt, 0, 0, 0, 5, 3, 2);
        let h4 = hash_defender(salt, 0, 0, 0, 0, 5, 3, 2);

        testing::set_contract_address(addr1);
        cr_sys.commit(match_id, h1);
        testing::set_contract_address(addr2);
        cr_sys.commit(match_id, h2);
        testing::set_contract_address(addr3);
        cr_sys.commit(match_id, h3);
        testing::set_contract_address(addr4);
        cr_sys.commit(match_id, h4);

        testing::set_contract_address(addr1);
        cr_sys.reveal_attacker(match_id, salt, 5, 3, 2, 0, 0, 0);
        testing::set_contract_address(addr2);
        cr_sys.reveal_defender(match_id, salt, 5, 3, 2, 0, 0, 0, 0);
        testing::set_contract_address(addr3);
        cr_sys.reveal_attacker(match_id, salt, 0, 0, 0, 5, 3, 2);
        testing::set_contract_address(addr4);
        cr_sys.reveal_defender(match_id, salt, 0, 0, 0, 0, 5, 3, 2);

        let state: MatchState = world.read_model(match_id);
        assert(state.vault_b_hp == 0, 'vault B should be 0');
        assert(state.status == MatchStatus::Finished, 'match should be finished');
    }

    #[test]
    fn test_no_damage_when_defense_exceeds_attack() {
        let (mut world, match_id) = setup_and_play_round(
            (1, 1, 1, 3, 2, 2),
            (5, 3, 2, 0, 0, 0, 0),
            (1, 1, 1, 3, 2, 2),
            (5, 3, 2, 0, 0, 0, 0),
        );

        let state: MatchState = world.read_model(match_id);
        assert(state.vault_a_hp == 100, 'no damage to A');
        assert(state.vault_b_hp == 100, 'no damage to B');
    }

    #[test]
    fn test_node_tie_no_change() {
        let (mut world, match_id) = setup_and_play_round(
            (5, 0, 0, 2, 2, 1),
            (0, 0, 0, 0, 2, 2, 6),
            (5, 0, 0, 2, 2, 1),
            (0, 0, 0, 0, 2, 2, 6),
        );

        let n0: NodeState = world.read_model((match_id, 0_u8));
        assert(n0.owner == NodeOwner::None, 'tied node stays None');
    }
}
