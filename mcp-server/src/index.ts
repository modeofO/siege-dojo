#!/usr/bin/env node

/**
 * Siege Dojo MCP Server
 *
 * Exposes Siege game state and move-building tools via MCP.
 * Agents connect to this + starknet-agentic MCP for wallet ops.
 * This server never touches private keys.
 *
 * Tools:
 * - siege_get_match_state: Read current match state
 * - siege_get_round_history: Get past round moves
 * - siege_get_my_status: Check player's current status
 * - siege_build_commit: Build commitment hash + calldata
 * - siege_build_reveal_attacker: Build attacker reveal calldata
 * - siege_build_reveal_defender: Build defender reveal calldata
 *
 * Env vars:
 * - TORII_URL: Torii GraphQL endpoint (optional, preferred)
 * - STARKNET_RPC_URL: RPC endpoint for direct reads (required)
 * - WORLD_ADDRESS: Dojo world contract address (required)
 * - COMMIT_REVEAL_ADDRESS: commit_reveal system contract address (required)
 * - POLL_INTERVAL_MS: State polling interval in ms (default: 5000)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  queryMatchState,
  queryRoundMoves,
  queryNodeStates,
  queryCommitment,
  type MatchStateData,
  type RoundMovesData,
  type NodeStateData,
  type CommitmentData,
} from "./state.js";
import {
  buildAttackerCommitHash,
  buildDefenderCommitHash,
  generateSalt,
} from "./hash.js";

// ── Env ──────────────────────────────────────────────────────────────

const COMMIT_REVEAL_ADDRESS = process.env.COMMIT_REVEAL_ADDRESS || "";
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);

if (!process.env.STARKNET_RPC_URL) {
  console.error("STARKNET_RPC_URL is required");
  process.exit(1);
}
if (!process.env.WORLD_ADDRESS) {
  console.error("WORLD_ADDRESS is required");
  process.exit(1);
}
if (!COMMIT_REVEAL_ADDRESS) {
  console.error("COMMIT_REVEAL_ADDRESS is required");
  process.exit(1);
}

// ── Role constants (match Cairo) ─────────────────────────────────────

const ROLE_ATK_A = 0;
const ROLE_DEF_A = 1;
const ROLE_ATK_B = 2;
const ROLE_DEF_B = 3;

function roleName(role: number): string {
  switch (role) {
    case ROLE_ATK_A: return "Team A Attacker";
    case ROLE_DEF_A: return "Team A Defender";
    case ROLE_ATK_B: return "Team B Attacker";
    case ROLE_DEF_B: return "Team B Defender";
    default: return `Unknown(${role})`;
  }
}

function getPlayerRole(state: MatchStateData, address: string): number | null {
  const addr = address.toLowerCase();
  const normalize = (a: string) => a.toLowerCase().replace(/^0x0+/, "0x");
  if (normalize(state.team_a_attacker) === normalize(addr)) return ROLE_ATK_A;
  if (normalize(state.team_a_defender) === normalize(addr)) return ROLE_DEF_A;
  if (normalize(state.team_b_attacker) === normalize(addr)) return ROLE_ATK_B;
  if (normalize(state.team_b_defender) === normalize(addr)) return ROLE_DEF_B;
  return null;
}

function isAttacker(role: number): boolean {
  return role === ROLE_ATK_A || role === ROLE_ATK_B;
}

function isTeamA(role: number): boolean {
  return role === ROLE_ATK_A || role === ROLE_DEF_A;
}

function calcBudget(nodes: NodeStateData[], teamA: boolean): number {
  const target = teamA ? "TeamA" : "TeamB";
  let bonus = 0;
  for (const n of nodes) {
    if (n.owner === target) bonus++;
  }
  return 10 + bonus;
}

function nodeOwnerLabel(owner: string): string {
  if (owner === "TeamA") return "Team A";
  if (owner === "TeamB") return "Team B";
  return "None";
}

// ── MCP Server ───────────────────────────────────────────────────────

const server = new Server(
  { name: "siege-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const tools: Tool[] = [
  {
    name: "siege_get_match_state",
    description:
      "Get current match state: vault HPs, current round, status, node ownership, team budgets, player addresses and roles.",
    inputSchema: {
      type: "object" as const,
      properties: {
        match_id: { type: "number", description: "Match ID" },
      },
      required: ["match_id"],
    },
  },
  {
    name: "siege_get_round_history",
    description:
      "Get last N rounds of moves: attacks, defenses, damage dealt, node changes. Key info for strategic decisions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        match_id: { type: "number", description: "Match ID" },
        num_rounds: {
          type: "number",
          description: "Number of past rounds to fetch (default: 3)",
        },
      },
      required: ["match_id"],
    },
  },
  {
    name: "siege_get_my_status",
    description:
      "Get your status in a match: role (attacker/defender), team (A/B), commit/reveal status, budget.",
    inputSchema: {
      type: "object" as const,
      properties: {
        match_id: { type: "number", description: "Match ID" },
        player_address: {
          type: "string",
          description: "Your Starknet address (0x-prefixed)",
        },
      },
      required: ["match_id", "player_address"],
    },
  },
  {
    name: "siege_build_commit",
    description:
      "Build a commitment for this round. Validates budget, computes Poseidon hash with random salt. Returns salt (SAVE THIS!), hash, and call_data for starknet_invoke_contract.",
    inputSchema: {
      type: "object" as const,
      properties: {
        match_id: { type: "number", description: "Match ID" },
        role: {
          type: "string",
          enum: ["attacker", "defender"],
          description: "Your role",
        },
        pressure_points: {
          type: "array",
          items: { type: "number" },
          description: "Attacker: [p0, p1, p2] pressure point allocations",
        },
        garrison: {
          type: "array",
          items: { type: "number" },
          description: "Defender: [g0, g1, g2] garrison allocations",
        },
        repair: {
          type: "number",
          description: "Defender: repair allocation (0-3)",
        },
        node_contest: {
          type: "array",
          items: { type: "number" },
          description: "[nc0, nc1, nc2] node contest allocations",
        },
        budget: {
          type: "number",
          description:
            "Optional budget override. If not provided, set to 10 (no node bonus calculated — use siege_get_match_state to check).",
        },
      },
      required: ["match_id", "role", "node_contest"],
    },
  },
  {
    name: "siege_build_reveal_attacker",
    description:
      "Build attacker reveal calldata. Use the same salt and allocations from siege_build_commit.",
    inputSchema: {
      type: "object" as const,
      properties: {
        match_id: { type: "number", description: "Match ID" },
        salt: { type: "string", description: "Salt from siege_build_commit (hex)" },
        pressure_points: {
          type: "array",
          items: { type: "number" },
          description: "[p0, p1, p2]",
        },
        node_contest: {
          type: "array",
          items: { type: "number" },
          description: "[nc0, nc1, nc2]",
        },
      },
      required: ["match_id", "salt", "pressure_points", "node_contest"],
    },
  },
  {
    name: "siege_build_reveal_defender",
    description:
      "Build defender reveal calldata. Use the same salt and allocations from siege_build_commit.",
    inputSchema: {
      type: "object" as const,
      properties: {
        match_id: { type: "number", description: "Match ID" },
        salt: { type: "string", description: "Salt from siege_build_commit (hex)" },
        garrison: {
          type: "array",
          items: { type: "number" },
          description: "[g0, g1, g2]",
        },
        repair: { type: "number", description: "Repair allocation" },
        node_contest: {
          type: "array",
          items: { type: "number" },
          description: "[nc0, nc1, nc2]",
        },
      },
      required: ["match_id", "salt", "garrison", "repair", "node_contest"],
    },
  },
];

// ── List Tools ───────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

// ── Call Tool ────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── siege_get_match_state ────────────────────────────────────
      case "siege_get_match_state": {
        const matchId = (args as { match_id: number }).match_id;
        const state = await queryMatchState(matchId);
        const nodes = await queryNodeStates(matchId);
        const budgetA = calcBudget(nodes, true);
        const budgetB = calcBudget(nodes, false);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  match_id: matchId,
                  status: state.status,
                  current_round: state.current_round,
                  vault_a_hp: state.vault_a_hp,
                  vault_b_hp: state.vault_b_hp,
                  team_a: {
                    attacker: state.team_a_attacker,
                    defender: state.team_a_defender,
                    budget: budgetA,
                  },
                  team_b: {
                    attacker: state.team_b_attacker,
                    defender: state.team_b_defender,
                    budget: budgetB,
                  },
                  nodes: nodes.map((n) => ({
                    index: n.node_index,
                    owner: nodeOwnerLabel(n.owner),
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ── siege_get_round_history ─────────────────────────────────
      case "siege_get_round_history": {
        const { match_id: matchId, num_rounds = 3 } = args as {
          match_id: number;
          num_rounds?: number;
        };
        const state = await queryMatchState(matchId);
        const currentRound = state.current_round;
        const rounds: RoundMovesData[] = [];

        for (
          let r = Math.max(1, currentRound - num_rounds + 1);
          r <= currentRound;
          r++
        ) {
          try {
            const rm = await queryRoundMoves(matchId, r);
            rounds.push(rm);
          } catch {
            // round may not exist yet
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  match_id: matchId,
                  current_round: currentRound,
                  rounds: rounds.map((rm) => ({
                    round: rm.round,
                    commits: rm.commit_count,
                    reveals: rm.reveal_count,
                    team_a_attack: {
                      pressure: [rm.atk_a_p0, rm.atk_a_p1, rm.atk_a_p2],
                      nodes: [rm.atk_a_nc0, rm.atk_a_nc1, rm.atk_a_nc2],
                    },
                    team_a_defense: {
                      garrison: [rm.def_a_g0, rm.def_a_g1, rm.def_a_g2],
                      repair: rm.def_a_repair,
                      nodes: [rm.def_a_nc0, rm.def_a_nc1, rm.def_a_nc2],
                    },
                    team_b_attack: {
                      pressure: [rm.atk_b_p0, rm.atk_b_p1, rm.atk_b_p2],
                      nodes: [rm.atk_b_nc0, rm.atk_b_nc1, rm.atk_b_nc2],
                    },
                    team_b_defense: {
                      garrison: [rm.def_b_g0, rm.def_b_g1, rm.def_b_g2],
                      repair: rm.def_b_repair,
                      nodes: [rm.def_b_nc0, rm.def_b_nc1, rm.def_b_nc2],
                    },
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ── siege_get_my_status ─────────────────────────────────────
      case "siege_get_my_status": {
        const { match_id: matchId, player_address: addr } = args as {
          match_id: number;
          player_address: string;
        };
        const state = await queryMatchState(matchId);
        const role = getPlayerRole(state, addr);
        if (role === null) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: true,
                  message: `Address ${addr} is not a player in match ${matchId}`,
                }),
              },
            ],
            isError: true,
          };
        }

        const nodes = await queryNodeStates(matchId);
        const budget = calcBudget(nodes, isTeamA(role));
        let committed = false;
        let revealed = false;
        try {
          const c = await queryCommitment(matchId, state.current_round, role);
          committed = c.committed;
          revealed = c.revealed;
        } catch {
          // no commitment yet
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  match_id: matchId,
                  player_address: addr,
                  role: isAttacker(role) ? "attacker" : "defender",
                  role_name: roleName(role),
                  team: isTeamA(role) ? "A" : "B",
                  current_round: state.current_round,
                  committed,
                  revealed,
                  budget,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ── siege_build_commit ──────────────────────────────────────
      case "siege_build_commit": {
        const {
          match_id: matchId,
          role,
          pressure_points,
          garrison,
          repair = 0,
          node_contest: nc,
          budget,
        } = args as {
          match_id: number;
          role: "attacker" | "defender";
          pressure_points?: number[];
          garrison?: number[];
          repair?: number;
          node_contest: number[];
          budget?: number;
        };

        if (nc.length !== 3)
          throw new Error("node_contest must be [nc0, nc1, nc2]");

        let salt: string;
        let commitHash: string;
        let total: number;

        if (role === "attacker") {
          if (!pressure_points || pressure_points.length !== 3)
            throw new Error("Attacker must provide pressure_points [p0, p1, p2]");
          total =
            pressure_points[0] +
            pressure_points[1] +
            pressure_points[2] +
            nc[0] +
            nc[1] +
            nc[2];
          salt = generateSalt();
          commitHash = buildAttackerCommitHash(
            salt,
            pressure_points as [number, number, number],
            nc as [number, number, number]
          );
        } else {
          if (!garrison || garrison.length !== 3)
            throw new Error("Defender must provide garrison [g0, g1, g2]");
          total =
            garrison[0] +
            garrison[1] +
            garrison[2] +
            repair +
            nc[0] +
            nc[1] +
            nc[2];
          salt = generateSalt();
          commitHash = buildDefenderCommitHash(
            salt,
            garrison as [number, number, number],
            repair,
            nc as [number, number, number]
          );
        }

        const effectiveBudget = budget ?? 10;
        if (total > effectiveBudget) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: true,
                  message: `Total allocation (${total}) exceeds budget (${effectiveBudget}). Use siege_get_match_state to check actual budget with node bonuses.`,
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  salt,
                  commitment_hash: commitHash,
                  total_allocated: total,
                  budget: effectiveBudget,
                  call_data: {
                    contract_address: COMMIT_REVEAL_ADDRESS,
                    entry_point: "commit",
                    calldata: [String(matchId), commitHash],
                  },
                  warning:
                    "SAVE THE SALT! You need it for the reveal phase. If you lose it, you cannot reveal and will forfeit the round.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ── siege_build_reveal_attacker ─────────────────────────────
      case "siege_build_reveal_attacker": {
        const {
          match_id: matchId,
          salt,
          pressure_points: pp,
          node_contest: nc,
        } = args as {
          match_id: number;
          salt: string;
          pressure_points: number[];
          node_contest: number[];
        };

        if (pp.length !== 3) throw new Error("pressure_points must be [p0, p1, p2]");
        if (nc.length !== 3) throw new Error("node_contest must be [nc0, nc1, nc2]");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  call_data: {
                    contract_address: COMMIT_REVEAL_ADDRESS,
                    entry_point: "reveal_attacker",
                    calldata: [
                      String(matchId),
                      salt,
                      String(pp[0]),
                      String(pp[1]),
                      String(pp[2]),
                      String(nc[0]),
                      String(nc[1]),
                      String(nc[2]),
                    ],
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ── siege_build_reveal_defender ─────────────────────────────
      case "siege_build_reveal_defender": {
        const {
          match_id: matchId,
          salt,
          garrison: g,
          repair,
          node_contest: nc,
        } = args as {
          match_id: number;
          salt: string;
          garrison: number[];
          repair: number;
          node_contest: number[];
        };

        if (g.length !== 3) throw new Error("garrison must be [g0, g1, g2]");
        if (nc.length !== 3) throw new Error("node_contest must be [nc0, nc1, nc2]");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  call_data: {
                    contract_address: COMMIT_REVEAL_ADDRESS,
                    entry_point: "reveal_defender",
                    calldata: [
                      String(matchId),
                      salt,
                      String(g[0]),
                      String(g[1]),
                      String(g[2]),
                      String(repair),
                      String(nc[0]),
                      String(nc[1]),
                      String(nc[2]),
                    ],
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        return {
          content: [
            { type: "text", text: JSON.stringify({ error: true, message: `Unknown tool: ${name}` }) },
          ],
          isError: true,
        };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: JSON.stringify({ error: true, message }) }],
      isError: true,
    };
  }
});

// ── Background Polling & Notifications ───────────────────────────────

interface PollState {
  currentRound: number;
  commitCount: number;
  revealCount: number;
  status: string;
}

const watchedMatches = new Map<number, PollState>();

// Simple polling - can be enhanced with match subscription
async function pollMatchState(matchId: number): Promise<void> {
  try {
    const state = await queryMatchState(matchId);
    const prev = watchedMatches.get(matchId);
    const round = state.current_round;

    let rm: RoundMovesData | null = null;
    try {
      rm = await queryRoundMoves(matchId, round);
    } catch {
      // no moves yet
    }

    const current: PollState = {
      currentRound: round,
      commitCount: rm?.commit_count ?? 0,
      revealCount: rm?.reveal_count ?? 0,
      status: state.status,
    };

    if (prev) {
      // Detect state transitions
      if (current.currentRound > prev.currentRound) {
        await server.notification({
          method: "notifications/resources/updated",
          params: {
            uri: `siege://match/${matchId}/round_started`,
            meta: { round: current.currentRound },
          },
        });
      }
      if (current.commitCount === 4 && prev.commitCount < 4) {
        await server.notification({
          method: "notifications/resources/updated",
          params: {
            uri: `siege://match/${matchId}/all_committed`,
            meta: { round: current.currentRound },
          },
        });
      }
      if (current.revealCount === 4 && prev.revealCount < 4) {
        await server.notification({
          method: "notifications/resources/updated",
          params: {
            uri: `siege://match/${matchId}/round_resolved`,
            meta: { round: current.currentRound },
          },
        });
      }
      if (current.status === "Finished" && prev.status !== "Finished") {
        await server.notification({
          method: "notifications/resources/updated",
          params: {
            uri: `siege://match/${matchId}/match_ended`,
          },
        });
      }
    }

    watchedMatches.set(matchId, current);
  } catch {
    // polling failure, skip
  }
}

// Start polling loop for any match that has been queried
let pollInterval: ReturnType<typeof setInterval> | null = null;

function startPolling(): void {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    for (const matchId of watchedMatches.keys()) {
      await pollMatchState(matchId);
    }
  }, POLL_INTERVAL_MS);
}

// Matches are auto-watched when queried via polling

// ── Start ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  startPolling();
  console.error("Siege MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
