# Crafting + Ability Storage (Phase 2A) — Design Spec

## Goal

Players burn ERC-20 resource tokens to craft abilities. Abilities are stored on-chain per player and persist across matches. This is the economy side — battle integration is a separate spec (Phase 2B).

## Ability Definitions

| ID | Name | Cost | Effect (applied in Phase 2B) |
|----|------|------|------------------------------|
| 1 | Siege Sword | 3 Iron + 2 Wood | Max damage (10) to one gate for 1 round |
| 2 | Stone Cloak | 3 Stone + 2 Linen | Block all gate damage for 1 round |
| 3 | Ember Blast | 3 Ember + 2 Seeds | Deal 5 direct damage bypassing gates |
| 4 | Hex | 2 Iron + 2 Stone + 1 Ember | Opponent's budget reduced by 7 for 1 round |
| 5 | Fortify | 2 Stone + 2 Linen + 1 Wood | Double defense on all gates for 1 round |

## On-chain: PlayerAbilities Model

```cairo
#[dojo::model]
#[derive(Drop, Serde)]
pub struct PlayerAbilities {
    #[key]
    pub player: ContractAddress,
    pub siege_sword: u8,
    pub stone_cloak: u8,
    pub ember_blast: u8,
    pub hex: u8,
    pub fortify: u8,
}
```

Each field is a count of how many the player owns. Crafting increments. Using in a match (Phase 2B) decrements.

## On-chain: Crafting Contract

New Dojo system `crafting_1v1` in the `siege_dojo` world namespace.

### Interface

```cairo
#[starknet::interface]
pub trait ICrafting1v1<T> {
    fn craft_ability(ref self: T, ability_id: u8);
}
```

### Behavior

`craft_ability(ability_id)`:
1. Read caller address
2. Look up recipe for `ability_id` (1-5)
3. For each required resource:
   - Call `balance_of(caller)` on the ERC-20 token
   - Assert balance >= required amount
   - Call `transfer_from(caller, zero_address, amount)` to burn tokens
4. Read `PlayerAbilities` for caller
5. Increment the matching ability field
6. Write `PlayerAbilities`

### Resource Token Burning

The crafting contract needs to call `transfer_from` on each ERC-20. This requires the player to have called `approve(crafting_contract, amount)` on each token first.

Alternatively, the crafting contract could use a `burn` function if the tokens support it. Since our `ResourceToken` contract has a `minter` role, we can add a `burn_from` function that the crafting contract can call — but this requires the crafting contract to be authorized.

Simplest approach: the frontend calls `approve` on each required token before calling `craft_ability`. The crafting contract then calls `transfer_from(caller, burn_address, amount)`. The burn address can be a known dead address (`0x1` or similar).

### Recipes (hardcoded in contract)

```
ability 1 (Siege Sword): 3 iron, 2 wood
ability 2 (Stone Cloak): 3 stone, 2 linen
ability 3 (Ember Blast): 3 ember, 2 seeds
ability 4 (Hex):         2 iron, 2 stone, 1 ember
ability 5 (Fortify):     2 stone, 2 linen, 1 wood
```

The crafting contract reads token addresses from `ResourceConfig` (already deployed, keyed by `id: 0`).

## Frontend: Crafting Page

### Route: `/craft`

New page accessible from the home page navigation.

### Layout

- **Header**: "FORGE YOUR ARSENAL" (serif font, medieval styling)
- **Resource bar**: Current balances of all 6 resources (same as match page)
- **Ability cards**: 5 cards in a grid, each showing:
  - Ability name (serif font)
  - Effect description
  - Resource cost (with colored resource labels)
  - "CRAFT" button
  - Current inventory count ("You own: 2")
  - Button disabled + greyed if insufficient resources
- **Transaction flow**: Clicking CRAFT triggers:
  1. `approve` calls on each required ERC-20 token (approve crafting contract to spend)
  2. `craft_ability(id)` call on the crafting contract
  3. Refresh balances and inventory

### Session Policies

Add to Cartridge Controller session policies:
- `craft_ability` on `crafting_1v1` contract
- `approve` on each of the 6 ERC-20 token contracts

### Home Page Update

Add a "FORGE" link in the navbar or on the home page cards that links to `/craft`.

## What This Does NOT Cover (Phase 2B)

- Equipping abilities before a match (selecting up to 3)
- Activating abilities during a round (before allocating)
- Ability effects in resolution_1v1 contract
- Ability display in match UI
- Decrementing ability counts when used

## Deployment Notes

- New `crafting_1v1` contract deployed via `sozo migrate`
- `PlayerAbilities` model registered automatically
- Crafting contract needs to be able to call `transfer_from` on the 6 ERC-20 tokens
- Players need to `approve` the crafting contract before crafting
