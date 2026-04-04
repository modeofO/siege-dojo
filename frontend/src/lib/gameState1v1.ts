// frontend/src/lib/gameState1v1.ts
import { useEffect, useState, useCallback } from "react";

export type NodeOwner = "neutral" | "teamA" | "teamB";

export interface MatchState1v1 {
  matchId: string;
  playerA: string;
  playerB: string;
  round: number;
  phase: "committing" | "revealing" | "resolving" | "finished";
  vaultAHp: number;
  vaultBHp: number;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
  budgetA: number;
  budgetB: number;
  winner: number | null;
}

export interface RoundResult1v1 {
  round: number;
  aAttack: number[];
  aDefense: number[];
  bAttack: number[];
  bDefense: number[];
  damageToA: number;
  damageToB: number;
}

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
const POLL_INTERVAL = 4000;

type GraphEdges<T> = { edges: Array<{ node: T }> };

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

function ownerToNode(owner: string): NodeOwner {
  if (owner === "TeamA") return "teamA";
  if (owner === "TeamB") return "teamB";
  return "neutral";
}

function computeBudget(nodes: NodeOwner[], team: "teamA" | "teamB"): number {
  return 10 + nodes.filter((n) => n === team).length;
}

function computeDamage(atk: number[], def: number[]): number {
  return atk.reduce((sum, a, i) => sum + Math.max(0, a - def[i]), 0);
}

