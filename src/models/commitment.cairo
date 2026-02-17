#[dojo::model]
#[derive(Drop, Serde)]
pub struct Commitment {
    #[key]
    pub match_id: u64,
    #[key]
    pub round: u32,
    #[key]
    pub role: u8,
    pub hash: felt252,
    pub committed: bool,
    pub revealed: bool,
}
