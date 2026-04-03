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

#[dojo::contract]
pub mod actions_1v1 {
    use starknet::ContractAddress;
    use dojo::model::ModelStorage;
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::MatchState1v1;
    use siege_dojo::models::node_state::{NodeState, NodeOwner};
    use siege_dojo::models::match_counter::MatchCounter;
    use siege_dojo::models::events::MatchCreated1v1;
    use dojo::event::EventStorage;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
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
