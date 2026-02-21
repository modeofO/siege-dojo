"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "@starknet-react/core";
import { useMatchState, useRoundHistory, useMatchPlayers } from "@/lib/gameState";
import { generateSalt, computeAttackerCommitment, computeDefenderCommitment, storeSalt, storeMove, getSalt, getMove } from "@/lib/crypto";
import { commitMove, revealAttacker, revealDefender } from "@/lib/contracts";
import { VaultDisplay } from "@/components/VaultDisplay";
import { NodeMap } from "@/components/NodeMap";
import { PressurePointAllocator } from "@/components/PressurePointAllocator";
import { RoundHistory } from "@/components/RoundHistory";
import { MatchStatus } from "@/components/MatchStatus";
import { EndScreen } from "@/components/EndScreen";
import { Timer } from "@/components/Timer";

const COMMIT_DEADLINE_OFFSET = 120; // seconds from round start

export default function GamePage() {
  const params = useParams();
  const matchId = params.id as string;
  const { account, address } = useAccount();

  const { state, loading } = useMatchState(matchId);
  const history = useRoundHistory(matchId);
  const players = useMatchPlayers(matchId);

  // Determine team/role from on-chain match state
  const normalizedAddr = address?.toLowerCase();
  let YOUR_TEAM: 1 | 2 = 1;
  let YOUR_ROLE: "attacker" | "defender" = "attacker";
  if (players && normalizedAddr) {
    if (players.teamAAttacker?.toLowerCase() === normalizedAddr) {
      YOUR_TEAM = 1; YOUR_ROLE = "attacker";
    } else if (players.teamADefender?.toLowerCase() === normalizedAddr) {
      YOUR_TEAM = 1; YOUR_ROLE = "defender";
    } else if (players.teamBAttacker?.toLowerCase() === normalizedAddr) {
      YOUR_TEAM = 2; YOUR_ROLE = "attacker";
    } else if (players.teamBDefender?.toLowerCase() === normalizedAddr) {
      YOUR_TEAM = 2; YOUR_ROLE = "defender";
    }
  }

  // Attacker: 6 slots (3 pressure points + 3 nodes)
  // Defender: 7 slots (3 pressure points + repair + 3 nodes)
  const slotCount = YOUR_ROLE === "attacker" ? 6 : 7;
  const [allocations, setAllocations] = useState<number[]>(new Array(slotCount).fill(0));
  const [submitting, setSubmitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const budget = state
    ? YOUR_TEAM === 1 ? state.team1Budget : state.team2Budget
    : 10;

  const handleCommit = useCallback(async () => {
    if (!account || !state) return;
    const total = allocations.reduce((a, b) => a + b, 0);
    if (total !== budget) return;

    setSubmitting(true);
    try {
      const salt = generateSalt();
      storeSalt(matchId, state.round, salt);
      storeMove(matchId, state.round, allocations);

      let commitment: string;
      if (YOUR_ROLE === "attacker") {
        commitment = computeAttackerCommitment(
          salt, allocations[0], allocations[1], allocations[2],
          allocations[3], allocations[4], allocations[5]
        );
      } else {
        commitment = computeDefenderCommitment(
          salt, allocations[0], allocations[1], allocations[2],
          allocations[3], allocations[4], allocations[5], allocations[6]
        );
      }

      await commitMove(account, matchId, commitment);
      setCommitted(true);
    } catch (e) {
      console.error("Commit failed:", e);
    } finally {
      setSubmitting(false);
    }
  }, [account, state, allocations, budget, matchId]);

  const handleReveal = useCallback(async () => {
    if (!account || !state) return;
    setSubmitting(true);
    try {
      const salt = getSalt(matchId, state.round);
      const move = getMove(matchId, state.round);
      if (!salt || !move) throw new Error("Missing salt/move from localStorage");

      if (YOUR_ROLE === "attacker") {
        await revealAttacker(
          account, matchId, salt,
          [move[0].toString(), move[1].toString(), move[2].toString()],
          [move[3].toString(), move[4].toString(), move[5].toString()]
        );
      } else {
        await revealDefender(
          account, matchId, salt,
          [move[0].toString(), move[1].toString(), move[2].toString()],
          move[3].toString(),
          [move[4].toString(), move[5].toString(), move[6].toString()]
        );
      }
      setRevealed(true);
    } catch (e) {
      console.error("Reveal failed:", e);
    } finally {
      setSubmitting(false);
    }
  }, [account, state, matchId]);

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#6a6a7a] tracking-wider animate-pulse">LOADING MATCH...</div>
      </div>
    );
  }

  // End screen
  if (state.phase === "finished" && state.winner) {
    return (
      <EndScreen
        winner={state.winner as 1 | 2}
        yourTeam={YOUR_TEAM}
        history={history}
        team1Vault={state.team1Vault}
        team2Vault={state.team2Vault}
      />
    );
  }

  const yourVault = YOUR_TEAM === 1 ? state.team1Vault : state.team2Vault;
  const enemyVault = YOUR_TEAM === 1 ? state.team2Vault : state.team1Vault;
  const deadline = Math.floor(Date.now() / 1000) + COMMIT_DEADLINE_OFFSET; // placeholder

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Status bar */}
      <MatchStatus phase={state.phase} round={state.round} budget={budget} />

      {/* Fortresses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VaultDisplay label="Your Fortress" hp={yourVault} />
        <VaultDisplay label="Enemy Fortress" hp={enemyVault} isEnemy />
      </div>

      {/* Nodes */}
      <NodeMap nodes={state.nodes} />

      {/* Allocation (only during committing phase) */}
      {state.phase === "committing" && !committed && (
        <PressurePointAllocator
          role={YOUR_ROLE}
          budget={budget}
          allocations={allocations}
          onChange={setAllocations}
        />
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a]">
        <div>
          {state.phase === "committing" && !committed && (
            <button
              onClick={handleCommit}
              disabled={submitting || allocations.reduce((a, b) => a + b, 0) !== budget}
              className="px-6 py-2 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {submitting ? "COMMITTING..." : "COMMIT MOVE"}
            </button>
          )}
          {state.phase === "committing" && committed && (
            <span className="text-green-400 text-sm">✓ Move committed — waiting for others</span>
          )}
          {state.phase === "revealing" && !revealed && (
            <button
              onClick={handleReveal}
              disabled={submitting}
              className="px-6 py-2 bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700] rounded hover:bg-[#ffd700]/20 transition-colors text-sm disabled:opacity-30"
            >
              {submitting ? "REVEALING..." : "REVEAL MOVE"}
            </button>
          )}
          {state.phase === "revealing" && revealed && (
            <span className="text-green-400 text-sm">✓ Move revealed — waiting for resolution</span>
          )}
          {state.phase === "resolving" && (
            <span className="text-[#6a6a7a] text-sm">⟳ Resolving round...</span>
          )}
        </div>
        <div className="text-sm">
          Timer: <Timer deadline={deadline} />
        </div>
      </div>

      {/* Round history */}
      <RoundHistory history={history} yourTeam={YOUR_TEAM} />

      {/* Salt warning */}
      <div className="text-[10px] text-[#2a2a3a] text-center">
        ⚠ Your move salts are stored in localStorage. Clearing browser data before reveal = lost move.
      </div>
    </div>
  );
}
