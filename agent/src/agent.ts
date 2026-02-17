import { Account, RpcProvider } from "starknet";
import type { AgentConfig } from "./config.js";
import { GameStateReader, ROLE_ATK_A, ROLE_DEF_A, ROLE_ATK_B, ROLE_DEF_B } from "./state.js";
import type { MatchState, RoundMoves, NodeState } from "./state.js";
import { planAttack, planDefense } from "./strategy.js";
import type { AttackerMove, DefenderMove } from "./strategy.js";
import { hashAttackerMove, hashDefenderMove, randomSalt, commitMove, revealAttackerMove, revealDefenderMove } from "./submit.js";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class SiegeAgent {
  private config: AgentConfig;
  private account: Account;
  private reader: GameStateReader;
  private roundHistory: RoundMoves[] = [];
  private pendingSalt: string | null = null;
  private pendingAttackerMove: AttackerMove | null = null;
  private pendingDefenderMove: DefenderMove | null = null;
  private lastCommittedRound = 0;
  private lastRevealedRound = 0;
  private isTeamA = true;
  private log: (msg: string) => void;

  constructor(config: AgentConfig, log?: (msg: string) => void) {
    this.config = config;
    this.log = log || console.log;
    const provider = new RpcProvider({ nodeUrl: config.rpcUrl });
    this.account = new Account({ provider, address: config.accountAddress, signer: config.privateKey });
    this.reader = new GameStateReader(provider, config.worldAddress, config.actionsAddress, config.commitRevealAddress);
  }

  private getRole(): number {
    if (this.isTeamA) return this.config.agentRole === "attacker" ? ROLE_ATK_A : ROLE_DEF_A;
    return this.config.agentRole === "attacker" ? ROLE_ATK_B : ROLE_DEF_B;
  }

  async tick(): Promise<boolean> {
    const matchState = await this.reader.getMatchState(this.config.matchId);

    if (matchState.status === "Finished") {
      this.log(`Game over! Vault A: ${matchState.vaultAHp}, Vault B: ${matchState.vaultBHp}`);
      return false;
    }
    if (matchState.status === "Pending") {
      this.log("Match not active yet, waiting...");
      return true;
    }

    const addr = this.config.accountAddress.toLowerCase();
    this.isTeamA = matchState.teamAAttacker.toLowerCase() === addr || matchState.teamADefender.toLowerCase() === addr;

    const round = matchState.currentRound;
    const role = this.getRole();
    const commitment = await this.reader.getCommitment(this.config.matchId, round, role);

    if (!commitment.committed && this.lastCommittedRound < round) {
      await this.doCommit(matchState, round);
      return true;
    }

    if (commitment.committed && !commitment.revealed && this.lastRevealedRound < round) {
      const roundMoves = await this.reader.getRoundMoves(this.config.matchId, round);
      if (roundMoves.commitCount === 4) {
        await this.doReveal(round);
      } else {
        this.log(`Round ${round}: waiting for commits (${roundMoves.commitCount}/4)`);
      }
    }

    if (commitment.revealed) {
      const roundMoves = await this.reader.getRoundMoves(this.config.matchId, round);
      this.log(`Round ${round}: reveals ${roundMoves.revealCount}/4`);
    }

    return true;
  }

  private async doCommit(matchState: MatchState, round: number): Promise<void> {
    const nodes = await this.reader.getAllNodes(this.config.matchId);
    const budget = await this.reader.getTeamBudget(this.config.matchId, this.isTeamA);
    this.log(`Round ${round}: Planning (budget=${budget}, role=${this.config.agentRole})`);

    this.pendingSalt = randomSalt();
    let commitHash: string;

    if (this.config.agentRole === "attacker") {
      this.pendingAttackerMove = planAttack(budget, this.roundHistory, nodes, this.isTeamA);
      commitHash = hashAttackerMove(this.pendingSalt, this.pendingAttackerMove);
      const m = this.pendingAttackerMove;
      this.log(`  Attack: p=[${m.p0},${m.p1},${m.p2}] nc=[${m.nc0},${m.nc1},${m.nc2}]`);
    } else {
      const vaultHp = this.isTeamA ? matchState.vaultAHp : matchState.vaultBHp;
      this.pendingDefenderMove = planDefense(budget, vaultHp, this.roundHistory, nodes, this.isTeamA);
      commitHash = hashDefenderMove(this.pendingSalt, this.pendingDefenderMove);
      const m = this.pendingDefenderMove;
      this.log(`  Defend: g=[${m.g0},${m.g1},${m.g2}] repair=${m.repair} nc=[${m.nc0},${m.nc1},${m.nc2}]`);
    }

    const txHash = await commitMove(this.account, this.config.commitRevealAddress, this.config.matchId, commitHash);
    this.log(`  Committed: ${txHash}`);
    this.lastCommittedRound = round;
  }

  private async doReveal(round: number): Promise<void> {
    if (!this.pendingSalt) throw new Error("No pending salt");
    this.log(`Round ${round}: Revealing`);

    let txHash: string;
    if (this.config.agentRole === "attacker" && this.pendingAttackerMove) {
      txHash = await revealAttackerMove(this.account, this.config.commitRevealAddress, this.config.matchId, this.pendingSalt, this.pendingAttackerMove);
    } else if (this.config.agentRole === "defender" && this.pendingDefenderMove) {
      txHash = await revealDefenderMove(this.account, this.config.commitRevealAddress, this.config.matchId, this.pendingSalt, this.pendingDefenderMove);
    } else {
      throw new Error("No pending move");
    }
    this.log(`  Revealed: ${txHash}`);
    this.lastRevealedRound = round;

    try {
      const rm = await this.reader.getRoundMoves(this.config.matchId, round);
      if (rm.revealCount === 4) {
        this.roundHistory.push(rm);
        if (this.roundHistory.length > 3) this.roundHistory.shift();
      }
    } catch {}

    this.pendingSalt = null;
    this.pendingAttackerMove = null;
    this.pendingDefenderMove = null;
  }

  async run(): Promise<void> {
    this.log(`Starting Siege Agent (role=${this.config.agentRole}, match=${this.config.matchId})`);
    while (true) {
      try {
        const active = await this.tick();
        if (!active) break;
      } catch (err: any) {
        this.log(`Error: ${err.message}`);
      }
      await sleep(this.config.pollIntervalMs);
    }
    this.log("Agent stopped.");
  }
}
