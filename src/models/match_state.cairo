use starknet::ContractAddress;

#[derive(Drop, Copy, Serde, PartialEq, Introspect, DojoStore, Default, Debug)]
pub enum MatchStatus {
    #[default]
    Pending,
    Active,
    Finished,
}

#[dojo::model]
#[derive(Drop, Serde, Debug)]
pub struct MatchState {
    #[key]
    pub match_id: u64,
    pub team_a_attacker: ContractAddress,
    pub team_a_defender: ContractAddress,
    pub team_b_attacker: ContractAddress,
    pub team_b_defender: ContractAddress,
    pub vault_a_hp: u8,
    pub vault_b_hp: u8,
    pub current_round: u32,
    pub status: MatchStatus,
}
