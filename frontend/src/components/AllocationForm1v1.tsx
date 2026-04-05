// frontend/src/components/AllocationForm1v1.tsx
"use client";

import React from "react";
import type { NodeOwner } from "@/lib/gameState1v1";

interface AllocationForm1v1Props {
  budget: number;
  allocations: number[];
  onChange: (allocations: number[]) => void;
  onCommit: () => void;
  submitting: boolean;
  error: string;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
  isPlayerA: boolean;
}

const GATE_NAMES = ["East", "West", "Under."];
const NODE_NAMES = ["Forge", "Quarry", "Grove"];
const NODE_RESOURCES = ["Iron + Linen", "Stone + Wood", "Ember + Seeds"];

export function AllocationForm1v1({ budget, allocations, onChange, onCommit, submitting, error, nodes, isPlayerA }: AllocationForm1v1Props) {
  const trapCost = ((allocations[10] || 0) + (allocations[11] || 0) + (allocations[12] || 0)) * 2;
  const allocationTotal = allocations.slice(0, 10).reduce((a, b) => a + b, 0);
  const total = allocationTotal + trapCost;
  const remaining = budget - total;
  const budgetExact = remaining === 0;

  const myTeam: NodeOwner = isPlayerA ? "teamA" : "teamB";

  const handleChange = (index: number, value: number) => {
    const clamped = Math.max(0, value);
    const newAlloc = [...allocations];
    newAlloc[index] = clamped;
    const newTrapCost = ((newAlloc[10] || 0) + (newAlloc[11] || 0) + (newAlloc[12] || 0)) * 2;
    const newTotal = newAlloc.slice(0, 10).reduce((a, b) => a + b, 0) + newTrapCost;
    if (newTotal <= budget) {
      onChange(newAlloc);
    }
  };

  const handleTrapToggle = (nodeIndex: number) => {
    const trapIdx = 10 + nodeIndex;
    const newAlloc = [...allocations];
    if (newAlloc[trapIdx] === 1) {
      newAlloc[trapIdx] = 0;
    } else {
      newAlloc[trapIdx] = 1;
      newAlloc[7 + nodeIndex] = 0;
    }
    const newTrapCost = ((newAlloc[10] || 0) + (newAlloc[11] || 0) + (newAlloc[12] || 0)) * 2;
    const newTotal = newAlloc.slice(0, 10).reduce((a, b) => a + b, 0) + newTrapCost;
    if (newTotal <= budget) {
      onChange(newAlloc);
    }
  };

  return (
    <div className="p-4 space-y-3">
      {/* Budget header */}
      <div className="flex justify-between items-center">
        <span className="text-xs tracking-wider text-[#6a6a7a] uppercase">Deploy Orders</span>
        <span className={`text-sm font-bold ${remaining === 0 ? "text-green-400" : remaining < 0 ? "text-red-400" : "text-[#ffd700]"}`}>
          {remaining === 0 ? "BUDGET SPENT" : `${remaining} pts left`}
        </span>
      </div>

      {/* 2-column grid: Attack | Defense */}
      <div className="grid grid-cols-2 gap-3">
        {/* Column headers */}
        <div className="text-[10px] tracking-wider text-[#ff8800] uppercase font-bold border-b border-[#ff8800]/20 pb-1">
          ATTACK
        </div>
        <div className="text-[10px] tracking-wider text-[#00d4ff] uppercase font-bold border-b border-[#00d4ff]/20 pb-1">
          DEFENSE
        </div>

        {/* Gate rows: attack (0,1,2) paired with defense (3,4,5) */}
        {GATE_NAMES.map((name, gi) => (
          <React.Fragment key={gi}>
            {/* Attack column */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#e0e0e8] w-12 shrink-0">{name}</span>
              <button onClick={() => handleChange(gi, (allocations[gi] || 0) - 1)} disabled={(allocations[gi] || 0) <= 0}
                className="w-7 h-7 rounded bg-[#1a1a26] border border-[#2a2a3a] text-[#6a6a7a] hover:text-[#e0e0e8] hover:border-[#6a6a7a] disabled:opacity-20 text-sm">
                -
              </button>
              <input
                type="number"
                min={0}
                max={budget}
                value={allocations[gi] || 0}
                onChange={(e) => handleChange(gi, parseInt(e.target.value) || 0)}
                className="w-10 text-center bg-[#1a1a26] border border-[#2a2a3a] rounded text-sm py-0.5 text-[#ff8800]"
              />
              <button onClick={() => handleChange(gi, (allocations[gi] || 0) + 1)}
                className="w-7 h-7 rounded bg-[#1a1a26] border border-[#2a2a3a] text-[#6a6a7a] hover:text-[#e0e0e8] hover:border-[#6a6a7a] disabled:opacity-20 text-sm">
                +
              </button>
            </div>
            {/* Defense column */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#e0e0e8] w-12 shrink-0">{name}</span>
              <button onClick={() => handleChange(3 + gi, (allocations[3 + gi] || 0) - 1)} disabled={(allocations[3 + gi] || 0) <= 0}
                className="w-7 h-7 rounded bg-[#1a1a26] border border-[#2a2a3a] text-[#6a6a7a] hover:text-[#e0e0e8] hover:border-[#6a6a7a] disabled:opacity-20 text-sm">
                -
              </button>
              <input
                type="number"
                min={0}
                max={budget}
                value={allocations[3 + gi] || 0}
                onChange={(e) => handleChange(3 + gi, parseInt(e.target.value) || 0)}
                className="w-10 text-center bg-[#1a1a26] border border-[#2a2a3a] rounded text-sm py-0.5 text-[#00d4ff]"
              />
              <button onClick={() => handleChange(3 + gi, (allocations[3 + gi] || 0) + 1)}
                className="w-7 h-7 rounded bg-[#1a1a26] border border-[#2a2a3a] text-[#6a6a7a] hover:text-[#e0e0e8] hover:border-[#6a6a7a] disabled:opacity-20 text-sm">
                +
              </button>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Repair — full-width */}
      <div className="border-t border-[#2a2a3a] pt-3">
        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-wider text-[#6a6a7a] uppercase w-16 shrink-0">Repair</span>
          <button onClick={() => handleChange(6, (allocations[6] || 0) - 1)} disabled={(allocations[6] || 0) <= 0}
            className="w-7 h-7 rounded bg-[#1a1a26] border border-[#2a2a3a] text-[#6a6a7a] hover:text-[#e0e0e8] hover:border-[#6a6a7a] disabled:opacity-20 text-sm">
            -
          </button>
          <input
            type="number"
            min={0}
            max={3}
            value={allocations[6] || 0}
            onChange={(e) => handleChange(6, parseInt(e.target.value) || 0)}
            className="w-10 text-center bg-[#1a1a26] border border-[#2a2a3a] rounded text-sm py-0.5 text-[#66cc66]"
          />
          <button onClick={() => handleChange(6, (allocations[6] || 0) + 1)}
            className="w-7 h-7 rounded bg-[#1a1a26] border border-[#2a2a3a] text-[#6a6a7a] hover:text-[#e0e0e8] hover:border-[#6a6a7a] disabled:opacity-20 text-sm">
            +
          </button>
          <span className="text-[10px] text-[#6a6a7a]">max 3</span>
        </div>
      </div>

      {/* Nodes — 3-column grid with integrated traps */}
      <div className="border-t border-[#2a2a3a] pt-3">
        <div className="text-[10px] tracking-wider text-[#6a6a7a] uppercase font-bold mb-2">
          CONTESTED NODES
        </div>
        <div className="grid grid-cols-3 gap-2">
          {NODE_NAMES.map((name, ni) => {
            const nodeIdx = 7 + ni;
            const trapIdx = 10 + ni;
            const isTrapped = allocations[trapIdx] === 1;
            const canTrap = nodes[ni] === myTeam;

            return (
              <div key={ni} className="bg-[#1a1a26] rounded-lg p-2 space-y-1.5">
                <div className="text-xs text-[#e0e0e8] font-bold text-center">{name}</div>
                <div className="text-[10px] text-[#6a6a7a] text-center">{NODE_RESOURCES[ni]}</div>
                {isTrapped ? (
                  <div className="text-center text-[10px] text-[#ff3344] font-bold py-1">TRAPPED (2 pts)</div>
                ) : (
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => handleChange(nodeIdx, (allocations[nodeIdx] || 0) - 1)} disabled={(allocations[nodeIdx] || 0) <= 0}
                      className="w-7 h-7 rounded bg-[#0a0a0f] border border-[#2a2a3a] text-[#6a6a7a] hover:text-[#e0e0e8] hover:border-[#6a6a7a] disabled:opacity-20 text-sm">
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={budget}
                      value={allocations[nodeIdx] || 0}
                      onChange={(e) => handleChange(nodeIdx, parseInt(e.target.value) || 0)}
                      className="w-10 text-center bg-[#0a0a0f] border border-[#2a2a3a] rounded text-xs py-0.5"
                    />
                    <button onClick={() => handleChange(nodeIdx, (allocations[nodeIdx] || 0) + 1)}
                      className="w-7 h-7 rounded bg-[#0a0a0f] border border-[#2a2a3a] text-[#6a6a7a] hover:text-[#e0e0e8] hover:border-[#6a6a7a] disabled:opacity-20 text-sm">
                      +
                    </button>
                  </div>
                )}
                {canTrap && (
                  <button
                    onClick={() => handleTrapToggle(ni)}
                    className={`w-full py-1 text-[10px] rounded border transition-colors ${
                      isTrapped
                        ? "border-[#ff3344] bg-[#ff3344]/20 text-[#ff3344]"
                        : "border-[#2a2a3a] text-[#6a6a7a] hover:border-[#ff3344] hover:text-[#ff3344]"
                    }`}
                  >
                    {isTrapped ? "DISARM" : "TRAP (2 pts)"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Budget summary */}
      <div className="flex justify-between text-xs text-[#6a6a7a] pt-2 border-t border-[#2a2a3a]">
        <span>
          Points: {allocationTotal} + Traps: {trapCost} = {total} / {budget}
        </span>
        {remaining !== 0 && (
          <span className="text-[#ffd700]">Must use all {budget}</span>
        )}
      </div>

      {/* Commit button — full-width, prominent */}
      <button
        onClick={onCommit}
        disabled={submitting || !budgetExact}
        className={`w-full py-3 rounded font-bold tracking-wider text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
          budgetExact
            ? "bg-green-500/10 border-2 border-green-400 text-green-400 shadow-[0_0_12px_rgba(74,222,128,0.2)] hover:bg-green-500/20 hover:shadow-[0_0_20px_rgba(74,222,128,0.3)]"
            : remaining > 0
              ? "bg-[#ffd700]/10 border-2 border-[#ffd700]/40 text-[#ffd700]"
              : "bg-[#ff3344]/10 border-2 border-[#ff3344]/40 text-[#ff3344]"
        }`}
      >
        {submitting ? "SUBMITTING..." : "\u2694 COMMIT ORDERS \u2694"}
      </button>
      {error && (
        <div className="text-[#ff3344] text-xs text-center">{error}</div>
      )}
    </div>
  );
}
