import { Contract, RpcProvider } from "starknet";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_DIR = path.resolve(__dirname, "../../target/dev");

function loadAbi(filename: string): any[] {
  const data = JSON.parse(fs.readFileSync(path.join(TARGET_DIR, filename), "utf-8"));
  return data.abi;
}

let _worldAbi: any[] | null = null;
let _actionsAbi: any[] | null = null;
let _commitRevealAbi: any[] | null = null;
let _resolutionAbi: any[] | null = null;

export function getWorldAbi() {
  if (!_worldAbi) _worldAbi = loadAbi("siege_dojo_world.contract_class.json");
  return _worldAbi;
}
export function getActionsAbi() {
  if (!_actionsAbi) _actionsAbi = loadAbi("siege_dojo_actions.contract_class.json");
  return _actionsAbi;
}
export function getCommitRevealAbi() {
  if (!_commitRevealAbi) _commitRevealAbi = loadAbi("siege_dojo_commit_reveal.contract_class.json");
  return _commitRevealAbi;
}
export function getResolutionAbi() {
  if (!_resolutionAbi) _resolutionAbi = loadAbi("siege_dojo_resolution.contract_class.json");
  return _resolutionAbi;
}

export interface MatchState {
  matchId: number;
  teamAAttacker: string;
  teamADefender: string;
  teamBAttacker: string;
  teamBDefender: string;
  vaultAHp: number;
  vaultBHp: number;
  currentRound: number;
  status: "Pending" | "Active" | "Finished";
}

export interface NodeState {
  matchId: number;
  nodeIndex: number;
  owner: "None" | "TeamA" | "TeamB";
}

export interface RoundMoves {
  matchId: number;
  round: number;
  commitCount: number;
  revealCount: number;
  ready: boolean;
  atkAP0: number; atkAP1: number; atkAP2: number;
  atkANc0: number; atkANc1: number; atkANc2: number;
  defAG0: number; defAG1: number; defAG2: number;
  defARepair: number;
  defANc0: number; defANc1: number; defANc2: number;
  atkBP0: number; atkBP1: number; atkBP2: number;
  atkBNc0: number; atkBNc1: number; atkBNc2: number;
  defBG0: number; defBG1: number; defBG2: number;
  defBRepair: number;
  defBNc0: number; defBNc1: number; defBNc2: number;
}

export interface CommitmentState {
  matchId: number;
  round: number;
  role: number;
  hash: string;
  committed: boolean;
  revealed: boolean;
}

export const ROLE_ATK_A = 0;
export const ROLE_DEF_A = 1;
export const ROLE_ATK_B = 2;
export const ROLE_DEF_B = 3;

/**
 * Read Dojo model entities via world.entity() with raw calldata.
 */
export class GameStateReader {
  private provider: RpcProvider;
  private worldAddress: string;
  private actionsContract: Contract;

  constructor(
    provider: RpcProvider,
    worldAddress: string,
    actionsAddress: string,
    _commitRevealAddress: string,
  ) {
    this.provider = provider;
    this.worldAddress = worldAddress;
    this.actionsContract = new Contract({
      abi: getActionsAbi(),
      address: actionsAddress,
      providerOrAccount: provider,
    });
  }

  private async readEntity(
    modelSelector: string,
    keys: string[],
    layoutSizes: number[],
  ): Promise<string[]> {
    const calldata: string[] = [
      modelSelector,
      "0", // ModelIndex::Keys variant
      keys.length.toString(),
      ...keys,
      "0", // Layout::Fixed variant
      layoutSizes.length.toString(),
      ...layoutSizes.map(s => s.toString()),
    ];

    const result = await this.provider.callContract({
      contractAddress: this.worldAddress,
      entrypoint: "entity",
      calldata,
    });

    return result as string[];
  }

  private v(values: string[], index: number): string {
    return values[index] || "0";
  }

  private vi(values: string[], index: number): number {
    return parseInt(this.v(values, index));
  }

