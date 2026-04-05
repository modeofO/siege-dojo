# Crafting + Ability Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players burn ERC-20 resource tokens to craft abilities stored on-chain. A new `/craft` page shows inventory, resource balances, and crafting UI.

**Architecture:** New `PlayerAbilities` Dojo model stores ability counts per player. New `crafting_1v1` Dojo system burns ERC-20 tokens via `transfer_from` and increments ability counts. Frontend crafting page calls `approve` + `craft_ability` via Cartridge Controller.

**Tech Stack:** Cairo 2.13.1 / Dojo v1.8.0, OpenZeppelin ERC-20 (transfer_from/approve), starknet.js v8

**Spec:** `docs/superpowers/specs/2026-04-04-crafting-abilities-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/models/player_abilities.cairo` | On-chain ability inventory per player |
| Create | `src/systems/crafting_1v1.cairo` | Craft ability by burning resources |
| Modify | `src/lib.cairo` | Register new model + system |
| Create | `frontend/src/app/craft/page.tsx` | Crafting page UI |
| Create | `frontend/src/lib/craftingContracts.ts` | Crafting contract call wrappers |
| Modify | `frontend/src/lib/useResourceBalances.ts` | Export token addresses for reuse |
| Modify | `frontend/src/app/providers.tsx` | Add crafting session policies |
| Modify | `frontend/src/components/Navbar.tsx` | Add FORGE link |

---

## Task 1: PlayerAbilities Model

**Files:**
- Create: `src/models/player_abilities.cairo`
- Modify: `src/lib.cairo`

- [ ] **Step 1: Create `player_abilities.cairo`**

```cairo
// src/models/player_abilities.cairo
use starknet::ContractAddress;

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

- [ ] **Step 2: Register in `lib.cairo`**

Add `pub mod player_abilities;` to the models block (after `resource_config`).

- [ ] **Step 3: Verify compilation**

Run: `sozo build`

- [ ] **Step 4: Commit**

```bash
git add src/models/player_abilities.cairo src/lib.cairo
git commit -m "feat: add PlayerAbilities model"
```

---

## Task 2: Crafting Contract

**Files:**
- Create: `src/systems/crafting_1v1.cairo`
- Modify: `src/lib.cairo`

- [ ] **Step 1: Create `crafting_1v1.cairo`**

```cairo
// src/systems/crafting_1v1.cairo
use starknet::ContractAddress;

#[starknet::interface]
pub trait ICrafting1v1<T> {
    fn craft_ability(ref self: T, ability_id: u8);
}

#[starknet::interface]
pub trait IERC20Transfer<T> {
    fn transfer_from(ref self: T, sender: ContractAddress, recipient: ContractAddress, amount: u256) -> bool;
    fn balance_of(self: @T, account: ContractAddress) -> u256;
}

#[dojo::contract]
pub mod crafting_1v1 {
    use starknet::{ContractAddress, get_caller_address};
    use dojo::model::ModelStorage;
    use siege_dojo::models::player_abilities::PlayerAbilities;
    use siege_dojo::models::resource_config::ResourceConfig;
    use super::{IERC20TransferDispatcher, IERC20TransferDispatcherTrait};

    // Burn address — tokens sent here are effectively burned
    const BURN_ADDRESS: felt252 = 0x1;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    fn burn_tokens(
        token_addr: ContractAddress,
        from: ContractAddress,
        amount: u256,
    ) {
        let token = IERC20TransferDispatcher { contract_address: token_addr };
        let balance = token.balance_of(from);
        assert(balance >= amount, 'Insufficient balance');
        let burn_addr: ContractAddress = BURN_ADDRESS.try_into().unwrap();
        token.transfer_from(from, burn_addr, amount);
    }

    #[abi(embed_v0)]
    impl Crafting1v1Impl of super::ICrafting1v1<ContractState> {
        fn craft_ability(ref self: ContractState, ability_id: u8) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            // Read resource config for token addresses
            let config: ResourceConfig = world.read_model(0_u8);

            // Burn resources based on ability recipe
            if ability_id == 1 {
                // Siege Sword: 3 Iron + 2 Wood
                burn_tokens(config.iron, caller, 3);
                burn_tokens(config.wood, caller, 2);
            } else if ability_id == 2 {
                // Stone Cloak: 3 Stone + 2 Linen
                burn_tokens(config.stone, caller, 3);
                burn_tokens(config.linen, caller, 2);
            } else if ability_id == 3 {
                // Ember Blast: 3 Ember + 2 Seeds
                burn_tokens(config.ember, caller, 3);
                burn_tokens(config.seeds, caller, 2);
            } else if ability_id == 4 {
                // Hex: 2 Iron + 2 Stone + 1 Ember
                burn_tokens(config.iron, caller, 2);
                burn_tokens(config.stone, caller, 2);
                burn_tokens(config.ember, caller, 1);
            } else if ability_id == 5 {
                // Fortify: 2 Stone + 2 Linen + 1 Wood
                burn_tokens(config.stone, caller, 2);
                burn_tokens(config.linen, caller, 2);
                burn_tokens(config.wood, caller, 1);
            } else {
                panic!("Invalid ability ID");
            }

