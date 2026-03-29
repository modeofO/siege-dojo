import { describe, test, expect } from "vitest";
import { toNum, parseMatchId, ownerToNode, computeBudget, computeDamage } from "../gameState";
import type { NodeOwner } from "../gameState";

describe("toNum", () => {
  test("returns number as-is", () => {
    expect(toNum(42)).toBe(42);
  });

  test("converts numeric string", () => {
    expect(toNum("100")).toBe(100);
  });

  test("converts hex string", () => {
    expect(toNum("0x64")).toBe(100);
  });

  test("returns 0 for null", () => {
    expect(toNum(null)).toBe(0);
  });

  test("returns 0 for undefined", () => {
    expect(toNum(undefined)).toBe(0);
  });

  test("returns 0 for zero", () => {
    expect(toNum(0)).toBe(0);
  });
});

describe("parseMatchId", () => {
  test("parses positive integer string", () => {
    expect(parseMatchId("3")).toBe(3);
  });

  test("parses zero", () => {
    expect(parseMatchId("0")).toBe(0);
  });

  test("returns null for negative", () => {
    expect(parseMatchId("-1")).toBeNull();
  });

  test("returns null for float", () => {
    expect(parseMatchId("1.5")).toBeNull();
  });

  test("returns null for non-numeric", () => {
    expect(parseMatchId("abc")).toBeNull();
  });

  test("treats empty string as 0", () => {
    expect(parseMatchId("")).toBe(0);
  });
});

describe("ownerToNode", () => {
  test("maps TeamA to team1", () => {
    expect(ownerToNode("TeamA")).toBe("team1");
  });

  test("maps TeamB to team2", () => {
    expect(ownerToNode("TeamB")).toBe("team2");
  });

  test("maps None to neutral", () => {
    expect(ownerToNode("None")).toBe("neutral");
  });

  test("maps unknown string to neutral", () => {
    expect(ownerToNode("anything")).toBe("neutral");
  });
});

describe("computeBudget", () => {
  test("base budget is 10 with no nodes", () => {
    const nodes: NodeOwner[] = ["neutral", "neutral", "neutral"];
    expect(computeBudget(nodes, "team1")).toBe(10);
  });

  test("adds 1 per controlled node", () => {
    const nodes: NodeOwner[] = ["team1", "neutral", "team1"];
    expect(computeBudget(nodes, "team1")).toBe(12);
  });

  test("all 3 nodes gives budget 13", () => {
    const nodes: NodeOwner[] = ["team1", "team1", "team1"];
    expect(computeBudget(nodes, "team1")).toBe(13);
  });

  test("enemy nodes do not count", () => {
    const nodes: NodeOwner[] = ["team2", "team2", "team2"];
    expect(computeBudget(nodes, "team1")).toBe(10);
  });

  test("works for team2", () => {
    const nodes: NodeOwner[] = ["team2", "neutral", "team2"];
    expect(computeBudget(nodes, "team2")).toBe(12);
  });
});

describe("computeDamage", () => {
  test("excess attack power becomes damage", () => {
    // atk [5,3,2] vs def [3,3,2] = max(0,2)+max(0,0)+max(0,0) = 2
    expect(computeDamage(5, 3, 2, 3, 3, 2)).toBe(2);
  });

  test("defense higher than attack means zero at that gate", () => {
    // atk [2,2,3] vs def [3,3,4] = 0+0+0 = 0
    expect(computeDamage(2, 2, 3, 3, 3, 4)).toBe(0);
  });

  test("all attack exceeds defense", () => {
    // atk [5,5,5] vs def [1,1,1] = 4+4+4 = 12
    expect(computeDamage(5, 5, 5, 1, 1, 1)).toBe(12);
  });

  test("zero attack means zero damage", () => {
    expect(computeDamage(0, 0, 0, 3, 3, 3)).toBe(0);
  });

  test("zero defense means full damage", () => {
    expect(computeDamage(4, 3, 3, 0, 0, 0)).toBe(10);
  });

  test("mixed results across gates", () => {
    // atk [5,1,3] vs def [2,4,3] = 3+0+0 = 3
    expect(computeDamage(5, 1, 3, 2, 4, 3)).toBe(3);
  });
});
