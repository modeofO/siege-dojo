/**
 * State reading — supports Torii GraphQL (preferred) and direct RPC fallback.
 */

import { RpcProvider, hash as snHash } from "starknet";

const TORII_URL = process.env.TORII_URL || "";
const STARKNET_RPC_URL = process.env.STARKNET_RPC_URL || "";
const WORLD_ADDRESS = process.env.WORLD_ADDRESS || "";

const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });

// ── Types ────────────────────────────────────────────────────────────

export interface MatchStateData {
  match_id: number;
  team_a_attacker: string;
  team_a_defender: string;
  team_b_attacker: string;
  team_b_defender: string;
  vault_a_hp: number;
  vault_b_hp: number;
  current_round: number;
  status: string; // "Pending" | "Active" | "Finished"
}

export interface RoundMovesData {
  match_id: number;
  round: number;
  commit_count: number;
  reveal_count: number;
  commit_deadline: number;
  reveal_deadline: number;
  ready: boolean;
  atk_a_p0: number; atk_a_p1: number; atk_a_p2: number;
  atk_a_nc0: number; atk_a_nc1: number; atk_a_nc2: number;
  def_a_g0: number; def_a_g1: number; def_a_g2: number;
  def_a_repair: number;
  def_a_nc0: number; def_a_nc1: number; def_a_nc2: number;
  atk_b_p0: number; atk_b_p1: number; atk_b_p2: number;
  atk_b_nc0: number; atk_b_nc1: number; atk_b_nc2: number;
  def_b_g0: number; def_b_g1: number; def_b_g2: number;
  def_b_repair: number;
  def_b_nc0: number; def_b_nc1: number; def_b_nc2: number;
}

export interface NodeStateData {
  match_id: number;
  node_index: number;
  owner: string; // "None" | "TeamA" | "TeamB"
}

export interface CommitmentData {
  match_id: number;
  round: number;
  role: number;
  hash: string;
  committed: boolean;
  revealed: boolean;
}

// ── Torii GraphQL ────────────────────────────────────────────────────

