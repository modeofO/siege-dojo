import { describe, test, expect } from "vitest";
import { generateSalt, computeAttackerCommitment, computeDefenderCommitment } from "../crypto";

describe("generateSalt", () => {
  test("returns hex string starting with 0x", () => {
    const salt = generateSalt();
    expect(salt).toMatch(/^0x[0-9a-f]+$/);
  });

  test("is 31 bytes (62 hex chars + 0x prefix)", () => {
    const salt = generateSalt();
    expect(salt.length).toBe(64); // "0x" + 62 hex chars
  });

  test("generates unique salts", () => {
    const salts = new Set(Array.from({ length: 10 }, () => generateSalt()));
    expect(salts.size).toBe(10);
  });
});

describe("computeAttackerCommitment", () => {
  test("returns a hex string", () => {
    const commitment = computeAttackerCommitment("0xaaa", 5, 3, 2, 0, 0, 0);
    expect(commitment).toMatch(/^0x[0-9a-f]+$/);
  });

  test("same inputs produce same hash", () => {
    const a = computeAttackerCommitment("0xaaa", 5, 3, 2, 0, 0, 0);
    const b = computeAttackerCommitment("0xaaa", 5, 3, 2, 0, 0, 0);
    expect(a).toBe(b);
  });

  test("different salt produces different hash", () => {
    const a = computeAttackerCommitment("0xaaa", 5, 3, 2, 0, 0, 0);
    const b = computeAttackerCommitment("0xbbb", 5, 3, 2, 0, 0, 0);
    expect(a).not.toBe(b);
  });

  test("different moves produce different hash", () => {
    const a = computeAttackerCommitment("0xaaa", 5, 3, 2, 0, 0, 0);
    const b = computeAttackerCommitment("0xaaa", 2, 3, 5, 0, 0, 0);
    expect(a).not.toBe(b);
  });

  test("element order matters", () => {
    const a = computeAttackerCommitment("0xaaa", 1, 2, 3, 4, 5, 6);
    const b = computeAttackerCommitment("0xaaa", 6, 5, 4, 3, 2, 1);
    expect(a).not.toBe(b);
  });
});

describe("computeDefenderCommitment", () => {
  test("returns a hex string", () => {
    const commitment = computeDefenderCommitment("0xaaa", 3, 3, 2, 1, 1, 0, 0);
    expect(commitment).toMatch(/^0x[0-9a-f]+$/);
  });

  test("same inputs produce same hash", () => {
    const a = computeDefenderCommitment("0xaaa", 3, 3, 2, 1, 1, 0, 0);
    const b = computeDefenderCommitment("0xaaa", 3, 3, 2, 1, 1, 0, 0);
    expect(a).toBe(b);
  });

  test("different repair value produces different hash", () => {
    const a = computeDefenderCommitment("0xaaa", 3, 3, 2, 1, 1, 0, 0);
    const b = computeDefenderCommitment("0xaaa", 3, 3, 2, 3, 1, 0, 0);
    expect(a).not.toBe(b);
  });

  test("attacker and defender hashes differ for same inputs", () => {
    // Defender has 8 elements (includes repair), attacker has 7
    const atk = computeAttackerCommitment("0xaaa", 3, 3, 2, 1, 0, 0);
    const def = computeDefenderCommitment("0xaaa", 3, 3, 2, 1, 1, 0, 0);
    expect(atk).not.toBe(def);
  });
});
