import { RpcProvider, Account, hash, CallData, type AccountInterface } from "starknet";
import { randomBytes } from "crypto";

// --------------- Constants ---------------

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://api.cartridge.gg/x/starknet/sepolia";

export const TORII_URL =
  process.env.NEXT_PUBLIC_TORII_URL ||
  "https://api.cartridge.gg/x/siege-dojo/torii";

export const CHAIN_ID = "0x534e5f5345504f4c4941"; // SN_SEPOLIA

export const CONTRACTS = {
  ACTIONS_1V1:
    process.env.ACTIONS_1V1_ADDRESS || "0x7cbd822e0dc535d084dd71b76ba332d76cb370954c83a5ebe5625f36cdfa1c",
  COMMIT_REVEAL_1V1:
    process.env.COMMIT_REVEAL_1V1_ADDRESS || "0x516bdf650dcaebe431a06fba09766ee2d4be79c477e73ba220a64c4f6d4af80",
};

export const provider = new RpcProvider({ nodeUrl: RPC_URL });

// --------------- Types ---------------

export interface MoveAllocation {
  attack: [number, number, number];
  defense: [number, number, number];
  repair: number;
  nodes: [number, number, number];
}

export type NodeOwner = "neutral" | "teamA" | "teamB";

export interface MatchInfo {
  matchId: string;
  playerA: string;
  playerB: string;
  vaultAHp: number;
  vaultBHp: number;
  currentRound: number;
  status: string;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
}

export interface RoundStatus {
  commitCount: number;
  revealCount: number;
}

export interface RoundMoves {
  aAttack: [number, number, number];
  aDefense: [number, number, number];
  aRepair: number;
  aNodes: [number, number, number];
  bAttack: [number, number, number];
  bDefense: [number, number, number];
  bRepair: number;
  bNodes: [number, number, number];
}

// --------------- Helpers ---------------

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

function ownerStr(owner: string): NodeOwner {
  if (owner === "TeamA") return "teamA";
  if (owner === "TeamB") return "teamB";
  return "neutral";
}

// --------------- Torii queries ---------------

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
    return (data?.data as T) ?? null;
  } catch {
    return null;
  }
}

export async function fetchMatchState(matchId: string): Promise<MatchInfo | null> {
  const id = Number(matchId);
  if (!Number.isInteger(id) || id < 0) return null;

  const data = await toriiQuery<{
    siegeDojoMatchState1v1Models: {
      edges: Array<{
        node: {
          match_id: number | string;
          player_a: string;
          player_b: string;
          vault_a_hp: number | string;
          vault_b_hp: number | string;
          current_round: number | string;
          status: string;
        };
      }>;
    };
    siegeDojoNodeStateModels: {
      edges: Array<{
        node: {
          node_index: number | string;
          owner: string;
        };
      }>;
    };
  }>(`
    query {
      siegeDojoMatchState1v1Models(where: { match_id: "${id}" }) {
        edges {
          node {
            match_id
            player_a
            player_b
            vault_a_hp
            vault_b_hp
            current_round
            status
          }
        }
      }
      siegeDojoNodeStateModels(where: { match_id: "${id}" }) {
        edges {
          node {
            node_index
            owner
          }
        }
      }
    }
  `);

  const matchNode = data?.siegeDojoMatchState1v1Models?.edges?.[0]?.node;
  if (!matchNode) return null;

  const nodes: [NodeOwner, NodeOwner, NodeOwner] = ["neutral", "neutral", "neutral"];
  const nodeEdges = data?.siegeDojoNodeStateModels?.edges || [];
  for (const edge of nodeEdges) {
    const idx = toNum(edge.node.node_index);
    if (idx >= 0 && idx < 3) {
      nodes[idx] = ownerStr(edge.node.owner);
    }
  }

  return {
    matchId: String(matchNode.match_id),
    playerA: matchNode.player_a,
    playerB: matchNode.player_b,
    vaultAHp: toNum(matchNode.vault_a_hp),
    vaultBHp: toNum(matchNode.vault_b_hp),
    currentRound: toNum(matchNode.current_round),
    status: matchNode.status,
    nodes,
  };
}

export async function fetchRoundStatus(matchId: string, round: number): Promise<RoundStatus> {
  const id = Number(matchId);
  const data = await toriiQuery<{
    siegeDojoRoundMoves1v1Models: {
      edges: Array<{
        node: {
          commit_count: number | string;
          reveal_count: number | string;
        };
      }>;
    };
  }>(`
    query {
      siegeDojoRoundMoves1v1Models(where: { match_id: "${id}", round: ${round} }) {
        edges {
          node {
            commit_count
            reveal_count
          }
        }
      }
    }
  `);

  const node = data?.siegeDojoRoundMoves1v1Models?.edges?.[0]?.node;
  if (!node) return { commitCount: 0, revealCount: 0 };
  return {
    commitCount: toNum(node.commit_count),
    revealCount: toNum(node.reveal_count),
  };
}