            // Increment ability count
            let mut abilities: PlayerAbilities = world.read_model(caller);
            if ability_id == 1 { abilities.siege_sword += 1; }
            else if ability_id == 2 { abilities.stone_cloak += 1; }
            else if ability_id == 3 { abilities.ember_blast += 1; }
            else if ability_id == 4 { abilities.hex += 1; }
            else if ability_id == 5 { abilities.fortify += 1; }
            world.write_model(@abilities);
        }
    }
}
```

- [ ] **Step 2: Register in `lib.cairo`**

Add `pub mod crafting_1v1;` to the systems block.

- [ ] **Step 3: Verify compilation**

Run: `sozo build`

- [ ] **Step 4: Commit**

```bash
git add src/systems/crafting_1v1.cairo src/lib.cairo
git commit -m "feat: add crafting_1v1 system (burn resources, mint abilities)"
```

---

## Task 3: Deploy to Sepolia

**Files:** Deployment step.

- [ ] **Step 1: Build and migrate**

```bash
export DOJO_ACCOUNT_ADDRESS="0x040a26c15f86b70cc384d042ce0d87283e801bb459f369c4f588be3070c37f95"
export DOJO_PRIVATE_KEY="0x045665a95013a3060e87538a4271eeab7738e78fcf317e52f279f16c8cc6c483"
/tmp/sozo build -P sepolia
/tmp/sozo -P sepolia migrate
```

- [ ] **Step 2: Grant permissions**

```bash
/tmp/sozo -P sepolia auth grant writer "siege_dojo,siege_dojo-crafting_1v1" --rpc-url https://api.cartridge.gg/x/starknet/sepolia
```

- [ ] **Step 3: Record crafting contract address**

```bash
cat manifest_sepolia.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for c in data.get('contracts', []):
    if 'crafting' in c.get('tag', ''):
        print(f\"{c['tag']}: {c['address']}\")
"
```

- [ ] **Step 4: Commit manifest**

```bash
git add manifest_sepolia.json
git commit -m "deploy: crafting_1v1 contract to Sepolia"
```

---

## Task 4: Frontend — Crafting Contract Wrappers

**Files:**
- Create: `frontend/src/lib/craftingContracts.ts`
- Modify: `frontend/src/lib/useResourceBalances.ts`
- Modify: `frontend/src/app/providers.tsx`

- [ ] **Step 1: Export token addresses from `useResourceBalances.ts`**

The `RESOURCE_TOKENS` object is currently not exported. Add `export` to the declaration:

Change:
```typescript
const RESOURCE_TOKENS = {
```
To:
```typescript
export const RESOURCE_TOKENS = {
```

- [ ] **Step 2: Create `craftingContracts.ts`**

```typescript
// frontend/src/lib/craftingContracts.ts
import type { AccountInterface } from "starknet";
import { RESOURCE_TOKENS } from "./useResourceBalances";

// Crafting contract address — update after deployment (Task 3)
export const CRAFTING_1V1_ADDRESS = process.env.NEXT_PUBLIC_CRAFTING_1V1_ADDRESS || "0xTODO_AFTER_DEPLOY";

// Ability definitions
export const ABILITIES = [
  {
    id: 1,
    name: "Siege Sword",
    effect: "Max damage (10) to one gate for 1 round",
    cost: { iron: 3, wood: 2 },
  },
  {
    id: 2,
    name: "Stone Cloak",
    effect: "Block all gate damage for 1 round",
    cost: { stone: 3, linen: 2 },
  },
  {
    id: 3,
    name: "Ember Blast",
    effect: "Deal 5 direct damage bypassing gates",
    cost: { ember: 3, seeds: 2 },
  },
  {
    id: 4,
    name: "Hex",
    effect: "Opponent's budget reduced by 7 for 1 round",
    cost: { iron: 2, stone: 2, ember: 1 },
  },
  {
    id: 5,
    name: "Fortify",
    effect: "Double defense on all gates for 1 round",
    cost: { stone: 2, linen: 2, wood: 1 },
  },
] as const;

export type AbilityCost = Record<string, number>;

export function canAfford(cost: AbilityCost, balances: Record<string, number>): boolean {
  return Object.entries(cost).every(([resource, amount]) => (balances[resource] || 0) >= amount);
}

// Approve all required tokens for crafting, then call craft_ability
export async function craftAbility(
  account: AccountInterface,
  abilityId: number,
  cost: AbilityCost,
): Promise<string> {
  // Build approve + craft multicall
  const calls = [];

  // Approve each required token
  for (const [resource, amount] of Object.entries(cost)) {
    const tokenAddr = RESOURCE_TOKENS[resource as keyof typeof RESOURCE_TOKENS];
    if (!tokenAddr) continue;
    calls.push({
      contractAddress: tokenAddr,
      entrypoint: "approve",
      calldata: [CRAFTING_1V1_ADDRESS, amount.toString(), "0"], // amount as u256 (low, high)
    });
  }

  // Call craft_ability
  calls.push({
    contractAddress: CRAFTING_1V1_ADDRESS,
    entrypoint: "craft_ability",
    calldata: [abilityId.toString()],
  });

  const result = await account.execute(calls);
  return result.transaction_hash;
}
```

- [ ] **Step 3: Add crafting session policies to `providers.tsx`**

Import at the top (alongside existing imports):
```typescript
import { CRAFTING_1V1_ADDRESS } from "@/lib/craftingContracts";
```

Add to `SESSION_POLICIES.contracts` (inside the contracts object):
```typescript
    [CRAFTING_1V1_ADDRESS]: {
      methods: [
        { name: "Craft Ability", entrypoint: "craft_ability" },
      ],
    },
```

Also add `approve` policies for each ERC-20 token. Import `RESOURCE_TOKENS`:
```typescript
import { RESOURCE_TOKENS } from "@/lib/useResourceBalances";
```

Add for each token:
```typescript
    ...Object.fromEntries(
      Object.values(RESOURCE_TOKENS).map(addr => [
        addr,
        { methods: [{ name: "Approve", entrypoint: "approve" }] },
      ])
    ),
```

Or manually add 6 entries — one per token with `approve` method.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/craftingContracts.ts frontend/src/lib/useResourceBalances.ts frontend/src/app/providers.tsx
git commit -m "feat: add crafting contract wrappers and session policies"
```

---

## Task 5: Frontend — Crafting Page

**Files:**
- Create: `frontend/src/app/craft/page.tsx`
- Modify: `frontend/src/components/Navbar.tsx`

- [ ] **Step 1: Create the crafting page**

```typescript
// frontend/src/app/craft/page.tsx
"use client";

import { useState } from "react";
import { useAccount } from "@/app/providers";
import { useResourceBalances, type ResourceBalances } from "@/lib/useResourceBalances";
import { ABILITIES, canAfford, craftAbility, type AbilityCost } from "@/lib/craftingContracts";
import { RpcProvider } from "starknet";
import Link from "next/link";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.cartridge.gg/x/starknet/sepolia";
const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "https://api.cartridge.gg/x/siege-dojo/torii";

// Fetch ability inventory from Torii
async function fetchAbilities(playerAddr: string): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${TORII_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
          siegeDojoPlayerAbilitiesModels(where: { player: "${playerAddr}" }) {
            edges { node { siege_sword stone_cloak ember_blast hex fortify } }
          }
        }`,
      }),
    });
    const data = await res.json();
    const node = data?.data?.siegeDojoPlayerAbilitiesModels?.edges?.[0]?.node;
    if (!node) return { siege_sword: 0, stone_cloak: 0, ember_blast: 0, hex: 0, fortify: 0 };
    return {
      siege_sword: Number(node.siege_sword) || 0,
      stone_cloak: Number(node.stone_cloak) || 0,
      ember_blast: Number(node.ember_blast) || 0,
      hex: Number(node.hex) || 0,
      fortify: Number(node.fortify) || 0,
    };
  } catch {
    return { siege_sword: 0, stone_cloak: 0, ember_blast: 0, hex: 0, fortify: 0 };
  }
}

