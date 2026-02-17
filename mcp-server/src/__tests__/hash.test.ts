/**
 * Verify Poseidon hash output matches Cairo contract behavior.
 *
 * The Cairo contract computes:
 *   PoseidonTrait::new().update(salt).update(p0).update(p1)...finalize()
 *
 * starknet.js computePoseidonHashOnElements does the same chain:
 *   init state, update each element, finalize.
 *
 * Run: npx tsx src/__tests__/hash.test.ts
 */

import { hash } from "starknet";
import { buildAttackerCommitHash, buildDefenderCommitHash } from "../hash.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

// ── Test 1: Known attacker hash ──────────────────────────────────────
console.log("Test 1: Attacker commit hash");
{
  const salt = "0x1234";
  const pp: [number, number, number] = [3, 2, 1];
  const nc: [number, number, number] = [1, 1, 1];

  const result = buildAttackerCommitHash(salt, pp, nc);

  // Compute manually with starknet.js
  const expected = hash.computePoseidonHashOnElements([
    BigInt("0x1234"),
    3n, 2n, 1n, // pressure points
    1n, 1n, 1n, // node contest
  ]);

  assert(result === expected, `Attacker hash matches: ${result}`);
  assert(typeof result === "string", "Returns hex string");
  assert(result.startsWith("0x"), "Starts with 0x");
}

// ── Test 2: Known defender hash ──────────────────────────────────────
console.log("Test 2: Defender commit hash");
{
  const salt = "0xabcdef";
  const g: [number, number, number] = [2, 3, 1];
  const repair = 2;
  const nc: [number, number, number] = [1, 0, 1];

  const result = buildDefenderCommitHash(salt, g, repair, nc);

  const expected = hash.computePoseidonHashOnElements([
    BigInt("0xabcdef"),
    2n, 3n, 1n, // garrison
    2n,          // repair
    1n, 0n, 1n, // node contest
  ]);

  assert(result === expected, `Defender hash matches: ${result}`);
}

// ── Test 3: Different salt → different hash ──────────────────────────
console.log("Test 3: Different salts produce different hashes");
{
  const pp: [number, number, number] = [3, 2, 1];
  const nc: [number, number, number] = [1, 1, 1];
  const h1 = buildAttackerCommitHash("0x1", pp, nc);
  const h2 = buildAttackerCommitHash("0x2", pp, nc);
  assert(h1 !== h2, "Different salts produce different hashes");
}

// ── Test 4: Zero allocations ─────────────────────────────────────────
console.log("Test 4: Zero allocations");
{
  const salt = "0x999";
  const result = buildAttackerCommitHash(salt, [0, 0, 0], [0, 0, 0]);
  const expected = hash.computePoseidonHashOnElements([
    BigInt("0x999"), 0n, 0n, 0n, 0n, 0n, 0n,
  ]);
  assert(result === expected, "Zero allocations hash matches");
}

// ── Test 5: Element ordering matters ─────────────────────────────────
console.log("Test 5: Element ordering matters");
{
  const salt = "0x42";
  const h1 = buildAttackerCommitHash(salt, [5, 0, 0], [0, 0, 0]);
  const h2 = buildAttackerCommitHash(salt, [0, 5, 0], [0, 0, 0]);
  assert(h1 !== h2, "Different allocations produce different hashes");
}

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