async function toriiQuery(query: string): Promise<unknown> {
  if (!TORII_URL) throw new Error("No TORII_URL configured");
  const resp = await fetch(TORII_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error(`Torii query failed: ${resp.status}`);
  const json = (await resp.json()) as { data?: unknown; errors?: unknown[] };
  if (json.errors) throw new Error(`Torii errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function toriiMatchState(matchId: number): Promise<MatchStateData | null> {
  try {
    const data = (await toriiQuery(`
      query {
        siegeDojoMatchStateModels(where: { match_id: ${matchId} }) {
          edges {
            node {
              match_id
              team_a_attacker
              team_a_defender
              team_b_attacker
              team_b_defender
              vault_a_hp
              vault_b_hp
              current_round
              status
            }
          }
        }
      }
    `)) as {
      siegeDojoMatchStateModels: {
        edges: Array<{ node: MatchStateData }>;
      };
    };
    const edges = data.siegeDojoMatchStateModels?.edges;
    if (!edges || edges.length === 0) return null;
    return edges[0].node;
  } catch {
    return null;
  }
}

async function toriiRoundMoves(matchId: number, round: number): Promise<RoundMovesData | null> {
  try {
    const data = (await toriiQuery(`
      query {
        siegeDojoRoundMovesModels(where: { match_id: ${matchId}, round: ${round} }) {
          edges {
            node {
              match_id round commit_count reveal_count commit_deadline reveal_deadline ready
              atk_a_p0 atk_a_p1 atk_a_p2 atk_a_nc0 atk_a_nc1 atk_a_nc2
              def_a_g0 def_a_g1 def_a_g2 def_a_repair def_a_nc0 def_a_nc1 def_a_nc2
              atk_b_p0 atk_b_p1 atk_b_p2 atk_b_nc0 atk_b_nc1 atk_b_nc2
              def_b_g0 def_b_g1 def_b_g2 def_b_repair def_b_nc0 def_b_nc1 def_b_nc2
            }
          }
        }
      }
    `)) as {
      siegeDojoRoundMovesModels: {
        edges: Array<{ node: RoundMovesData }>;
      };
    };
    const edges = data.siegeDojoRoundMovesModels?.edges;
    if (!edges || edges.length === 0) return null;
    return edges[0].node;
  } catch {
    return null;
  }
}

async function toriiNodeStates(matchId: number): Promise<NodeStateData[] | null> {
  try {
    const data = (await toriiQuery(`
      query {
        siegeDojoNodeStateModels(where: { match_id: ${matchId} }) {
          edges {
            node { match_id node_index owner }
          }
        }
      }
    `)) as {
      siegeDojoNodeStateModels: {
        edges: Array<{ node: NodeStateData }>;
      };
    };
    const edges = data.siegeDojoNodeStateModels?.edges;
    if (!edges || edges.length === 0) return null;
    return edges.map((e) => e.node);
  } catch {
    return null;
  }
}

async function toriiCommitment(matchId: number, round: number, role: number): Promise<CommitmentData | null> {
  try {
    const data = (await toriiQuery(`
      query {
        siegeDojoCommitmentModels(where: { match_id: ${matchId}, round: ${round}, role: ${role} }) {
          edges {
            node { match_id round role hash committed revealed }
          }
        }
      }
    `)) as {
      siegeDojoCommitmentModels: {
        edges: Array<{ node: CommitmentData }>;
      };
    };
    const edges = data.siegeDojoCommitmentModels?.edges;
    if (!edges || edges.length === 0) return null;
    return edges[0].node;
  } catch {
    return null;
  }
}

// ── Direct RPC Fallback ──────────────────────────────────────────────

/**
 * Compute Dojo model selector: sn_keccak("namespace-ModelName")
 */
function modelSelector(modelName: string): string {
  return snHash.getSelectorFromName(`siege_dojo-${modelName}`);
}

/**
 * Read a Dojo entity via world contract's entity() function.
 * Keys are the model's #[key] fields as felt strings.
 */
async function readEntity(
  modelName: string,
  keys: string[]
): Promise<string[]> {
  const selector = modelSelector(modelName);
  const result = await provider.callContract({
    contractAddress: WORLD_ADDRESS,
    entrypoint: "entity",
    calldata: [
      selector,
      String(keys.length),
      ...keys,
    ],
  });
  // Result is an array of felts; first element is often the length
  const arr = Array.isArray(result) ? result : [];
  return arr;
}

function feltToNum(felt: string): number {
  return Number(BigInt(felt));
}

function feltToAddress(felt: string): string {
  return `0x${BigInt(felt).toString(16).padStart(64, "0")}`;
}

// Status enum: 0=Pending, 1=Active, 2=Finished
function statusFromFelt(felt: string): string {
  const v = feltToNum(felt);
  if (v === 0) return "Pending";
  if (v === 1) return "Active";
  return "Finished";
}

// NodeOwner enum: 0=None, 1=TeamA, 2=TeamB
function nodeOwnerFromFelt(felt: string): string {
  const v = feltToNum(felt);
  if (v === 1) return "TeamA";
  if (v === 2) return "TeamB";
  return "None";
}

async function rpcMatchState(matchId: number): Promise<MatchStateData> {
  const raw = await readEntity("MatchState", [String(matchId)]);
  // Layout: [len, team_a_attacker, team_a_defender, team_b_attacker, team_b_defender,
  //          vault_a_hp, vault_b_hp, current_round, status]
  // Skip first element if it's the length
  const offset = raw.length > 8 ? 1 : 0;
  return {
    match_id: matchId,
    team_a_attacker: feltToAddress(raw[offset]),
    team_a_defender: feltToAddress(raw[offset + 1]),
    team_b_attacker: feltToAddress(raw[offset + 2]),
    team_b_defender: feltToAddress(raw[offset + 3]),
    vault_a_hp: feltToNum(raw[offset + 4]),
    vault_b_hp: feltToNum(raw[offset + 5]),
    current_round: feltToNum(raw[offset + 6]),
    status: statusFromFelt(raw[offset + 7]),
  };
}

async function rpcRoundMoves(matchId: number, round: number): Promise<RoundMovesData> {
  const raw = await readEntity("RoundMoves", [String(matchId), String(round)]);
  const offset = raw.length > 30 ? 1 : 0;
  const n = (i: number) => feltToNum(raw[offset + i]);
  return {
    match_id: matchId,
    round,
    commit_count: n(0),
    reveal_count: n(1),
    commit_deadline: n(2),
    reveal_deadline: n(3),
    ready: n(4) !== 0,
    atk_a_p0: n(5), atk_a_p1: n(6), atk_a_p2: n(7),
    atk_a_nc0: n(8), atk_a_nc1: n(9), atk_a_nc2: n(10),
    def_a_g0: n(11), def_a_g1: n(12), def_a_g2: n(13),
    def_a_repair: n(14),
    def_a_nc0: n(15), def_a_nc1: n(16), def_a_nc2: n(17),
    atk_b_p0: n(18), atk_b_p1: n(19), atk_b_p2: n(20),
    atk_b_nc0: n(21), atk_b_nc1: n(22), atk_b_nc2: n(23),
    def_b_g0: n(24), def_b_g1: n(25), def_b_g2: n(26),
    def_b_repair: n(27),
    def_b_nc0: n(28), def_b_nc1: n(29), def_b_nc2: n(30),
  };
}

async function rpcNodeStates(matchId: number): Promise<NodeStateData[]> {
  const nodes: NodeStateData[] = [];
  for (let i = 0; i < 3; i++) {
    const raw = await readEntity("NodeState", [String(matchId), String(i)]);
    const offset = raw.length > 1 ? 1 : 0;
    nodes.push({
      match_id: matchId,
      node_index: i,
      owner: nodeOwnerFromFelt(raw[offset]),
    });
  }
  return nodes;
}

async function rpcCommitment(matchId: number, round: number, role: number): Promise<CommitmentData> {
  const raw = await readEntity("Commitment", [String(matchId), String(round), String(role)]);
  const offset = raw.length > 3 ? 1 : 0;
  return {
    match_id: matchId,
    round,
    role,
    hash: raw[offset],
    committed: feltToNum(raw[offset + 1]) !== 0,
    revealed: feltToNum(raw[offset + 2]) !== 0,
  };
}

// ── Public API (Torii-first, RPC fallback) ───────────────────────────

export async function queryMatchState(matchId: number): Promise<MatchStateData> {
  if (TORII_URL) {
    const result = await toriiMatchState(matchId);
    if (result) return result;
  }
  return rpcMatchState(matchId);
}

export async function queryRoundMoves(matchId: number, round: number): Promise<RoundMovesData> {
  if (TORII_URL) {
    const result = await toriiRoundMoves(matchId, round);
    if (result) return result;
  }
  return rpcRoundMoves(matchId, round);
}

export async function queryNodeStates(matchId: number): Promise<NodeStateData[]> {
  if (TORII_URL) {
    const result = await toriiNodeStates(matchId);
    if (result) return result;
  }
  return rpcNodeStates(matchId);
}

export async function queryCommitment(matchId: number, round: number, role: number): Promise<CommitmentData> {
  if (TORII_URL) {
    const result = await toriiCommitment(matchId, round, role);
    if (result) return result;
  }
  return rpcCommitment(matchId, round, role);
}