async function toriiQuery<T>(query: string): Promise<T | null> {
  try {
    const res = await fetch(`${TORII_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.errors) return null;
    return (data?.data as T) || null;
  } catch {
    return null;
  }
}

async function fetchMatchState1v1(matchId: string): Promise<MatchState1v1 | null> {
  const id = Number(matchId);
  if (!Number.isInteger(id) || id < 0) return null;

  const data = await toriiQuery<{
    siegeDojoMatchState1V1Models: GraphEdges<{
      match_id: string; player_a: string; player_b: string;
      vault_a_hp: string; vault_b_hp: string;
      current_round: string; status: string;
    }>;
    siegeDojoNodeStateModels: GraphEdges<{
      node_index: string; owner: string;
    }>;
  }>(`
    query {
      siegeDojoMatchState1V1Models(where: { match_id: "${id}" }) {
        edges { node { match_id player_a player_b vault_a_hp vault_b_hp current_round status } }
      }
      siegeDojoNodeStateModels(where: { match_id: "${id}" }) {
        edges { node { node_index owner } }
      }
    }
  `);

  const m = data?.siegeDojoMatchState1V1Models?.edges?.[0]?.node;
  if (!m) return null;

  const round = toNum(m.current_round);
  const vaultAHp = toNum(m.vault_a_hp);
  const vaultBHp = toNum(m.vault_b_hp);

  const nodes: [NodeOwner, NodeOwner, NodeOwner] = ["neutral", "neutral", "neutral"];
  for (const edge of data?.siegeDojoNodeStateModels?.edges || []) {
    const idx = toNum(edge.node.node_index);
    if (idx >= 0 && idx < 3) nodes[idx] = ownerToNode(edge.node.owner);
  }

  let phase: MatchState1v1["phase"] = "committing";
  if (m.status === "Finished") {
    phase = "finished";
  } else {
    const roundData = await toriiQuery<{
      siegeDojoRoundMoves1V1Models: GraphEdges<{
        commit_count: string; reveal_count: string;
      }>;
    }>(`
      query {
        siegeDojoRoundMoves1V1Models(where: { match_id: "${id}", round: ${round} }) {
          edges { node { commit_count reveal_count } }
        }
      }
    `);
    const rn = roundData?.siegeDojoRoundMoves1V1Models?.edges?.[0]?.node;
    if (rn) {
      const cc = toNum(rn.commit_count);
      const rc = toNum(rn.reveal_count);
      if (cc >= 2) {
        phase = rc >= 2 ? "resolving" : "revealing";
      }
    }
  }

  let winner: number | null = null;
  if (m.status === "Finished") {
    if (vaultAHp === 0 && vaultBHp > 0) winner = 2;
    else if (vaultBHp === 0 && vaultAHp > 0) winner = 1;
    else if (vaultAHp > vaultBHp) winner = 1;
    else if (vaultBHp > vaultAHp) winner = 2;
    else winner = 0; // draw
  }

  return {
    matchId: String(m.match_id),
    playerA: m.player_a,
    playerB: m.player_b,
    round,
    phase,
    vaultAHp,
    vaultBHp,
    nodes,
    budgetA: computeBudget(nodes, "teamA"),
    budgetB: computeBudget(nodes, "teamB"),
    winner,
  };
}

export function useMatchState1v1(matchId: string | null) {
  const [state, setState] = useState<MatchState1v1 | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!matchId) return;
    const s = await fetchMatchState1v1(matchId);
    setState(s);
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    const t = setTimeout(() => { void refresh(); }, 0);
    const i = setInterval(() => { void refresh(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [refresh]);

  return { state, loading, refresh };
}

export function useRoundStatus1v1(matchId: string | null, round: number) {
  const [status, setStatus] = useState({ commitCount: 0, revealCount: 0 });

  useEffect(() => {
    if (!matchId) return;
    const id = Number(matchId);

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoRoundMoves1V1Models: GraphEdges<{
          commit_count: string; reveal_count: string;
        }>;
      }>(`
        query {
          siegeDojoRoundMoves1V1Models(where: { match_id: "${id}", round: ${round} }) {
            edges { node { commit_count reveal_count } }
          }
        }
      `);
      const node = data?.siegeDojoRoundMoves1V1Models?.edges?.[0]?.node;
      if (node) {
        setStatus({
          commitCount: toNum(node.commit_count),
          revealCount: toNum(node.reveal_count),
        });
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [matchId, round]);

  return status;
}

export function useCommitmentStatus1v1(
  matchId: string | null,
  round: number,
  role: 0 | 1,
) {
  const [status, setStatus] = useState({ committed: false, revealed: false });

  useEffect(() => {
    if (!matchId) return;
    const id = Number(matchId);

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoCommitmentModels: GraphEdges<{ committed: boolean; revealed: boolean }>;
      }>(`
        query {
          siegeDojoCommitmentModels(where: { match_id: "${id}", round: ${round}, role: ${role} }) {
            edges { node { committed revealed } }
          }
        }
      `);
      const node = data?.siegeDojoCommitmentModels?.edges?.[0]?.node;
      if (node) {
        setStatus({ committed: node.committed, revealed: node.revealed });
      } else {
        setStatus({ committed: false, revealed: false });
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [matchId, round, role]);

  return status;
}

export function useRoundHistory1v1(matchId: string | null) {
  const [history, setHistory] = useState<RoundResult1v1[]>([]);

  useEffect(() => {
    if (!matchId) return;
    const id = Number(matchId);

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoRoundMoves1V1Models: GraphEdges<{
          round: string; reveal_count: string;
          a_p0: string; a_p1: string; a_p2: string;
          a_g0: string; a_g1: string; a_g2: string;
          b_p0: string; b_p1: string; b_p2: string;
          b_g0: string; b_g1: string; b_g2: string;
        }>;
      }>(`
        query {
          siegeDojoRoundMoves1V1Models(where: { match_id: "${id}" }) {
            edges { node { round reveal_count a_p0 a_p1 a_p2 a_g0 a_g1 a_g2 b_p0 b_p1 b_p2 b_g0 b_g1 b_g2 } }
          }
        }
      `);

      const results = (data?.siegeDojoRoundMoves1V1Models?.edges || [])
        .map((e) => e.node)
        .filter((n) => toNum(n.reveal_count) >= 2)
        .sort((a, b) => toNum(b.round) - toNum(a.round))
        .slice(0, 10)
        .map((n): RoundResult1v1 => {
          const aAtk = [toNum(n.a_p0), toNum(n.a_p1), toNum(n.a_p2)];
          const aDef = [toNum(n.a_g0), toNum(n.a_g1), toNum(n.a_g2)];
          const bAtk = [toNum(n.b_p0), toNum(n.b_p1), toNum(n.b_p2)];
          const bDef = [toNum(n.b_g0), toNum(n.b_g1), toNum(n.b_g2)];
          return {
            round: toNum(n.round),
            aAttack: aAtk,
            aDefense: aDef,
            bAttack: bAtk,
            bDefense: bDef,
            damageToA: computeDamage(bAtk, aDef),
            damageToB: computeDamage(aAtk, bDef),
          };
        });

      setHistory(results);
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [matchId]);

  return history;
}

export const MODIFIER_NAMES: Record<number, string> = {
  0: "Normal",
  1: "Narrow Pass",
  2: "Mirror Gate",
  3: "Deadlock",
  4: "Overflow",
};

export const MODIFIER_DESCRIPTIONS: Record<number, string> = {
  0: "",
  1: "Attack and defense capped at 3",
  2: "Attack and defense values swap",
  3: "No damage dealt at this gate",
  4: "Unblocked damage splits to other gates",
};

export function useRoundModifiers1v1(matchId: string | null, round: number) {
  const [modifiers, setModifiers] = useState<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    if (!matchId) return;
    const id = Number(matchId);

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoRoundModifiers1V1Models: GraphEdges<{
          gate_0: string; gate_1: string; gate_2: string;
        }>;
      }>(`
        query {
          siegeDojoRoundModifiers1V1Models(where: { match_id: "${id}", round: ${round} }) {
            edges { node { gate_0 gate_1 gate_2 } }
          }
        }
      `);
      const node = data?.siegeDojoRoundModifiers1V1Models?.edges?.[0]?.node;
      if (node) {
        setModifiers([toNum(node.gate_0), toNum(node.gate_1), toNum(node.gate_2)]);
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [matchId, round]);

  return modifiers;
}