export async function fetchRoundMoves(matchId: string, round: number): Promise<RoundMoves | null> {
  const id = Number(matchId);
  const data = await toriiQuery<{
    siegeDojoRoundMoves1v1Models: {
      edges: Array<{
        node: {
          a_p0: number | string; a_p1: number | string; a_p2: number | string;
          a_g0: number | string; a_g1: number | string; a_g2: number | string;
          a_repair: number | string;
          a_nc0: number | string; a_nc1: number | string; a_nc2: number | string;
          b_p0: number | string; b_p1: number | string; b_p2: number | string;
          b_g0: number | string; b_g1: number | string; b_g2: number | string;
          b_repair: number | string;
          b_nc0: number | string; b_nc1: number | string; b_nc2: number | string;
        };
      }>;
    };
  }>(`
    query {
      siegeDojoRoundMoves1v1Models(where: { match_id: "${id}", round: ${round} }) {
        edges {
          node {
            a_p0 a_p1 a_p2
            a_g0 a_g1 a_g2
            a_repair
            a_nc0 a_nc1 a_nc2
            b_p0 b_p1 b_p2
            b_g0 b_g1 b_g2
            b_repair
            b_nc0 b_nc1 b_nc2
          }
        }
      }
    }
  `);

  const node = data?.siegeDojoRoundMoves1v1Models?.edges?.[0]?.node;
  if (!node) return null;

  return {
    aAttack: [toNum(node.a_p0), toNum(node.a_p1), toNum(node.a_p2)],
    aDefense: [toNum(node.a_g0), toNum(node.a_g1), toNum(node.a_g2)],
    aRepair: toNum(node.a_repair),
    aNodes: [toNum(node.a_nc0), toNum(node.a_nc1), toNum(node.a_nc2)],
    bAttack: [toNum(node.b_p0), toNum(node.b_p1), toNum(node.b_p2)],
    bDefense: [toNum(node.b_g0), toNum(node.b_g1), toNum(node.b_g2)],
    bRepair: toNum(node.b_repair),
    bNodes: [toNum(node.b_nc0), toNum(node.b_nc1), toNum(node.b_nc2)],
  };
}

// --------------- Crypto ---------------

export function generateSalt(): string {
  const bytes = randomBytes(31); // 31 bytes to stay within felt252
  return "0x" + bytes.toString("hex");
}

export function computeCommitment(salt: string, move: MoveAllocation): string {
  // Hash order must match Cairo: salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2
  const elements = [
    salt,
    move.attack[0].toString(),
    move.attack[1].toString(),
    move.attack[2].toString(),
    move.defense[0].toString(),
    move.defense[1].toString(),
    move.defense[2].toString(),
    move.repair.toString(),
    move.nodes[0].toString(),
    move.nodes[1].toString(),
    move.nodes[2].toString(),
  ];
  return hash.computePoseidonHashOnElements(elements);
}

// --------------- Contract calls ---------------

export async function createMatch(
  account: AccountInterface,
  playerA: string,
  playerB: string,
): Promise<string> {
  const tx = await account.execute({
    contractAddress: CONTRACTS.ACTIONS_1V1,
    entrypoint: "create_match_1v1",
    calldata: CallData.compile([playerA, playerB]),
  });
  await provider.waitForTransaction(tx.transaction_hash);
  return tx.transaction_hash;
}

export async function commitMove(
  account: AccountInterface,
  matchId: string,
  commitment: string,
): Promise<string> {
  const tx = await account.execute({
    contractAddress: CONTRACTS.COMMIT_REVEAL_1V1,
    entrypoint: "commit",
    calldata: CallData.compile([matchId, commitment]),
  });
  await provider.waitForTransaction(tx.transaction_hash);
  return tx.transaction_hash;
}

export async function revealMove(
  account: AccountInterface,
  matchId: string,
  salt: string,
  move: MoveAllocation,
): Promise<string> {
  // Calldata order: match_id, salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2
  const tx = await account.execute({
    contractAddress: CONTRACTS.COMMIT_REVEAL_1V1,
    entrypoint: "reveal",
    calldata: CallData.compile([
      matchId,
      salt,
      move.attack[0],
      move.attack[1],
      move.attack[2],
      move.defense[0],
      move.defense[1],
      move.defense[2],
      move.repair,
      move.nodes[0],
      move.nodes[1],
      move.nodes[2],
    ]),
  });
  await provider.waitForTransaction(tx.transaction_hash);
  return tx.transaction_hash;
}
