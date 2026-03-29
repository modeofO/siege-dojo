# Sepolia Migration Summary

Updated: 2026-03-29

## Deployment Status: Live

Contracts successfully deployed to Starknet Sepolia on 2026-03-29, block 8188551.

## Contract Addresses

| Contract | Address |
|----------|---------|
| **World** | `0x07ba32eaaa2a25145ea713e17ad1f42dc7f9f08355a2fd058a9a875e609fa8c0` |
| **actions** | `0x06e730a23bd927ff424985dedef2cd84b7ce1bfbf1c3083411e150a297c114cc` |
| **commit_reveal** | `0x0435bfc2a56e3a4b3561b9936970e87db527b447bb30f47370dfb9d4964f6038` |
| **resolution** | `0x0558ea4d31edbc24293bf8468fb96a435a21ca24452e82da217b4168e03a0f71` |

## Deployer Account

- **Address:** `0x040a26c15f86b70cc384d042ce0d87283e801bb459f369c4f588be3070c37f95`
- **Account config:** `~/.config/.starkli/siege-dojo/deployer_account.json`
- **Env vars:** `DOJO_ACCOUNT_ADDRESS`, `DOJO_PRIVATE_KEY`

## Toolchain That Worked

| Component | Version |
|-----------|---------|
| sozo | **v1.8.6** |
| scarb | 2.13.1 |
| cairo | 2.13.1 |
| dojo deps | v1.8.0 |
| starkli | 0.4.2 |

## RPC Endpoints

| Spec Version | URL | Used By |
|-------------|-----|---------|
| v0.9.0 | `https://api.cartridge.gg/x/starknet/sepolia` | sozo (migrate, auth) |
| v0.8.1 | `https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8` | starkli (account deploy, balance) |
| v0.7.1 | `https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_7` | older tools only |

## What Was Blocking (Resolved)

Starknet v0.14.1 (Nov 2025) changed `compiled_class_hash` computation from Poseidon to **blake2s**. sozo v1.8.0 predated this change, causing CASM hash mismatches on every DECLARE transaction.

**Fix:** sozo v1.8.1+ auto-detects blake2s when the RPC URL contains `"sepolia"`, `"testnet"`, or `"mainnet"`. Upgrading from v1.8.0 to v1.8.6 resolved the issue immediately.

## Migration Commands (For Reference)

```bash
export DOJO_ACCOUNT_ADDRESS="0x040a26c15f86b70cc384d042ce0d87283e801bb459f369c4f588be3070c37f95"
export DOJO_PRIVATE_KEY="0x..."

# Build
sozo build -P sepolia

# Deploy world + register all contracts, models, events
sozo -P sepolia migrate

# Grant writer permissions
sozo -P sepolia auth grant writer \
  siege_dojo,siege_dojo-actions \
  siege_dojo,siege_dojo-commit_reveal \
  siege_dojo,siege_dojo-resolution
```

## Still Needed

- **Torii indexer on Sepolia** — needed for frontend and MCP server to read game state
- **Cartridge Controller integration** — wallet connection + session policies for Sepolia gameplay
- **Frontend Sepolia mode** — env-driven toggle (devnet vs Sepolia)
- **AI agent end-to-end on Sepolia** — MCP servers pointing at live contracts
