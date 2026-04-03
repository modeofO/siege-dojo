use starknet::ContractAddress;
use siege_dojo::models::match_state::MatchStatus;

#[dojo::model]
#[derive(Drop, Serde, Debug)]
pub struct MatchState1v1 {
    #[key]
    pub match_id: u64,
    pub player_a: ContractAddress,
    pub player_b: ContractAddress,
    pub vault_a_hp: u8,
    pub vault_b_hp: u8,
    pub current_round: u32,
    pub status: MatchStatus,
}
