# Resource Nodes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename generic nodes to themed resource nodes (Forge, Quarry, Grove) and mint ERC-20 resource tokens (Iron, Linen, Stone, Wood, Ember, Seeds) to players for each round of node control.

**Architecture:** 6 standalone ERC-20 token contracts using OpenZeppelin Cairo v3.0.0. The `resolution_1v1` contract mints tokens after node contests resolve. Frontend renames node labels throughout the UI.

**Tech Stack:** Cairo 2.13.1, OpenZeppelin Cairo v3.0.0, Dojo v1.8.0, starknet.js v8

**Spec:** `docs/superpowers/specs/2026-04-04-resource-nodes-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `Scarb.toml` | Add openzeppelin_token dependency |
| Create | `src/tokens/resource_token.cairo` | Generic mintable ERC-20 contract |
| Create | `src/tokens.cairo` | Module declaration |
| Modify | `src/lib.cairo` | Register tokens module |
| Modify | `src/systems/resolution_1v1.cairo` | Mint tokens after node contests |
| Modify | `src/models/events.cairo` | Add ResourcesAwarded event |
| Modify | `frontend/src/components/AllocationForm1v1.tsx` | Rename node labels |
| Modify | `frontend/src/app/match-1v1/[id]/page.tsx` | Rename node labels in display |

---

## Task 1: Add OpenZeppelin Dependency

**Files:**
- Modify: `Scarb.toml`

- [ ] **Step 1: Add openzeppelin_token to dependencies**

Add to `Scarb.toml` under `[dependencies]`:

```toml
[dependencies]
starknet = "2.13.1"
dojo = { git = "https://github.com/dojoengine/dojo.git", tag = "v1.8.0" }
openzeppelin_token = { git = "https://github.com/OpenZeppelin/cairo-contracts.git", tag = "v3.0.0" }
```

- [ ] **Step 2: Verify it resolves**

Run: `sozo build`
Expected: Scarb fetches the OpenZeppelin dependency and compiles. May take longer on first build.

- [ ] **Step 3: Commit**

```bash
git add Scarb.toml Scarb.lock
git commit -m "deps: add openzeppelin_token v3.0.0 for ERC-20 resources"
```

---

## Task 2: Create Resource Token Contract

**Files:**
- Create: `src/tokens/resource_token.cairo`
- Create: `src/tokens.cairo`
- Modify: `src/lib.cairo`

A single generic ERC-20 contract that gets deployed 6 times with different names/symbols. It has a `minter` address (set at construction) that's authorized to mint tokens.

- [ ] **Step 1: Create `src/tokens.cairo`**

```cairo
pub mod resource_token;
```

- [ ] **Step 2: Create `src/tokens/resource_token.cairo`**

```cairo
#[starknet::interface]
pub trait IResourceToken<TContractState> {
    fn mint(ref self: TContractState, to: starknet::ContractAddress, amount: u256);
    fn minter(self: @TContractState) -> starknet::ContractAddress;
}

