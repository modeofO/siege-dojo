#[dojo::model]
#[derive(Drop, Serde)]
pub struct RoundMoves {
    #[key]
    pub match_id: u64,
    #[key]
    pub round: u32,
    pub commit_count: u8,
    pub reveal_count: u8,
    pub commit_deadline: u64,
    pub reveal_deadline: u64,
    pub ready: bool,
    // Team A attacker moves (attacks team B vault)
    pub atk_a_p0: u8,
    pub atk_a_p1: u8,
    pub atk_a_p2: u8,
    pub atk_a_nc0: u8,
    pub atk_a_nc1: u8,
    pub atk_a_nc2: u8,
    // Team A defender moves (defends team A vault)
    pub def_a_g0: u8,
    pub def_a_g1: u8,
    pub def_a_g2: u8,
    pub def_a_repair: u8,
    pub def_a_nc0: u8,
    pub def_a_nc1: u8,
    pub def_a_nc2: u8,
    // Team B attacker moves (attacks team A vault)
    pub atk_b_p0: u8,
    pub atk_b_p1: u8,
    pub atk_b_p2: u8,
    pub atk_b_nc0: u8,
    pub atk_b_nc1: u8,
    pub atk_b_nc2: u8,
    // Team B defender moves (defends team B vault)
    pub def_b_g0: u8,
    pub def_b_g1: u8,
    pub def_b_g2: u8,
    pub def_b_repair: u8,
    pub def_b_nc0: u8,
    pub def_b_nc1: u8,
    pub def_b_nc2: u8,
}
