import { useEffect, useState, useCallback } from "react";

// Types matching on-chain models
export interface MatchState {
  matchId: string;
  round: number;
  phase: "committing" | "revealing" | "resolving" | "finished";
  team1Vault: number;
  team2Vault: number;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
  team1Budget: number;
  team2Budget: number;
  winner: number | null; // 0 = none, 1 = team1, 2 = team2
}

export type NodeOwner = "neutral" | "team1" | "team2";

export interface CommitStatus {
  team1Player1: boolean;
  team1Player2: boolean;
  team2Player1: boolean;
  team2Player2: boolean;
}

export interface RoundResult {
  round: number;
  team1Attack: number[] | null;
  team1Defense: number[] | null;
  team2Attack: number[] | null;
  team2Defense: number[] | null;
  damageToTeam1: number;
  damageToTeam2: number;
}

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
const POLL_INTERVAL = 4000;

async function fetchMatchState(matchId: string): Promise<MatchState | null> {
  try {
    const res = await fetch(`${TORII_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query GetMatch($id: String!) {
            siegeMatchModels(where: { match_id: $id }) {
              edges {
                node {
                  match_id
                  round
                  phase
                  team1_vault_hp
                  team2_vault_hp
                  node_0_owner
                  node_1_owner
                  node_2_owner
                  team1_budget
                  team2_budget
                  winner
                }
              }
            }
          }
        `,
        variables: { id: matchId },
      }),
    });
    const data = await res.json();
    const node = data?.data?.siegeMatchModels?.edges?.[0]?.node;
    if (!node) return null;

    const parseOwner = (v: number): NodeOwner =>
      v === 0 ? "neutral" : v === 1 ? "team1" : "team2";

    return {
      matchId: node.match_id,
      round: node.round,
      phase: ["committing", "revealing", "resolving", "finished"][node.phase] as MatchState["phase"],
      team1Vault: node.team1_vault_hp,
      team2Vault: node.team2_vault_hp,
      nodes: [parseOwner(node.node_0_owner), parseOwner(node.node_1_owner), parseOwner(node.node_2_owner)],
      team1Budget: node.team1_budget,
      team2Budget: node.team2_budget,
      winner: node.winner || null,
    };
  } catch {
    console.error("Failed to fetch match state");
    return null;
  }
}

export function useMatchState(matchId: string | null) {
  const [state, setState] = useState<MatchState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!matchId) return;
    const s = await fetchMatchState(matchId);
    setState(s);
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  return { state, loading, refresh };
}

export interface MatchPlayers {
  teamAAttacker: string;
  teamADefender: string;
  teamBAttacker: string;
  teamBDefender: string;
}

export function useMatchPlayers(matchId: string | null): MatchPlayers | null {
  const [players, setPlayers] = useState<MatchPlayers | null>(null);

  useEffect(() => {
    if (!matchId) return;

    const fetchPlayers = async () => {
      try {
        const res = await fetch(`${TORII_URL}/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              query GetPlayers($id: String!) {
                siegeMatchStateModels(where: { match_id: $id }) {
                  edges {
                    node {
                      team_a_attacker
                      team_a_defender
                      team_b_attacker
                      team_b_defender
                    }
                  }
                }
              }
            `,
            variables: { id: matchId },
          }),
        });
        const data = await res.json();
        const node = data?.data?.siegeMatchStateModels?.edges?.[0]?.node;
        if (node) {
          setPlayers({
            teamAAttacker: node.team_a_attacker,
            teamADefender: node.team_a_defender,
            teamBAttacker: node.team_b_attacker,
            teamBDefender: node.team_b_defender,
          });
        }
      } catch {
        console.error("Failed to fetch match players");
      }
    };

    fetchPlayers();
    const interval = setInterval(fetchPlayers, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [matchId]);

  return players;
}

export function useRoundHistory(matchId: string | null) {
  const [history, setHistory] = useState<RoundResult[]>([]);

  useEffect(() => {
    if (!matchId) return;

    const fetchHistory = async () => {
      try {
        const res = await fetch(`${TORII_URL}/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              query GetRounds($id: String!) {
                siegeRoundResultModels(where: { match_id: $id }, order: { round: DESC }) {
                  edges {
                    node {
                      round
                      team1_atk_p0 team1_atk_p1 team1_atk_p2
                      team1_def_p0 team1_def_p1 team1_def_p2
                      team2_atk_p0 team2_atk_p1 team2_atk_p2
                      team2_def_p0 team2_def_p1 team2_def_p2
                      damage_to_team1 damage_to_team2
                    }
                  }
                }
              }
            `,
            variables: { id: matchId },
          }),
        });
        const data = await res.json();
        const edges = data?.data?.siegeRoundResultModels?.edges || [];
        setHistory(
          edges.map((e: { node: Record<string, number | null> }) => ({
            round: e.node.round,
            team1Attack: e.node.team1_atk_p0 != null ? [e.node.team1_atk_p0, e.node.team1_atk_p1, e.node.team1_atk_p2] : null,
            team1Defense: e.node.team1_def_p0 != null ? [e.node.team1_def_p0, e.node.team1_def_p1, e.node.team1_def_p2] : null,
            team2Attack: e.node.team2_atk_p0 != null ? [e.node.team2_atk_p0, e.node.team2_atk_p1, e.node.team2_atk_p2] : null,
            team2Defense: e.node.team2_def_p0 != null ? [e.node.team2_def_p0, e.node.team2_def_p1, e.node.team2_def_p2] : null,
            damageToTeam1: e.node.damage_to_team1 as number,
            damageToTeam2: e.node.damage_to_team2 as number,
          }))
        );
      } catch {
        console.error("Failed to fetch round history");
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [matchId]);

  return history;
}
