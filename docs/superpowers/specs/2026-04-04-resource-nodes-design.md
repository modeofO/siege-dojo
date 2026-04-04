# Resource Nodes (Phase 1) — Design Spec

## Goal

Rename the 3 generic nodes to themed resource nodes (Forge, Quarry, Grove) and award persistent per-player resources for each round of node control. This is the foundation for the crafting/ability system in future phases.

## Node Definitions

| Index | Name | Resources | Theme |
|-------|------|-----------|-------|
| 0 | **Forge** | Iron + Linen | Military supply |
| 1 | **Quarry** | Stone + Wood | Construction |
| 2 | **Grove** | Ember + Seeds | Elemental |

## Resource Accumulation

After each round resolves, each player earns 1 of each resource from nodes they control at the end of the round (after contests resolve, after traps trigger).

- Controlling Forge for 1 round = +1 Iron, +1 Linen
- Controlling all 3 nodes for 5 rounds = 30 total resources (5 of each type)
- Resources persist across matches — stored in a global per-player model

## New On-chain Model: `PlayerResources`

```cairo
#[dojo::model]
#[derive(Drop, Serde)]
pub struct PlayerResources {
    #[key]
    pub player: ContractAddress,
    pub iron: u32,
    pub linen: u32,
    pub stone: u32,
    pub wood: u32,
    pub ember: u32,
    pub seeds: u32,
}
```

Keyed by `ContractAddress` — not match-scoped. Resources accumulate globally across all matches.

Uses `u32` for headroom (resources grow indefinitely).

## Contract Changes

### `resolution_1v1.cairo`

After node contests resolve and trap damage is applied, award resources:

```
For each node n (0, 1, 2):
    Read post-contest NodeState for node n
    If owner == TeamA:
        Read PlayerResources for player_a address
        Increment resource pair for node n
        Write PlayerResources
    If owner == TeamB:
        Read PlayerResources for player_b address
        Increment resource pair for node n
        Write PlayerResources
```

Node-to-resource mapping:
- Node 0 (Forge): iron += 1, linen += 1
- Node 1 (Quarry): stone += 1, wood += 1
- Node 2 (Grove): ember += 1, seeds += 1

The player addresses come from `MatchState1v1.player_a` and `MatchState1v1.player_b`.

### New file: `src/models/player_resources.cairo`

Register in `src/lib.cairo` models block.

## Frontend Changes

### Label Renames

Update everywhere nodes are displayed:

**`AllocationForm1v1.tsx`:**
- "Node 1" → "Forge (Iron + Linen)"
- "Node 2" → "Quarry (Stone + Wood)"
- "Node 3" → "Grove (Ember + Seeds)"

**Match page node display (`match-1v1/[id]/page.tsx`):**
- Node indicators: show name + resource icons
- Node ownership labels: "Forge: Yours" / "Quarry: Enemy" / "Grove: Neutral"

**Round history:**
- "Node 1 trapped" → "Forge trapped"
- Gate names unchanged (East Gate, West Gate, Underground)

### Resource Display (optional, lightweight)

Show a small resource counter on the match page — total resources earned this match so far. Not critical for Phase 1, but nice to see accumulation in real-time.

## What Does NOT Change

- Node contest mechanics (same spend-to-win)
- Trap mechanics (traps work on named nodes, same 5 damage)
- Budget system (base 10 + 1 per controlled node)
- Gate modifiers (unchanged)
- Gate labels (East Gate, West Gate, Underground stay the same)

## Future Design Notes

These items are OUT OF SCOPE for Phase 1 but should be kept in mind:

- **Phase 2: Crafting** — define 4-5 abilities with resource recipes. `PlayerResources` will be read to check if player can afford to craft. A new `PlayerAbilities` model stores crafted abilities.
- **Phase 3: NFT minting** — abilities become transferable NFTs. Need ERC-721 or similar on Starknet.
- **Round win rewards** — milestone system (win X rounds → earn a specific ability). Separate model tracking round wins per player.
- **Ability usage in battle** — equip up to 3 per match. New UI for ability selection before/during match. Contract changes for ability effects during resolution.
- **Ability art/metadata** — Loot-style generative or hand-crafted art. IPFS metadata. On-chain SVG rendering possible (like original Loot).
- **Resource balancing** — may need to adjust yield rates (currently 1 per round per node) once crafting costs are defined.
