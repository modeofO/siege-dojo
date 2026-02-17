use starknet::ContractAddress;

#[starknet::interface]
pub trait IActions<T> {
    fn create_match(
        ref self: T,
        team_a_attacker: ContractAddress,
        team_a_defender: ContractAddress,
        team_b_attacker: ContractAddress,
        team_b_defender: ContractAddress,
    ) -> u64;
    fn get_team_budget(self: @T, match_id: u64, is_team_a: bool) -> u8;
}

#[dojo::contract]
pub mod actions {
    use starknet::ContractAddress;
    use dojo::model::ModelStorage;
    use siege_dojo::models::match_state::{MatchState, MatchStatus};
    use siege_dojo::models::node_state::{NodeState, NodeOwner};
    use siege_dojo::models::match_counter::MatchCounter;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    #[abi(embed_v0)]
    impl ActionsImpl of super::IActions<ContractState> {
        fn create_match(
            ref self: ContractState,
            team_a_attacker: ContractAddress,
            team_a_defender: ContractAddress,
            team_b_attacker: ContractAddress,
            team_b_defender: ContractAddress,
        ) -> u64 {
            let mut world = self.world_default();
            let mut counter: MatchCounter = world.read_model(0_u8);
            let match_id = counter.count + 1;
            counter.count = match_id;
            world.write_model(@counter);

            world.write_model(@MatchState {
                match_id,
                team_a_attacker,
                team_a_defender,
                team_b_attacker,
                team_b_defender,
                vault_a_hp: 100,
                vault_b_hp: 100,
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

            match_id
        }

        fn get_team_budget(self: @ContractState, match_id: u64, is_team_a: bool) -> u8 {
            let world = self.world_default();
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
    }
}
