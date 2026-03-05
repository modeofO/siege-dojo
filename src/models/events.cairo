use starknet::ContractAddress;

#[dojo::event]
#[derive(Drop, Serde)]
pub struct MatchCreated {
    #[key]
    pub match_id: u64,
    pub team_a_attacker: ContractAddress,
    pub team_a_defender: ContractAddress,
    pub team_b_attacker: ContractAddress,
    pub team_b_defender: ContractAddress,
}

#[dojo::event]
#[derive(Drop, Serde)]
pub struct MoveCommitted {
    #[key]
    pub match_id: u64,
    pub round: u32,
    pub role: u8,
}

#[dojo::event]
#[derive(Drop, Serde)]
pub struct MoveRevealed {
    #[key]
    pub match_id: u64,
    pub round: u32,
    pub role: u8,
}

#[dojo::event]
#[derive(Drop, Serde)]
pub struct RoundResolved {
    #[key]
    pub match_id: u64,
    pub round: u32,
    pub vault_a_hp: u32,
    pub vault_b_hp: u32,
}

#[dojo::event]
#[derive(Drop, Serde)]
pub struct MatchFinished {
    #[key]
    pub match_id: u64,
    pub winner_team: u8,
}
