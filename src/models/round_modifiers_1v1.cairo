// Modifier IDs:
// 0 = Normal
// 1 = Narrow Pass (attack and defense capped at 3)
// 2 = Mirror Gate (attack/defense swap)
// 3 = Deadlock (no damage)
// 4 = Overflow (damage splits to other gates)

#[dojo::model]
#[derive(Drop, Serde)]
pub struct RoundModifiers1v1 {
    #[key]
    pub match_id: u64,
    #[key]
    pub round: u32,
    pub gate_0: u8,
    pub gate_1: u8,
    pub gate_2: u8,
}