#[starknet::contract]
pub mod ResourceToken {
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use openzeppelin_token::erc20::{ERC20Component, ERC20HooksEmptyImpl};

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);

    #[abi(embed_v0)]
    impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
        minter_address: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        name: ByteArray,
        symbol: ByteArray,
        minter: ContractAddress,
    ) {
        self.erc20.initializer(name, symbol);
        self.minter_address.write(minter);
    }

    #[abi(embed_v0)]
    impl ResourceTokenImpl of super::IResourceToken<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            assert(get_caller_address() == self.minter_address.read(), 'Only minter can mint');
            self.erc20.mint(to, amount);
        }

        fn minter(self: @ContractState) -> ContractAddress {
            self.minter_address.read()
        }
    }
}
```

- [ ] **Step 3: Register in `lib.cairo`**

Add after the systems block:

```cairo
pub mod tokens;
```

- [ ] **Step 4: Verify it compiles**

Run: `sozo build`
Expected: Compiles successfully. The ERC-20 contract should be included in the build output.

- [ ] **Step 5: Commit**

```bash
git add src/tokens.cairo src/tokens/resource_token.cairo src/lib.cairo
git commit -m "feat: add generic mintable ERC-20 resource token contract"
```

---

## Task 3: Update Resolution to Mint Resources

**Files:**
- Modify: `src/systems/resolution_1v1.cairo`
- Modify: `src/models/events.cairo`

The resolution contract needs to know the 6 token contract addresses. Since these aren't deployed yet, we'll use a Dojo model (`ResourceConfig`) to store them, written once during setup.

Actually, simpler: we'll define the token addresses as a Dojo model keyed by a fixed ID, set after deployment. The resolution reads from it.

- [ ] **Step 1: Create `src/models/resource_config.cairo`**

```cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct ResourceConfig {
    #[key]
    pub id: u8,  // always 0
    pub iron: ContractAddress,
    pub linen: ContractAddress,
    pub stone: ContractAddress,
    pub wood: ContractAddress,
    pub ember: ContractAddress,
    pub seeds: ContractAddress,
}
```

- [ ] **Step 2: Register in `lib.cairo`**

Add `pub mod resource_config;` to the models block.

- [ ] **Step 3: Add a `set_resource_config` function to `actions_1v1`**

Add to the `IActions1v1` trait:

```cairo
fn set_resource_config(
    ref self: T,
    iron: ContractAddress, linen: ContractAddress,
    stone: ContractAddress, wood: ContractAddress,
    ember: ContractAddress, seeds: ContractAddress,
);
```

Implementation (inside `mod actions_1v1`):

```cairo
fn set_resource_config(
    ref self: ContractState,
    iron: ContractAddress, linen: ContractAddress,
    stone: ContractAddress, wood: ContractAddress,
    ember: ContractAddress, seeds: ContractAddress,
) {
    let mut world = self.world_default();
    world.write_model(@ResourceConfig {
        id: 0,
        iron, linen, stone, wood, ember, seeds,
    });
}
```

Import `ResourceConfig` at the top of the module.

- [ ] **Step 4: Add minting to `resolution_1v1`**

After trap damage is applied and before the `RoundResolved` event, add resource minting. In `resolution_1v1.cairo`:

Add the import for the token dispatcher at the top of the module (inside `mod resolution_1v1`):

```cairo
use siege_dojo::models::resource_config::ResourceConfig;
use siege_dojo::tokens::resource_token::{IResourceTokenDispatcher, IResourceTokenDispatcherTrait};
```

After `state.vault_a_hp = hp_a; state.vault_b_hp = hp_b;` (the line after trap damage), add:

```cairo
            // Award resource tokens for node ownership
            let config: ResourceConfig = world.read_model(0_u8);
            let mut rn: u8 = 0;
            while rn < 3 {
                let node: NodeState = world.read_model((match_id, rn));
                let owner_addr = if node.owner == NodeOwner::TeamA {
                    state.player_a
                } else if node.owner == NodeOwner::TeamB {
                    state.player_b
                } else {
                    // Node is unowned, no resources
                    rn += 1;
                    continue;
                };

                let (token_a_addr, token_b_addr) = if rn == 0 {
                    (config.iron, config.linen)         // Forge
                } else if rn == 1 {
                    (config.stone, config.wood)          // Quarry
                } else {
                    (config.ember, config.seeds)          // Grove
                };

                let token_a = IResourceTokenDispatcher { contract_address: token_a_addr };
                let token_b = IResourceTokenDispatcher { contract_address: token_b_addr };
                token_a.mint(owner_addr, 1);
                token_b.mint(owner_addr, 1);

                rn += 1;
            };
```

- [ ] **Step 5: Verify it compiles**

Run: `sozo build`

- [ ] **Step 6: Commit**

```bash
git add src/models/resource_config.cairo src/systems/actions_1v1.cairo src/systems/resolution_1v1.cairo src/lib.cairo
git commit -m "feat: mint ERC-20 resource tokens during round resolution"
```

---

## Task 4: Deploy Tokens to Sepolia

**Files:** Deployment step — no code changes.

This is a multi-step deployment:
1. Build and migrate the updated Dojo world (registers ResourceConfig model, updates resolution)
2. Deploy 6 ERC-20 token contracts via `starkli` (standalone, not Dojo-managed)
3. Call `set_resource_config` to store token addresses
4. Grant minting permissions (each token's minter = resolution_1v1 address)

- [ ] **Step 1: Build and migrate Dojo**

```bash
export DOJO_ACCOUNT_ADDRESS="0x040a26c15f86b70cc384d042ce0d87283e801bb459f369c4f588be3070c37f95"
export DOJO_PRIVATE_KEY="0x045665a95013a3060e87538a4271eeab7738e78fcf317e52f279f16c8cc6c483"
/tmp/sozo build -P sepolia
/tmp/sozo -P sepolia migrate
/tmp/sozo -P sepolia auth grant writer \
  siege_dojo,siege_dojo-actions_1v1 \
  siege_dojo,siege_dojo-commit_reveal_1v1 \
  siege_dojo,siege_dojo-resolution_1v1
