#[dojo::model]
#[derive(Drop, Serde)]
pub struct RoundTraps1v1 {
    #[key]
    pub match_id: u64,
    #[key]
    pub round: u32,
    pub a_trap0: u8,
    pub a_trap1: u8,
    pub a_trap2: u8,
    pub b_trap0: u8,
    pub b_trap1: u8,
    pub b_trap2: u8,
}