const ABILITY_FIELDS = ["siege_sword", "stone_cloak", "ember_blast", "hex", "fortify"];

const RESOURCE_COLORS: Record<string, string> = {
  iron: "text-[#a0a0b0]",
  linen: "text-[#d4a574]",
  stone: "text-[#8a8a9a]",
  wood: "text-[#8b6914]",
  ember: "text-[#ff6633]",
  seeds: "text-[#66cc66]",
};

export default function CraftPage() {
  const { account, address, status } = useAccount();
  const isConnected = status === "connected";
  const resources = useResourceBalances(address);

  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [crafting, setCrafting] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loadedInventory, setLoadedInventory] = useState(false);

  // Load inventory on first render
  if (address && !loadedInventory) {
    setLoadedInventory(true);
    fetchAbilities(address).then(setInventory);
  }

  const handleCraft = async (abilityId: number, cost: AbilityCost) => {
    if (!account) return;
    setCrafting(abilityId);
    setError("");
    try {
      const provider = new RpcProvider({ nodeUrl: RPC_URL });
      const txHash = await craftAbility(account, abilityId, cost);
      await provider.waitForTransaction(txHash);
      // Refresh inventory
      if (address) {
        const inv = await fetchAbilities(address);
        setInventory(inv);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setCrafting(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-wider font-serif text-[#c8a44e]">
          FORGE YOUR ARSENAL
        </h1>
        <p className="text-sm text-[#7a7060]">
          Burn resources to craft abilities. Use them in battle.
        </p>
      </div>

      {!isConnected && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5 text-center">
          Connect your wallet to craft abilities
        </div>
      )}

      {/* Resource balances */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {Object.entries(resources).map(([name, value]) => (
          <div key={name} className="flex items-center gap-1 px-3 py-1 bg-[#252019] rounded border border-[#3d3428] text-sm">
            <span className={`font-bold ${RESOURCE_COLORS[name] || "text-[#d4cfc6]"}`}>{value}</span>
            <span className="text-[#7a7060] text-xs capitalize">{name}</span>
          </div>
        ))}
      </div>

      {/* Ability cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ABILITIES.map((ability) => {
          const affordable = canAfford(ability.cost as unknown as AbilityCost, resources as unknown as Record<string, number>);
          const owned = inventory[ABILITY_FIELDS[ability.id - 1]] || 0;
          const isCrafting = crafting === ability.id;

          return (
            <div key={ability.id} className="border border-[#3d3428] rounded-lg p-4 bg-[#1a1714] space-y-3">
              <div className="flex justify-between items-start">
                <h3 className="text-sm font-bold font-serif text-[#d4cfc6]">{ability.name}</h3>
                {owned > 0 && (
                  <span className="text-[10px] bg-[#c8a44e]/20 text-[#c8a44e] px-2 py-0.5 rounded">
                    Owned: {owned}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#7a7060]">{ability.effect}</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(ability.cost).map(([resource, amount]) => {
                  const hasEnough = (resources as unknown as Record<string, number>)[resource] >= amount;
                  return (
                    <span key={resource} className={`text-xs px-2 py-0.5 rounded border ${
                      hasEnough ? "border-[#3d3428] text-[#d4cfc6]" : "border-[#ff3344]/30 text-[#ff3344]"
                    }`}>
                      {amount} <span className="capitalize">{resource}</span>
                    </span>
                  );
                })}
              </div>
              <button
                onClick={() => handleCraft(ability.id, ability.cost as unknown as AbilityCost)}
                disabled={!isConnected || !affordable || isCrafting}
                className="w-full py-2 rounded font-bold tracking-wider text-sm font-serif transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-[#c8a44e]/10 border border-[#c8a44e]/40 text-[#c8a44e] hover:bg-[#c8a44e]/20"
              >
                {isCrafting ? "CRAFTING..." : "CRAFT"}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="text-[#ff3344] text-sm text-center">{error}</div>
      )}

      <div className="text-center">
        <Link href="/" className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add FORGE link to Navbar**

In `frontend/src/components/Navbar.tsx`, add a link after "HOW TO PLAY":

```tsx
<Link href="/craft" className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors tracking-wider">
  FORGE
</Link>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/craft/page.tsx frontend/src/components/Navbar.tsx
git commit -m "feat: add crafting page with ability cards and FORGE navbar link"
```

---

## Task 6: Update Contract Address + Test

**Files:**
- Modify: `frontend/src/lib/craftingContracts.ts`

- [ ] **Step 1: Update crafting contract address**

After Task 3 deployment, update the `CRAFTING_1V1_ADDRESS` in `craftingContracts.ts` with the actual deployed address.

- [ ] **Step 2: Add env var to `.env.local`**

```
NEXT_PUBLIC_CRAFTING_1V1_ADDRESS=0x<actual_address>
```

- [ ] **Step 3: Test the crafting flow**

1. Connect wallet on `/craft`
2. Verify resource balances show correctly
3. Click CRAFT on an ability you can afford
4. Approve the Cartridge signing prompt
5. Verify resources decreased and inventory incremented

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/craftingContracts.ts
git commit -m "feat: update crafting contract address after deployment"
```

---

## Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add abilities section**

After the "Resource Tokens" section, add:

```markdown
### Abilities

5 craftable abilities, burned from ERC-20 resources:

| Ability | Cost | Effect |
|---------|------|--------|
| Siege Sword | 3 Iron + 2 Wood | Max damage (10) to one gate |
| Stone Cloak | 3 Stone + 2 Linen | Block all gate damage |
| Ember Blast | 3 Ember + 2 Seeds | 5 direct damage bypassing gates |
| Hex | 2 Iron + 2 Stone + 1 Ember | Opponent budget -7 |
| Fortify | 2 Stone + 2 Linen + 1 Wood | Double all defense |

Crafting page at `/craft`. Players approve ERC-20 tokens then call `craft_ability(id)` on the `crafting_1v1` contract.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add abilities section to CLAUDE.md"
```