```

- [ ] **Step 2: Deploy 6 ERC-20 tokens**

The ResourceToken contract class should be declared during the Dojo migration (since it's in the build). Each token is deployed with different constructor args (name, symbol, minter = resolution_1v1 address).

The minter address must be the `resolution_1v1` contract address: `0x1b31a6098f1b9081e925e98cd9627c6a5cce39073e92c3f5bf827cb09abe36b`

Use `starkli deploy` for each token, or write a deployment script. Example for Iron:

```bash
starkli deploy <CLASS_HASH> \
  str:"Iron" str:"IRON" 0x1b31a6098f1b9081e925e98cd9627c6a5cce39073e92c3f5bf827cb09abe36b \
  --rpc https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8 \
  --account <account_file>
```

Repeat for: Iron/IRON, Linen/LINEN, Stone/STONE, Wood/WOOD, Ember/EMBER, Seeds/SEEDS.

Record all 6 deployed addresses.

- [ ] **Step 3: Set resource config**

Call `set_resource_config` on the `actions_1v1` contract with all 6 token addresses. Can use `sozo execute` or `starkli invoke`.

- [ ] **Step 4: Commit manifest**

```bash
git add manifest_sepolia.json
git commit -m "deploy: deploy 6 ERC-20 resource tokens to Sepolia"
```

---

## Task 5: Frontend — Rename Node Labels

**Files:**
- Modify: `frontend/src/components/AllocationForm1v1.tsx`
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx`

- [ ] **Step 1: Update `AllocationForm1v1.tsx` node labels**

Change the `NODE_LABELS` array:

```typescript
const NODE_LABELS = ["Forge (Iron + Linen)", "Quarry (Stone + Wood)", "Grove (Ember + Seeds)"];
```

- [ ] **Step 2: Update match page node display**

In `match-1v1/[id]/page.tsx`, find the node rendering section (the "Resource Nodes" div) and update:

Change the node names array:
```typescript
const nodeNames = ["Forge", "Quarry", "Grove"];
const nodeResources = ["Iron + Linen", "Stone + Wood", "Ember + Seeds"];
```

Update the node display to show both name and resources:
```tsx
<span className="text-xs text-[#6a6a7a]">{nodeNames[i]}</span>
<span className="text-[10px] text-[#6a6a7a]">({nodeResources[i]})</span>
```

Change the section title from "Resource Nodes" to "Resource Nodes".

- [ ] **Step 3: Update round history trap labels**

In the trap display section, change "Node X" references:
```typescript
const nodeNames = ["Forge", "Quarry", "Grove"];
// ...
`You trapped ${nodeNames[ni]}`
`Enemy trapped ${nodeNames[ni]}!`
```

- [ ] **Step 4: Update gate conditions section title**

The "Gate Conditions" section already uses ["East Gate", "West Gate", "Underground"] — these stay the same.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AllocationForm1v1.tsx frontend/src/app/match-1v1/[id]/page.tsx
git commit -m "feat: rename nodes to Forge, Quarry, Grove with resource labels"
```

---

## Task 6: Update CLAUDE.md and Docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update 1v1 section**

In the "Budget Allocation" section, change:
```markdown
- Nodes: 3 node contests (nc0, nc1, nc2)
```
To:
```markdown
- Nodes: Forge (nc0), Quarry (nc1), Grove (nc2) — controlling a node awards resource tokens each round
```

Add a new section after "Node Traps":

```markdown
### Resource Tokens

6 ERC-20 tokens (0 decimals) awarded for controlling resource nodes:

| Node | Token 1 | Token 2 |
|------|---------|---------|
| Forge (nc0) | IRON | LINEN |
| Quarry (nc1) | STONE | WOOD |
| Grove (nc2) | EMBER | SEEDS |

Each round, controlling a node mints 1 of each paired token to the player. Resources persist across matches and are tradeable.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add resource token docs to CLAUDE.md"
```
