import type { RoundMoves, NodeState } from "./state.js";

export interface AttackerMove {
  p0: number; p1: number; p2: number;
  nc0: number; nc1: number; nc2: number;
}

export interface DefenderMove {
  g0: number; g1: number; g2: number;
  repair: number;
  nc0: number; nc1: number; nc2: number;
}

function findDefenseWeakness(history: RoundMoves[], isTeamA: boolean): [number, number, number] {
  if (history.length === 0) return [1, 1, 1];
  const totals = [0, 0, 0];
  for (const rm of history) {
    if (isTeamA) {
      totals[0] += rm.defBG0; totals[1] += rm.defBG1; totals[2] += rm.defBG2;
    } else {
      totals[0] += rm.defAG0; totals[1] += rm.defAG1; totals[2] += rm.defAG2;
    }
  }
  const max = Math.max(...totals, 1);
  return [max - totals[0] + 1, max - totals[1] + 1, max - totals[2] + 1];
}

function findAttackThreat(history: RoundMoves[], isTeamA: boolean): [number, number, number] {
  if (history.length === 0) return [1, 1, 1];
  const totals = [0, 0, 0];
  for (const rm of history) {
    if (isTeamA) {
      totals[0] += rm.atkBP0; totals[1] += rm.atkBP1; totals[2] += rm.atkBP2;
    } else {
      totals[0] += rm.atkAP0; totals[1] += rm.atkAP1; totals[2] += rm.atkAP2;
    }
  }
  const sum = totals[0] + totals[1] + totals[2];
  if (sum === 0) return [1, 1, 1];
  return [totals[0] + 1, totals[1] + 1, totals[2] + 1];
}

function distribute(budget: number, weights: [number, number, number]): [number, number, number] {
  const total = weights[0] + weights[1] + weights[2];
  const raw = weights.map(w => (w / total) * budget);
  const floored: [number, number, number] = [Math.floor(raw[0]), Math.floor(raw[1]), Math.floor(raw[2])];
  let remainder = budget - floored[0] - floored[1] - floored[2];
  const fracs = raw.map((r, i) => ({ i, frac: r - Math.floor(r) }));
  fracs.sort((a, b) => b.frac - a.frac);
  for (const f of fracs) {
    if (remainder <= 0) break;
    floored[f.i]++;
    remainder--;
  }
  return floored;
}

function allocateNodes(budget: number, nodes: NodeState[], isTeamA: boolean): [number, number, number] {
  if (budget <= 0) return [0, 0, 0];
  const myTeam = isTeamA ? "TeamA" : "TeamB";
  const priorities: number[] = nodes.map(n => {
    if (n.owner === "None") return 2;
    if (n.owner !== myTeam) return 3;
    return 0;
  });
  const totalPrio = priorities.reduce((a: number, b: number) => a + b, 0);
  if (totalPrio === 0) return [0, 0, 0];
  return distribute(budget, [priorities[0] || 0.1, priorities[1] || 0.1, priorities[2] || 0.1]);
}

export function planAttack(budget: number, history: RoundMoves[], nodes: NodeState[], isTeamA: boolean): AttackerMove {
  const nodeAlloc = Math.min(3, Math.floor(budget * 0.2));
  const attackAlloc = budget - nodeAlloc;
  const weakness = findDefenseWeakness(history, isTeamA);
  const [p0, p1, p2] = distribute(attackAlloc, weakness);
  const [nc0, nc1, nc2] = allocateNodes(nodeAlloc, nodes, isTeamA);
  return { p0, p1, p2, nc0, nc1, nc2 };
}

export function planDefense(budget: number, vaultHp: number, history: RoundMoves[], nodes: NodeState[], isTeamA: boolean): DefenderMove {
  const repair = Math.min(3, Math.max(0, Math.floor((100 - vaultHp) / 20)));
  const remaining = budget - repair;
  const nodeAlloc = Math.min(2, Math.floor(remaining * 0.15));
  const garrisonAlloc = remaining - nodeAlloc;
  const threat = findAttackThreat(history, isTeamA);
  const [g0, g1, g2] = distribute(garrisonAlloc, threat);
  const [nc0, nc1, nc2] = allocateNodes(nodeAlloc, nodes, isTeamA);
  return { g0, g1, g2, repair, nc0, nc1, nc2 };
}
