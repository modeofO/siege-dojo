import { Account, Contract, hash } from "starknet";
import { getCommitRevealAbi } from "./state.js";
import type { AttackerMove, DefenderMove } from "./strategy.js";

export function hashAttackerMove(salt: string, move: AttackerMove): string {
  return hash.computePoseidonHashOnElements([
    salt, move.p0.toString(), move.p1.toString(), move.p2.toString(),
    move.nc0.toString(), move.nc1.toString(), move.nc2.toString(),
  ]);
}

export function hashDefenderMove(salt: string, move: DefenderMove): string {
  return hash.computePoseidonHashOnElements([
    salt, move.g0.toString(), move.g1.toString(), move.g2.toString(),
    move.repair.toString(), move.nc0.toString(), move.nc1.toString(), move.nc2.toString(),
  ]);
}

export function randomSalt(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function commitMove(
  account: Account, commitRevealAddress: string, matchId: number, commitmentHash: string,
): Promise<string> {
  const contract = new Contract({ abi: getCommitRevealAbi(), address: commitRevealAddress, providerOrAccount: account });
  const result = await contract.invoke("commit", [matchId, commitmentHash]);
  await account.waitForTransaction(result.transaction_hash);
  return result.transaction_hash;
}

export async function revealAttackerMove(
  account: Account, commitRevealAddress: string, matchId: number, salt: string, move: AttackerMove,
): Promise<string> {
  const contract = new Contract({ abi: getCommitRevealAbi(), address: commitRevealAddress, providerOrAccount: account });
  const result = await contract.invoke("reveal_attacker", [
    matchId, salt, move.p0, move.p1, move.p2, move.nc0, move.nc1, move.nc2,
  ]);
  await account.waitForTransaction(result.transaction_hash);
  return result.transaction_hash;
}

export async function revealDefenderMove(
  account: Account, commitRevealAddress: string, matchId: number, salt: string, move: DefenderMove,
): Promise<string> {
  const contract = new Contract({ abi: getCommitRevealAbi(), address: commitRevealAddress, providerOrAccount: account });
  const result = await contract.invoke("reveal_defender", [
    matchId, salt, move.g0, move.g1, move.g2, move.repair, move.nc0, move.nc1, move.nc2,
  ]);
  await account.waitForTransaction(result.transaction_hash);
  return result.transaction_hash;
}
