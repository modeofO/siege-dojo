// frontend/src/app/match-1v1/[id]/page.tsx
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "@/app/providers";
import {
  useMatchState1v1,
  useRoundStatus1v1,
  useRoundHistory1v1,
  useCommitmentStatus1v1,
  useRoundModifiers1v1,
  MODIFIER_NAMES,
  MODIFIER_DESCRIPTIONS,
} from "@/lib/gameState1v1";
import type { RoundResult1v1 } from "@/lib/gameState1v1";
import {
  generateSalt,
  computeCommitment1v1,
  storeSalt1v1,
  storeMove1v1,
  getSalt1v1,
  getMove1v1,
} from "@/lib/crypto";
import { commitMove1v1, revealMove1v1 } from "@/lib/contracts1v1";
import { VaultDisplay } from "@/components/VaultDisplay";
import { AllocationForm1v1 } from "@/components/AllocationForm1v1";
import Link from "next/link";

export default function Match1v1Page() {
  const params = useParams();
  const matchId = params.id as string;
  const { account, address } = useAccount();

  const { state, loading, refresh } = useMatchState1v1(matchId);
  const history = useRoundHistory1v1(matchId);

  // Role detection
  const addrMatch = (a: string | undefined, b: string | undefined) => {
    if (!a || !b) return false;
    try { return BigInt(a) === BigInt(b); } catch { return false; }
  };

  let isPlayerA = false;
  let isPlayerB = false;
  let role: 0 | 1 = 0;
  if (state && address) {
    isPlayerA = addrMatch(state.playerA, address);
    isPlayerB = addrMatch(state.playerB, address);
    role = isPlayerA ? 0 : 1;
  }
  const roleFound = isPlayerA || isPlayerB;

  // Commitment status from chain
  const { committed, revealed } = useCommitmentStatus1v1(
    matchId,
    state?.round ?? 1,
    role,
  );

  // Round status for polling commit/reveal counts
  const roundStatus = useRoundStatus1v1(matchId, state?.round ?? 1);

  // Gate modifiers for current round
  const modifiers = useRoundModifiers1v1(matchId, state?.round ?? 1);

  // Allocations: [p0,p1,p2, g0,g1,g2, repair, nc0,nc1,nc2]
  const [allocations, setAllocations] = useState<number[]>(new Array(10).fill(0));
  const [submitting, setSubmitting] = useState(false);
  const [autoRevealing, setAutoRevealing] = useState(false);
  const [error, setError] = useState("");
  const revealAttempted = useRef(false);

  const budget = state
    ? isPlayerA ? state.budgetA : state.budgetB
    : 10;

  // Reset allocations on round change
  useEffect(() => {
    setAllocations(new Array(10).fill(0));
    revealAttempted.current = false;
    setAutoRevealing(false);
    setError("");
  }, [state?.round]);

  // Auto-reveal: when both committed & we haven't revealed yet
  useEffect(() => {
    if (
      !account || !state || !committed || revealed ||
      roundStatus.commitCount < 2 || revealAttempted.current || autoRevealing
    ) return;

    const salt = getSalt1v1(matchId, state.round);
    const move = getMove1v1(matchId, state.round);
    if (!salt || !move) return;

    revealAttempted.current = true;
    setAutoRevealing(true);

    (async () => {
      try {
        await revealMove1v1(
          account, matchId, salt,
          move[0].toString(), move[1].toString(), move[2].toString(),
          move[3].toString(), move[4].toString(), move[5].toString(),
          move[6].toString(),
          move[7].toString(), move[8].toString(), move[9].toString(),
        );
        void refresh();
      } catch (e) {
        console.error("Auto-reveal failed:", e);
        setError("Auto-reveal failed. Try refreshing.");
      } finally {
        setAutoRevealing(false);
      }
    })();
  }, [account, state, matchId, committed, revealed, roundStatus.commitCount, refresh, autoRevealing]);

  // Commit handler
  const handleCommit = useCallback(async () => {
    if (!account || !state) return;
    const total = allocations.reduce((a, b) => a + b, 0);
    if (total !== budget) return;

    setSubmitting(true);
    setError("");
    try {
      const salt = generateSalt();
      storeSalt1v1(matchId, state.round, salt);
      storeMove1v1(matchId, state.round, allocations);

      const commitment = computeCommitment1v1(
        salt,
        allocations[0], allocations[1], allocations[2],
        allocations[3], allocations[4], allocations[5],
        allocations[6],
        allocations[7], allocations[8], allocations[9],
      );

      await commitMove1v1(account, matchId, commitment);
      void refresh();
    } catch (e) {
      console.error("Commit failed:", e);
      setError(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setSubmitting(false);
    }
  }, [account, state, allocations, budget, matchId, refresh]);

  // Loading
  if (loading || !state) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#6a6a7a] tracking-wider animate-pulse">LOADING MATCH...</div>
      </div>
    );
  }

  // Not a player
  if (address && !roleFound) {
    return (
      <div className="max-w-lg mx-auto mt-20 space-y-4 text-center">
        <div className="text-[#ff3344] text-lg font-bold">NOT A PLAYER IN THIS MATCH</div>
        <div className="text-[#6a6a7a] text-sm">
          Your address: <span className="font-mono text-[#e0e0e8]">{address}</span>
        </div>
        <div className="text-[#6a6a7a] text-xs space-y-1">
          <div>Player A: <span className="font-mono">{state.playerA}</span></div>
          <div>Player B: <span className="font-mono">{state.playerB}</span></div>
        </div>
      </div>
    );
  }

  // End screen
  if (state.phase === "finished" && state.winner !== null) {
    const didWin = (state.winner === 1 && isPlayerA) || (state.winner === 2 && isPlayerB);
    const isDraw = state.winner === 0;
    return (
      <div className="fixed inset-0 bg-[#0a0a0f]/95 z-50 flex items-center justify-center">
        <div className="text-center space-y-8 max-w-md">
          <div className="space-y-2">
            <div className={`text-6xl font-bold tracking-widest ${isDraw ? "text-[#ffd700]" : didWin ? "text-[#00d4ff]" : "text-[#ff3344]"}`}>
              {isDraw ? "DRAW" : didWin ? "VICTORY" : "DEFEAT"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="border border-[#2a2a3a] rounded p-3 bg-[#12121a]">
              <div className="text-[#6a6a7a] text-xs mb-1">Your Vault</div>
              <div className="text-xl font-bold">{isPlayerA ? state.vaultAHp : state.vaultBHp} HP</div>
            </div>
            <div className="border border-[#2a2a3a] rounded p-3 bg-[#12121a]">
              <div className="text-[#6a6a7a] text-xs mb-1">Enemy Vault</div>
              <div className="text-xl font-bold">{isPlayerA ? state.vaultBHp : state.vaultAHp} HP</div>
            </div>
          </div>
          <div className="text-[#6a6a7a] text-xs">{history.length} rounds played</div>
          <Link href="/" className="inline-block px-8 py-3 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors tracking-wider text-sm">
            RETURN HOME
          </Link>
        </div>
      </div>
    );
  }

  const yourVault = isPlayerA ? state.vaultAHp : state.vaultBHp;
  const enemyVault = isPlayerA ? state.vaultBHp : state.vaultAHp;

  // Phase status text
  let phaseText = "";
  if (committed && !revealed && roundStatus.commitCount < 2) {
    phaseText = "Waiting for opponent to commit...";
  } else if (committed && !revealed && roundStatus.commitCount >= 2) {
    phaseText = autoRevealing ? "Auto-revealing your move..." : "Preparing to reveal...";
  } else if (committed && revealed && roundStatus.revealCount < 2) {
    phaseText = "Waiting for opponent to reveal...";
  } else if (state.phase === "resolving") {
    phaseText = "Resolving round...";
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border border-[#2a2a3a] rounded-lg p-3 bg-[#12121a]">
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold">ROUND {state.round}</span>
          <span className="text-xs text-[#6a6a7a]">1v1 Match #{matchId}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#6a6a7a]">You: <span className="text-[#00d4ff]">Player {isPlayerA ? "A" : "B"}</span></span>
          <span className="text-sm">Budget: <span className="text-[#ffd700] font-bold">{budget}</span></span>
        </div>
      </div>

      {/* Vaults */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VaultDisplay label="Your Vault" hp={yourVault} maxHp={50} />
        <VaultDisplay label="Enemy Vault" hp={enemyVault} maxHp={50} isEnemy />
      </div>

      {/* Nodes — inline rendering for 1v1 (uses teamA/teamB instead of team1/team2) */}
      <div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a]">
        <div className="text-xs tracking-wider text-[#6a6a7a] uppercase mb-3">Resource Nodes</div>
        <div className="flex justify-around items-center">
          {state.nodes.map((owner, i) => {
            const color = owner === "teamA"
              ? "bg-[#00d4ff] border-[#00d4ff]"
              : owner === "teamB"
                ? "bg-[#ff3344] border-[#ff3344]"
                : "bg-[#6a6a7a] border-[#6a6a7a]";
            const label = owner === "neutral" ? "Neutral" : owner === (isPlayerA ? "teamA" : "teamB") ? "Yours" : "Enemy";
            return (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className={`w-6 h-6 rounded-full border-2 ${color} opacity-80`} />
                <span className="text-xs text-[#6a6a7a]">Node {i + 1}</span>
                <span className="text-[10px] text-[#6a6a7a]">({label})</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gate Modifiers */}
      <div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a]">
        <div className="text-xs tracking-wider text-[#6a6a7a] uppercase mb-3">Gate Conditions</div>
        <div className="grid grid-cols-3 gap-4">
          {["East Gate", "West Gate", "Underground"].map((gateName, i) => {
            const mod = modifiers[i];
            const modName = MODIFIER_NAMES[mod] || "Normal";
            const modDesc = MODIFIER_DESCRIPTIONS[mod] || "";
            const modColor = mod === 0 ? "text-[#6a6a7a]"
              : mod === 1 ? "text-[#ffd700]"
              : mod === 2 ? "text-[#00d4ff]"
              : mod === 3 ? "text-[#ff3344]"
              : "text-[#ff8800]";
            return (
              <div key={i} className="text-center space-y-1">
                <div className="text-xs text-[#6a6a7a]">{gateName}</div>
                <div className={`text-sm font-bold ${modColor}`}>{modName}</div>
                {modDesc && <div className="text-[10px] text-[#6a6a7a]">{modDesc}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Allocation form — only during commit phase, before committed */}
      {state.phase === "committing" && !committed && (
        <AllocationForm1v1
          budget={budget}
          allocations={allocations}
          onChange={setAllocations}
        />
      )}

      {/* Action / status */}
      <div className="flex items-center justify-between border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a]">
        <div>
          {state.phase === "committing" && !committed && (
            <button
              onClick={handleCommit}
              disabled={submitting || allocations.reduce((a, b) => a + b, 0) !== budget}
              className="px-6 py-2 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {submitting ? "SUBMITTING..." : "SUBMIT MOVES"}
            </button>
          )}
          {phaseText && (
            <span className="text-[#6a6a7a] text-sm animate-pulse">{phaseText}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">{error}</div>
      )}

      {/* Round history */}
      {history.length > 0 && (
        <div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a]">
          <div className="text-xs tracking-wider text-[#6a6a7a] uppercase mb-3">Round History</div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {history.map((r: RoundResult1v1) => {
              const myAtk = isPlayerA ? r.aAttack : r.bAttack;
              const myDef = isPlayerA ? r.aDefense : r.bDefense;
              const theirAtk = isPlayerA ? r.bAttack : r.aAttack;
              const dmgDealt = isPlayerA ? r.damageToB : r.damageToA;
              const dmgTaken = isPlayerA ? r.damageToA : r.damageToB;

              return (
                <div key={r.round} className="text-xs py-2 border-b border-[#1a1a26] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#6a6a7a]">R{r.round}</span>
                    <span>
                      <span className="text-green-400">+{dmgDealt} dealt</span>
                      {" / "}
                      <span className="text-red-400">-{dmgTaken} taken</span>
                    </span>
                  </div>
                  <div className="text-[#6a6a7a]">
                    You: atk [{myAtk.join(",")}] def [{myDef.join(",")}]
                    {" | "}
                    Them: atk [{theirAtk.join(",")}]
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {history.length === 0 && (
        <div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a]">
          <div className="text-xs tracking-wider text-[#6a6a7a] uppercase mb-2">Round History</div>
          <div className="text-sm text-[#6a6a7a]">No rounds played yet</div>
        </div>
      )}

      <div className="text-[10px] text-[#2a2a3a] text-center">
        Move data stored in localStorage until revealed. Auto-reveal triggers when both players commit.
      </div>
    </div>
  );
}