  async getMatchState(matchId: number): Promise<MatchState> {
    const MODEL_SELECTOR = "0x2cc9c217f89ffbc1bebe33637b3a53567585541781ee1c8a4e13cef770b8cd7";
    const layout = [252, 252, 252, 252, 8, 8, 32, 8];
    const values = await this.readEntity(MODEL_SELECTOR, [matchId.toString()], layout);

    const o = 1; // skip span length
    const statusVal = this.vi(values, o + 7);
    const status = statusVal === 0 ? "Pending" as const : statusVal === 1 ? "Active" as const : "Finished" as const;

    return {
      matchId,
      teamAAttacker: this.v(values, o),
      teamADefender: this.v(values, o + 1),
      teamBAttacker: this.v(values, o + 2),
      teamBDefender: this.v(values, o + 3),
      vaultAHp: this.vi(values, o + 4),
      vaultBHp: this.vi(values, o + 5),
      currentRound: this.vi(values, o + 6),
      status,
    };
  }

  async getNodeState(matchId: number, nodeIndex: number): Promise<NodeState> {
    const MODEL_SELECTOR = "0xf835fd4537a390b9ab46e5b9764c4c74e2fd677075543cc7b069916e32d2ff";
    const layout = [8];
    const values = await this.readEntity(MODEL_SELECTOR, [matchId.toString(), nodeIndex.toString()], layout);

    const ownerVal = this.vi(values, 1);
    const owner = ownerVal === 0 ? "None" as const : ownerVal === 1 ? "TeamA" as const : "TeamB" as const;
    return { matchId, nodeIndex, owner };
  }

  async getAllNodes(matchId: number): Promise<NodeState[]> {
    return Promise.all([0, 1, 2].map(i => this.getNodeState(matchId, i)));
  }

  async getTeamBudget(matchId: number, isTeamA: boolean): Promise<number> {
    const result = await this.actionsContract.call("get_team_budget", [matchId, isTeamA]);
    return Number(result);
  }

  async getRoundMoves(matchId: number, round: number): Promise<RoundMoves> {
    const MODEL_SELECTOR = "0x16372df2e0d484c3ec7bcb85d90d96e818ed5622108a64b4b80e89010442fba";
    const layout = [
      8, 8, 64, 64, 8,
      8, 8, 8, 8, 8, 8,
      8, 8, 8, 8, 8, 8, 8,
      8, 8, 8, 8, 8, 8,
      8, 8, 8, 8, 8, 8, 8,
    ];
    const values = await this.readEntity(MODEL_SELECTOR, [matchId.toString(), round.toString()], layout);

    const o = 1;
    return {
      matchId, round,
      commitCount: this.vi(values, o),
      revealCount: this.vi(values, o + 1),
      ready: this.vi(values, o + 4) === 1,
      atkAP0: this.vi(values, o + 5), atkAP1: this.vi(values, o + 6), atkAP2: this.vi(values, o + 7),
      atkANc0: this.vi(values, o + 8), atkANc1: this.vi(values, o + 9), atkANc2: this.vi(values, o + 10),
      defAG0: this.vi(values, o + 11), defAG1: this.vi(values, o + 12), defAG2: this.vi(values, o + 13),
      defARepair: this.vi(values, o + 14),
      defANc0: this.vi(values, o + 15), defANc1: this.vi(values, o + 16), defANc2: this.vi(values, o + 17),
      atkBP0: this.vi(values, o + 18), atkBP1: this.vi(values, o + 19), atkBP2: this.vi(values, o + 20),
      atkBNc0: this.vi(values, o + 21), atkBNc1: this.vi(values, o + 22), atkBNc2: this.vi(values, o + 23),
      defBG0: this.vi(values, o + 24), defBG1: this.vi(values, o + 25), defBG2: this.vi(values, o + 26),
      defBRepair: this.vi(values, o + 27),
      defBNc0: this.vi(values, o + 28), defBNc1: this.vi(values, o + 29), defBNc2: this.vi(values, o + 30),
    };
  }

  async getCommitment(matchId: number, round: number, role: number): Promise<CommitmentState> {
    const MODEL_SELECTOR = "0x1ff4e5511fe1a5cc9cd7119ff419f54248d9ad3fe145dd31eda66770c0a9324";
    const layout = [252, 8, 8];
    const values = await this.readEntity(
      MODEL_SELECTOR,
      [matchId.toString(), round.toString(), role.toString()],
      layout,
    );

    return {
      matchId, round, role,
      hash: this.v(values, 1),
      committed: this.vi(values, 2) === 1,
      revealed: this.vi(values, 3) === 1,
    };
  }
}
