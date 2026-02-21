# Sepolia Migration Summary

Updated: 2026-02-21

## What We Updated

### Frontend and client wiring
- Aligned frontend contract calls with on-chain ABI in `frontend/src/lib/contracts.ts`.
- Removed non-existent `join_match` flow and policy.
- Updated create/open match UX in:
  - `frontend/src/app/match/create/page.tsx`
  - `frontend/src/app/match/join/page.tsx`
  - `frontend/src/app/page.tsx`
  - `frontend/src/app/providers.tsx`
- Reworked Torii queries to use Dojo model names (`siegeDojo*`) and derive game phase/budgets/history in `frontend/src/lib/gameState.ts`.
- Fixed hook dependency warnings in `frontend/src/app/match/[id]/page.tsx`.

### Dojo project dependency upgrade
- Upgraded Dojo dependencies from `v1.7.1` to `v1.8.0` in `Scarb.toml`.
- `Scarb.lock` updated accordingly.

## Validation We Ran

### Frontend
- `npm run lint` (frontend): pass.
- `npx tsc --noEmit` (frontend): pass.
- `npm run build` (frontend): blocked in sandbox due Google Fonts fetch (`next/font` network access), not code type errors.

### Contracts (Docker)
- `sozo build`: pass after Dojo upgrade.
- `sozo test`: pass (18/18 tests).

## Deployment Attempts and Outcomes

1. **Base toolchain (sozo 1.7.1 / scarb 2.13.1), before and after Dojo dep upgrade**
- Command: `sozo migrate --profile sepolia`
- Outcome: fails in class declaration phase with CASM/class hash mismatch.
- Typical error: `Mismatch compiled class hash ... Actual ... Expected ...`

2. **Upgraded CLI image (sozo 1.8.0) from installer, non-builder base**
- Initial outcome: failed running `scarb metadata` due missing runtime deps (`cargo fetch` path ended with exit 127).
- Resolved by switching to builder-based image that includes Rust/Cargo.

3. **Builder-based upgraded CLI (sozo 1.8.0 / scarb 2.13.1) without explicit world override**
- Command: `sozo migrate --profile sepolia -vv`
- Outcome: attempted fresh world deploy at deterministic address and failed in world constructor.
- Error: `Failed to deserialize param #1` (constructor selector path).

4. **Builder-based upgraded CLI with explicit existing world**
- Command: `sozo migrate --profile sepolia --world 0x064292... -vv`
- Outcome: bypassed constructor path but returned to class declaration CASM mismatch.

## Toolchain Images Built Locally
- `siege-dojo-builder:latest`
- `siege-dojo-toolchain:1.8.0`
- `siege-dojo-toolchain:1.8.0-full`
- `siege-dojo-toolchain:1.8.0-builder`

## Current Blocker
- Sepolia class declaration still fails due compiled class hash mismatch under `scarb 2.13.1` (across sozo 1.7.1 and 1.8.0 migration paths).
- Upgrading to sozo 1.8.0 changed behavior (constructor path), but with existing world override the CASM mismatch persists.

## Current Working Tree (relevant)
- `Scarb.toml` and `Scarb.lock` modified for Dojo `v1.8.0`.
- Frontend files modified for ABI/query correctness and UX cleanup:
  - `frontend/src/app/match/[id]/page.tsx`
  - `frontend/src/app/match/create/page.tsx`
  - `frontend/src/app/match/join/page.tsx`
  - `frontend/src/app/page.tsx`
  - `frontend/src/app/providers.tsx`
  - `frontend/src/lib/contracts.ts`
  - `frontend/src/lib/gameState.ts`

## Recommended Next Attempt
- Test with a newer Scarb/Cairo compiler than `2.13.1` in Docker (while keeping the project/tooling coherent), then rerun `sozo migrate --profile sepolia --world 0x064292...`.
