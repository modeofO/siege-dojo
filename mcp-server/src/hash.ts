/**
 * Poseidon hashing for Siege commit/reveal.
 * Must match the Cairo contract exactly.
 *
 * Cairo does:
 *   PoseidonTrait::new().update(salt).update(p0.into()).update(p1.into())...finalize()
 *
 * starknet.js hash.computePoseidonHashOnElements does the same chain.
 */

import { hash } from "starknet";
import { randomBytes } from "node:crypto";

/**
 * Generate a random salt as a felt252-compatible hex string (251 bits).
 */
export function generateSalt(): string {
  const raw = BigInt(`0x${randomBytes(32).toString("hex")}`);
  return `0x${BigInt.asUintN(251, raw).toString(16)}`;
}

/**
 * Build Poseidon hash for attacker commit.
 * Matches: hash(salt, p0, p1, p2, nc0, nc1, nc2)
 */
export function buildAttackerCommitHash(
  salt: string,
  pressurePoints: [number, number, number],
  nodeContest: [number, number, number]
): string {
  const elements = [
    BigInt(salt),
    BigInt(pressurePoints[0]),
    BigInt(pressurePoints[1]),
    BigInt(pressurePoints[2]),
    BigInt(nodeContest[0]),
    BigInt(nodeContest[1]),
    BigInt(nodeContest[2]),
  ];
  return hash.computePoseidonHashOnElements(elements);
}

/**
 * Build Poseidon hash for defender commit.
 * Matches: hash(salt, g0, g1, g2, repair, nc0, nc1, nc2)
 */
export function buildDefenderCommitHash(
  salt: string,
  garrison: [number, number, number],
  repair: number,
  nodeContest: [number, number, number]
): string {
  const elements = [
    BigInt(salt),
    BigInt(garrison[0]),
    BigInt(garrison[1]),
    BigInt(garrison[2]),
    BigInt(repair),
    BigInt(nodeContest[0]),
    BigInt(nodeContest[1]),
    BigInt(nodeContest[2]),
  ];
  return hash.computePoseidonHashOnElements(elements);
}
