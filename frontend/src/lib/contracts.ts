import type { AccountInterface } from "starknet";

// Contract addresses — update after deployment
export const CONTRACTS = {
  ACTIONS: process.env.NEXT_PUBLIC_ACTIONS_ADDRESS || "0x0",
  COMMIT_REVEAL: process.env.NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS || "0x0",
};

export async function createMatch(
  account: AccountInterface,
  teamAAttacker: string,
  teamADefender: string,
  teamBAttacker: string,
  teamBDefender: string
) {
  return account.execute({
    contractAddress: CONTRACTS.ACTIONS,
    entrypoint: "create_match",
    calldata: [teamAAttacker, teamADefender, teamBAttacker, teamBDefender],
  });
}

export async function commitMove(
  account: AccountInterface,
  matchId: string,
  commitment: string
) {
  return account.execute({
    contractAddress: CONTRACTS.COMMIT_REVEAL,
    entrypoint: "commit",
    calldata: [matchId, commitment],
  });
}

export async function revealAttacker(
  account: AccountInterface,
  matchId: string,
  salt: string,
  pressurePoints: [string, string, string],
  nodeContests: [string, string, string]
) {
  return account.execute({
    contractAddress: CONTRACTS.COMMIT_REVEAL,
    entrypoint: "reveal_attacker",
    calldata: [matchId, salt, ...pressurePoints, ...nodeContests],
  });
}

export async function revealDefender(
  account: AccountInterface,
  matchId: string,
  salt: string,
  pressurePoints: [string, string, string],
  repair: string,
  nodeContests: [string, string, string]
) {
  return account.execute({
    contractAddress: CONTRACTS.COMMIT_REVEAL,
    entrypoint: "reveal_defender",
    calldata: [matchId, salt, ...pressurePoints, repair, ...nodeContests],
  });
}
