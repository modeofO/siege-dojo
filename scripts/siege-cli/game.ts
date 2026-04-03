import * as readline from "readline";
import type { MoveAllocation, MatchInfo, RoundMoves, NodeOwner } from "./chain.js";

let rl: readline.Interface | null = null;

function getRL(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    getRL().question(question, (answer) => resolve(answer.trim()));
  });
}

// --------------- Budget ---------------

export function computeBudget(nodes: [NodeOwner, NodeOwner, NodeOwner], isPlayerA: boolean): number {
  const team: NodeOwner = isPlayerA ? "teamA" : "teamB";
  const bonus = nodes.filter((n) => n === team).length;
  return 10 + bonus;
}

// --------------- Validation ---------------

export function validateMove(move: MoveAllocation, budget: number): string | null {
  const { attack, defense, repair, nodes } = move;

  // Check non-negative
  const allVals = [...attack, ...defense, repair, ...nodes];
  for (const v of allVals) {
    if (v < 0 || !Number.isInteger(v)) {
      return `All values must be non-negative integers. Got: ${v}`;
    }
  }

  // Check node contest values are 0 or 1
  for (const nc of nodes) {
    if (nc !== 0 && nc !== 1) {
      return `Node contest values must be 0 or 1. Got: ${nc}`;
    }
  }

  // Check total budget
  const total = allVals.reduce((a, b) => a + b, 0);
  if (total > budget) {
    return `Over budget: total ${total} > budget ${budget}`;
  }

  return null;
}

// --------------- JSON parsing ---------------

export function parseJsonMove(json: string): MoveAllocation | null {
  try {
    const obj = JSON.parse(json);
    if (
      !Array.isArray(obj.attack) || obj.attack.length !== 3 ||
      !Array.isArray(obj.defense) || obj.defense.length !== 3 ||
      typeof obj.repair !== "number" ||
      !Array.isArray(obj.nodes) || obj.nodes.length !== 3
    ) {
      return null;
    }
    return {
      attack: [obj.attack[0], obj.attack[1], obj.attack[2]],
      defense: [obj.defense[0], obj.defense[1], obj.defense[2]],
      repair: obj.repair,
      nodes: [obj.nodes[0], obj.nodes[1], obj.nodes[2]],
    };
  } catch {
    return null;
  }
}

// --------------- Interactive prompt ---------------

function parseTriple(input: string): [number, number, number] | null {
  const parts = input.split(/[\s,]+/).map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return [parts[0], parts[1], parts[2]] as [number, number, number];
}

export async function promptMove(budget: number): Promise<MoveAllocation> {
  console.log(`\nBudget: ${budget} points to allocate across attack, defense, repair, and nodes.\n`);

  while (true) {
    const atkInput = await ask("Attack (3 values, e.g. '3 2 1'): ");
    const attack = parseTriple(atkInput);
    if (!attack) {
      console.log("  Invalid. Enter 3 space-separated integers.");
      continue;
    }

    const defInput = await ask("Defense (3 values, e.g. '2 2 1'): ");
    const defense = parseTriple(defInput);
    if (!defense) {
      console.log("  Invalid. Enter 3 space-separated integers.");
      continue;
    }

    const repairInput = await ask("Repair (1 value, e.g. '1'): ");
    const repair = Number(repairInput);
    if (isNaN(repair) || repair < 0 || !Number.isInteger(repair)) {
      console.log("  Invalid. Enter a non-negative integer.");
      continue;
    }

    const nodesInput = await ask("Nodes (3 values, 0 or 1, e.g. '1 0 1'): ");
    const nodes = parseTriple(nodesInput);
    if (!nodes) {
      console.log("  Invalid. Enter 3 space-separated values (0 or 1).");
      continue;
    }

    const move: MoveAllocation = { attack, defense, repair, nodes };
    const err = validateMove(move, budget);
    if (err) {
      console.log(`  ${err}. Try again.`);
      continue;
    }

    return move;
  }
}

// --------------- Display ---------------

export function displayMatchStatus(info: MatchInfo, isPlayerA: boolean): void {
  const role = isPlayerA ? "Player A" : "Player B";
  const myVault = isPlayerA ? info.vaultAHp : info.vaultBHp;
  const theirVault = isPlayerA ? info.vaultBHp : info.vaultAHp;
  const budget = computeBudget(info.nodes, isPlayerA);

  console.log("\n========================================");
  console.log(`  Match #${info.matchId}  |  Round ${info.currentRound}  |  ${info.status}`);
  console.log(`  You are: ${role}`);
  console.log(`  Your vault: ${myVault} HP  |  Their vault: ${theirVault} HP`);
  console.log(
    `  Nodes: ${info.nodes.map((n, i) => `[${i}] ${n}`).join("  ")}`
  );
  console.log(`  Budget: ${budget}`);
  console.log("========================================\n");
}

export function displayRoundResults(
  myMove: MoveAllocation,
  theirAttack: [number, number, number],
  theirDefense: [number, number, number],
  newInfo: MatchInfo,
  isPlayerA: boolean,
): void {
  // Damage I dealt = max(0, myAtk[i] - theirDef[i]) for each gate
  const dmgDealt =
    Math.max(0, myMove.attack[0] - theirDefense[0]) +
    Math.max(0, myMove.attack[1] - theirDefense[1]) +
    Math.max(0, myMove.attack[2] - theirDefense[2]);

  // Damage I took = max(0, theirAtk[i] - myDef[i]) for each gate
  const dmgTaken =
    Math.max(0, theirAttack[0] - myMove.defense[0]) +
    Math.max(0, theirAttack[1] - myMove.defense[1]) +
    Math.max(0, theirAttack[2] - myMove.defense[2]);

  const myVault = isPlayerA ? newInfo.vaultAHp : newInfo.vaultBHp;
  const theirVault = isPlayerA ? newInfo.vaultBHp : newInfo.vaultAHp;

  console.log("\n--- Round Results ---");
  console.log(`  Your attack: [${myMove.attack.join(", ")}] vs their defense: [${theirDefense.join(", ")}]`);
  console.log(`  Damage dealt: ${dmgDealt}`);
  console.log(`  Their attack: [${theirAttack.join(", ")}] vs your defense: [${myMove.defense.join(", ")}]`);
  console.log(`  Damage taken: ${dmgTaken}`);
  console.log(`  Your vault: ${myVault} HP  |  Their vault: ${theirVault} HP`);
  console.log(
    `  Nodes: ${newInfo.nodes.map((n, i) => `[${i}] ${n}`).join("  ")}`
  );

  if (newInfo.status === "Finished") {
    if (myVault > 0 && theirVault <= 0) {
      console.log("\n  *** YOU WIN! ***");
    } else if (theirVault > 0 && myVault <= 0) {
      console.log("\n  *** YOU LOSE ***");
    } else {
      console.log("\n  *** DRAW ***");
    }
  }
  console.log("---------------------\n");
}

// --------------- Cleanup ---------------

export function closePrompt(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
}
