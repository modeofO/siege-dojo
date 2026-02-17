#[derive(Drop, Copy, Serde, PartialEq, Introspect, DojoStore, Default, Debug)]
pub enum NodeOwner {
    #[default]
    None,
    TeamA,
    TeamB,
}

#[dojo::model]
#[derive(Drop, Serde, Debug)]
pub struct NodeState {
    #[key]
    pub match_id: u64,
    #[key]
    pub node_index: u8,
    pub owner: NodeOwner,
}
