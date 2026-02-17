#[dojo::model]
#[derive(Drop, Serde)]
pub struct MatchCounter {
    #[key]
    pub id: u8,
    pub count: u64,
}
